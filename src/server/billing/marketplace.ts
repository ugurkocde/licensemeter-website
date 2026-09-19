import { randomUUID } from "node:crypto";

import {
  createRemoteJWKSet,
  decodeJwt,
  jwtVerify,
  type JWTVerifyGetKey,
} from "jose";
import { z } from "zod";

import { env } from "~/env";
import type {
  EntitlementEvent,
  EntitlementOwner,
} from "~/server/billing/entitlementWrites";
import type { EntitlementStatus, PaidPlan } from "~/server/types";

/**
 * Microsoft Marketplace transactable SaaS offer: SaaS Fulfillment API v2.
 *
 * Every endpoint, header, payload and claim below is taken from the official
 * documentation, cited next to the call:
 * - Subscription APIs: https://learn.microsoft.com/partner-center/marketplace-offers/pc-saas-fulfillment-subscription-api
 * - Operations APIs: https://learn.microsoft.com/partner-center/marketplace-offers/pc-saas-fulfillment-operations-api
 * - Webhook: https://learn.microsoft.com/partner-center/marketplace-offers/pc-saas-fulfillment-webhook
 * - App registration and token: https://learn.microsoft.com/partner-center/marketplace-offers/pc-saas-registration
 * - Landing page: https://learn.microsoft.com/partner-center/marketplace-offers/azure-ad-transactable-saas-landing-page
 */

const API_BASE = "https://marketplaceapi.microsoft.com/api/saas/subscriptions";
/** "Use 2018-08-31." on every v2 endpoint. */
const API_VERSION = "2018-08-31";
/**
 * Resource id of the Marketplace SaaS API. It is the scope of the publisher
 * token (pc-saas-registration) and the `appid` or `azp` of the token Microsoft
 * sends to the webhook (pc-saas-fulfillment-webhook#securing-your-webhooks).
 */
export const MARKETPLACE_RESOURCE_ID = "20e940b3-4c77-4b0b-9a53-9e16a1b010a7";

/** Client tenants included in the MSP plan when the offer reports no quantity. */
const MSP_INCLUDED_TENANTS = 10;
/**
 * Term dates exist only once Microsoft has finished activating. A trial that
 * was just activated is granted this long, and the daily reconcile replaces it
 * with the real term.
 */
const PROVISIONAL_TRIAL_MS = 3 * 86_400_000;
const DAY_MS = 86_400_000;

// --- plan mapping ------------------------------------------------------------

/** Partner Center plan ids, from MARKETPLACE_PLAN_PRO and MARKETPLACE_PLAN_MSP. */
export const marketplacePlanIds = (): Record<PaidPlan, string> => ({
  pro: env.MARKETPLACE_PLAN_PRO ?? "pro",
  msp: env.MARKETPLACE_PLAN_MSP ?? "msp",
});

/** The paid plan behind a Partner Center plan id, or null for one we do not sell. */
export const planForMarketplaceId = (
  planId: string | null | undefined,
): PaidPlan | null => {
  if (!planId) return null;
  const ids = marketplacePlanIds();
  if (planId === ids.pro) return "pro";
  if (planId === ids.msp) return "msp";
  return null;
};

// --- schemas -----------------------------------------------------------------

// "ISVs should avoid strict deserialization of the Webhook schema. Microsoft
// reserves the right to expand the schema in future." Every object is loose and
// only the fields read here are declared.
const party = z
  .object({
    emailId: z.string().nullish(),
    tenantId: z.string().nullish(),
  })
  .passthrough()
  .nullish();

/** The subscription object of Get subscription, Resolve and the webhook. */
export const fulfillmentSubscriptionSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().nullish(),
    offerId: z.string().nullish(),
    planId: z.string().nullish(),
    // "is empty if plan is not per seat": the samples show both "" and a number.
    quantity: z.union([z.number(), z.string()]).nullish(),
    beneficiary: party,
    purchaser: party,
    // The samples pad the value with spaces (" Subscribed ").
    saasSubscriptionStatus: z.string().transform((s) => s.trim()),
    term: z
      .object({
        startDate: z.string().nullish(),
        endDate: z.string().nullish(),
        termUnit: z.string().nullish(),
      })
      .passthrough()
      .nullish(),
    // "Optional field: if not returned, the value is false."
    isFreeTrial: z.boolean().nullish(),
    autoRenew: z.boolean().nullish(),
  })
  .passthrough();
export type FulfillmentSubscription = z.infer<
  typeof fulfillmentSubscriptionSchema
>;

const resolvedSubscriptionSchema = z
  .object({
    id: z.string().min(1),
    subscriptionName: z.string().nullish(),
    offerId: z.string().nullish(),
    planId: z.string().nullish(),
    quantity: z.union([z.number(), z.string()]).nullish(),
    subscription: fulfillmentSubscriptionSchema,
  })
  .passthrough();
export type ResolvedSubscription = z.infer<typeof resolvedSubscriptionSchema>;

const operationSchema = z
  .object({
    id: z.string().nullish(),
    subscriptionId: z.string().nullish(),
    planId: z.string().nullish(),
    quantity: z.union([z.number(), z.string()]).nullish(),
    action: z.string().nullish(),
    status: z.string().nullish(),
  })
  .passthrough();
export type FulfillmentOperation = z.infer<typeof operationSchema>;

/**
 * Webhook body (pc-saas-fulfillment-webhook). `id` is the operation id, the
 * value the operations API expects. Nothing else in it is trusted for state.
 */
export const webhookPayloadSchema = z
  .object({
    id: z.string().min(1).max(128),
    subscriptionId: z.string().min(1).max(128),
    action: z.string().min(1).max(64),
  })
  .passthrough();
export type WebhookPayload = z.infer<typeof webhookPayloadSchema>;

// --- publisher token ---------------------------------------------------------

/** A failed call to Microsoft. Carries the status, never a token or a body. */
export class MarketplaceApiError extends Error {
  constructor(
    readonly operation: string,
    readonly status: number,
  ) {
    super(`Marketplace ${operation} failed with HTTP ${status}`);
    this.name = "MarketplaceApiError";
  }
}

const config = () => {
  const tenantId = env.MARKETPLACE_TENANT_ID;
  const clientId = env.MARKETPLACE_CLIENT_ID;
  const clientSecret = env.MARKETPLACE_CLIENT_SECRET;
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error("Marketplace is not configured");
  }
  return { tenantId, clientId, clientSecret };
};

let cachedToken: { value: string; expiresAt: number } | null = null;

/** For tests: forget the cached publisher token. */
export const resetMarketplaceTokenCache = () => {
  cachedToken = null;
};

/**
 * Publisher authorization token, client credentials against the v2.0 endpoint
 * of the tenant named in the offer's technical configuration.
 * https://learn.microsoft.com/partner-center/marketplace-offers/pc-saas-registration#get-the-token-with-an-http-post
 * "This token is only valid for one hour": cached until a minute before expiry.
 */
export async function getPublisherToken(now = Date.now()): Promise<string> {
  if (cachedToken && cachedToken.expiresAt - 60_000 > now) {
    return cachedToken.value;
  }
  const { tenantId, clientId, clientSecret } = config();
  const res = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
        scope: `${MARKETPLACE_RESOURCE_ID}/.default`,
      }),
      cache: "no-store",
    },
  );
  if (!res.ok) throw new MarketplaceApiError("token", res.status);
  const body = z
    .object({
      access_token: z.string().min(1),
      // The documented sample returns the number as a string ("3600").
      expires_in: z.coerce.number().positive(),
    })
    .passthrough()
    .parse(await res.json());
  cachedToken = {
    value: body.access_token,
    expiresAt: now + body.expires_in * 1000,
  };
  return cachedToken.value;
}

// --- fulfillment client ------------------------------------------------------

type CallOptions = {
  method: "GET" | "POST" | "PATCH";
  path: string;
  headers?: Record<string, string>;
  body?: unknown;
};

/**
 * Request headers shared by every fulfillment call: content-type,
 * x-ms-requestid, x-ms-correlationid and the publisher bearer token.
 */
const call = async (operation: string, opts: CallOptions) => {
  const token = await getPublisherToken();
  const res = await fetch(
    `${API_BASE}${opts.path}?api-version=${API_VERSION}`,
    {
      method: opts.method,
      headers: {
        "content-type": "application/json",
        "x-ms-requestid": randomUUID(),
        "x-ms-correlationid": randomUUID(),
        authorization: `Bearer ${token}`,
        ...opts.headers,
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      cache: "no-store",
    },
  );
  if (!res.ok) throw new MarketplaceApiError(operation, res.status);
  return res;
};

const segment = (id: string) => encodeURIComponent(id);

/**
 * Landing page token, as it arrives in the `token` query parameter. The docs
 * require the URL-decoded value ("ab%2Bcd%2Fef" is sent as "ab+cd/ef"). The
 * framework has decoded it once already; a literal "+" that a proxy left
 * unencoded arrives as a space, which a purchase token never contains.
 */
export const normalizePurchaseToken = (
  raw: string | null | undefined,
): string | null => {
  const token = raw?.trim().replace(/ /g, "+");
  if (!token || token.length > 4096 || /[\r\n]/.test(token)) return null;
  return token;
};

/**
 * Resolve a purchased subscription: POST /resolve with the purchase token in
 * `x-ms-marketplace-token`. 400 means the token is missing, malformed, invalid
 * or expired (it lives 24 hours).
 * https://learn.microsoft.com/partner-center/marketplace-offers/pc-saas-fulfillment-subscription-api#resolve-a-purchased-subscription
 */
export async function resolveSubscription(
  purchaseToken: string,
): Promise<ResolvedSubscription> {
  const res = await call("resolve", {
    method: "POST",
    path: "/resolve",
    headers: { "x-ms-marketplace-token": purchaseToken },
  });
  return resolvedSubscriptionSchema.parse(await res.json());
}

/**
 * Activate a subscription: POST /{subscriptionId}/activate. The customer is not
 * billed until this succeeds. 200 has no body, and the status may take a few
 * minutes to read Subscribed.
 * https://learn.microsoft.com/partner-center/marketplace-offers/pc-saas-fulfillment-subscription-api#activate-a-subscription
 */
export async function activateSubscription(
  subscriptionId: string,
): Promise<void> {
  await call("activate", {
    method: "POST",
    path: `/${segment(subscriptionId)}/activate`,
  });
}

/**
 * Get subscription: GET /{subscriptionId}. The authoritative state of one
 * subscription. 404 when Microsoft does not know the id.
 * https://learn.microsoft.com/partner-center/marketplace-offers/pc-saas-fulfillment-subscription-api#get-subscription
 */
export async function getSubscription(
  subscriptionId: string,
): Promise<FulfillmentSubscription> {
  const res = await call("getSubscription", {
    method: "GET",
    path: `/${segment(subscriptionId)}`,
  });
  return fulfillmentSubscriptionSchema.parse(await res.json());
}

/**
 * Get operation status: GET /{subscriptionId}/operations/{operationId}. The
 * webhook doc requires this call "to validate and authorize the webhook call
 * and payload data before taking action". Null when Microsoft answers 404.
 * https://learn.microsoft.com/partner-center/marketplace-offers/pc-saas-fulfillment-operations-api#get-operation-status
 */
export async function getOperation(
  subscriptionId: string,
  operationId: string,
): Promise<FulfillmentOperation | null> {
  try {
    const res = await call("getOperation", {
      method: "GET",
      path: `/${segment(subscriptionId)}/operations/${segment(operationId)}`,
    });
    return operationSchema.parse(await res.json());
  } catch (err) {
    if (err instanceof MarketplaceApiError && err.status === 404) return null;
    throw err;
  }
}

/**
 * Update the status of an operation: PATCH
 * /{subscriptionId}/operations/{operationId} with "Success" or "Failure".
 * 409 means a newer update is already fulfilled, which needs no further action.
 * https://learn.microsoft.com/partner-center/marketplace-offers/pc-saas-fulfillment-operations-api#update-the-status-of-an-operation
 */
export async function acknowledgeOperation(
  subscriptionId: string,
  operationId: string,
  status: "Success" | "Failure",
): Promise<void> {
  try {
    await call("acknowledgeOperation", {
      method: "PATCH",
      path: `/${segment(subscriptionId)}/operations/${segment(operationId)}`,
      body: { status },
    });
  } catch (err) {
    if (err instanceof MarketplaceApiError && err.status === 409) return;
    throw err;
  }
}

// --- mapping -----------------------------------------------------------------

const numeric = (value: number | string | null | undefined): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : null;
};

const dateOrNull = (value: string | null | undefined): Date | null => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * Webhook actions that arrive while the change is still "InProgress", so Get
 * subscription still reports the old plan, quantity or status. They are also
 * the three actions the operations doc asks to acknowledge.
 */
export const PENDING_ACTIONS = [
  "ChangePlan",
  "ChangeQuantity",
  "Reinstate",
] as const;
export type PendingAction = (typeof PENDING_ACTIONS)[number];

export const isPendingAction = (action: string): action is PendingAction =>
  (PENDING_ACTIONS as readonly string[]).includes(action);

/**
 * The state a subscription has once a pending operation is accepted. The new
 * plan or quantity comes from Get operation (read from Microsoft with the
 * publisher token), never from the webhook body.
 */
export const withOperation = (
  subscription: FulfillmentSubscription,
  operation: FulfillmentOperation,
): FulfillmentSubscription => {
  switch (operation.action) {
    case "ChangePlan":
      return { ...subscription, planId: operation.planId ?? null };
    case "ChangeQuantity":
      return { ...subscription, quantity: operation.quantity ?? null };
    case "Reinstate":
      return { ...subscription, saasSubscriptionStatus: "Subscribed" };
    default:
      return subscription;
  }
};

export type EventMeta = {
  owner: EntitlementOwner;
  eventId: string;
  type: string;
  occurredAt: Date;
  /**
   * Activate just answered 200. Microsoft may keep reporting
   * PendingFulfillmentStart for a few minutes; treat it as Subscribed.
   */
  activated?: boolean;
};

/**
 * Pure mapper from a fulfillment subscription to the neutral event. Null when
 * the plan id is not one we sell or the status is not one the docs list
 * (PendingFulfillmentStart, Subscribed, Suspended, Unsubscribed).
 */
export function subscriptionToEvent(
  subscription: FulfillmentSubscription,
  meta: EventMeta,
): EntitlementEvent | null {
  const plan = planForMarketplaceId(subscription.planId);
  if (!plan) return null;

  const trial = subscription.isFreeTrial === true;
  // "endDate: this is the last day the subscription is valid", so access runs
  // to the end of that day.
  const lastDay = dateOrNull(subscription.term?.endDate);
  const termEnd = lastDay ? new Date(lastDay.getTime() + DAY_MS) : null;

  let status: EntitlementStatus;
  let periodEnd = termEnd;
  switch (subscription.saasSubscriptionStatus) {
    case "Subscribed":
      status = trial ? "trialing" : "active";
      break;
    case "PendingFulfillmentStart":
      // Purchased, not activated, not billed: grants nothing until Activate.
      status = meta.activated ? (trial ? "trialing" : "active") : "suspended";
      break;
    case "Suspended":
      status = "suspended";
      break;
    case "Unsubscribed":
      // "The customer loses access to the SaaS subscription on the Microsoft
      // side immediately after cancellation."
      status = "canceled";
      periodEnd = null;
      break;
    default:
      return null;
  }

  if (status === "trialing" && !periodEnd) {
    periodEnd = new Date(meta.occurredAt.getTime() + PROVISIONAL_TRIAL_MS);
  }

  const seats = numeric(subscription.quantity);
  return {
    provider: "marketplace",
    eventId: meta.eventId,
    type: meta.type,
    occurredAt: meta.occurredAt,
    owner: meta.owner,
    plan,
    status,
    quantity:
      plan === "pro"
        ? 1
        : Math.max(seats ?? MSP_INCLUDED_TENANTS, MSP_INCLUDED_TENANTS),
    trialEnd: status === "trialing" ? periodEnd : null,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: status === "active" && subscription.autoRenew === false,
    providerSubscriptionId: subscription.id,
    providerCustomerId:
      subscription.beneficiary?.tenantId ??
      subscription.purchaser?.tenantId ??
      null,
  };
}

// --- webhook token -----------------------------------------------------------

export type WebhookTokenResult =
  | { ok: true }
  | {
      ok: false;
      reason: "missing" | "invalid" | "wrongTenant" | "wrongCaller";
    };

export type WebhookTokenOptions = {
  /** Entra tenant id and application id from the offer's technical configuration. */
  tenantId: string;
  clientId: string;
  /** For tests: a local key set instead of the Entra signing keys. */
  keys?: JWTVerifyGetKey;
  now?: Date;
};

const jwksCache = new Map<string, JWTVerifyGetKey>();
const remoteKeys = (url: string): JWTVerifyGetKey => {
  let keys = jwksCache.get(url);
  if (!keys) {
    keys = createRemoteJWKSet(new URL(url));
    jwksCache.set(url, keys);
  }
  return keys;
};

/**
 * Validates the bearer token Microsoft sends to the webhook.
 * https://learn.microsoft.com/partner-center/marketplace-offers/pc-saas-fulfillment-webhook#securing-your-webhooks
 * - `aud` is the Entra application id from the offer's technical configuration;
 * - `tid` is the Entra tenant id from the offer's technical configuration;
 * - `appid` or `azp` (the token carries one of the two) is the Marketplace SaaS
 *   API resource id.
 * Signature, issuer and expiry follow the access token guidance the webhook doc
 * points to: https://learn.microsoft.com/entra/identity-platform/access-tokens#validate-tokens
 * The issuer is `https://sts.windows.net/{tid}/` for a v1.0 token (the one that
 * carries `appid`) and `https://login.microsoftonline.com/{tid}/v2.0` for a
 * v2.0 token (the one that carries `azp`); the signing keys come from the
 * tenant's discovery keys endpoint of the same version.
 */
export async function verifyWebhookToken(
  authorization: string | null | undefined,
  opts: WebhookTokenOptions,
): Promise<WebhookTokenResult> {
  const token = /^Bearer\s+(\S+)$/i.exec(authorization ?? "")?.[1];
  if (!token) return { ok: false, reason: "missing" };

  const tenant = encodeURIComponent(opts.tenantId);
  const v1Issuer = `https://sts.windows.net/${opts.tenantId}/`;
  const v2Issuer = `https://login.microsoftonline.com/${opts.tenantId}/v2.0`;

  let claims;
  try {
    // Only chooses between two fixed key URLs of our own tenant; every claim
    // is verified below.
    const unverifiedIssuer = decodeJwt(token).iss;
    const keys =
      opts.keys ??
      remoteKeys(
        unverifiedIssuer === v1Issuer
          ? `https://login.microsoftonline.com/${tenant}/discovery/keys`
          : `https://login.microsoftonline.com/${tenant}/discovery/v2.0/keys`,
      );
    const verified = await jwtVerify(token, keys, {
      issuer: [v1Issuer, v2Issuer],
      audience: opts.clientId,
      algorithms: ["RS256"],
      requiredClaims: ["exp"],
      clockTolerance: 60,
      currentDate: opts.now,
    });
    claims = verified.payload;
  } catch {
    return { ok: false, reason: "invalid" };
  }

  if (claims.tid !== opts.tenantId) return { ok: false, reason: "wrongTenant" };
  const caller = claims.appid ?? claims.azp;
  if (caller !== MARKETPLACE_RESOURCE_ID) {
    return { ok: false, reason: "wrongCaller" };
  }
  return { ok: true };
}

/** verifyWebhookToken against the configured Marketplace app. */
export const verifyConfiguredWebhookToken = (
  authorization: string | null | undefined,
): Promise<WebhookTokenResult> => {
  const { tenantId, clientId } = config();
  return verifyWebhookToken(authorization, { tenantId, clientId });
};
