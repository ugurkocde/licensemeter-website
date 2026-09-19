import { createHmac, timingSafeEqual } from "node:crypto";

import { eq } from "drizzle-orm";
import { z } from "zod";

import { env } from "~/env";
import {
  applyEntitlementEvent,
  ownerRef,
  parseOwnerRef,
  type ApplyResult,
  type EntitlementEvent,
  type EntitlementOwner,
} from "~/server/billing/entitlementWrites";
import { db } from "~/server/db";
import { entitlements, mspAccounts, tenants } from "~/server/db/schema";
import { entitlementOf } from "~/server/entitlement";
import { notifyOps } from "~/server/ops";
import type { EntitlementStatus, PaidPlan, PlanInterval } from "~/server/types";

/**
 * Polar (card payments, merchant of record): a small fetch client, the product
 * mapping and the mapper from a Polar subscription to the neutral
 * EntitlementEvent. No SDK. Field names follow the public OpenAPI document
 * (version 2026-04) at https://polar.sh/docs/openapi.json.
 */

// --- products ----------------------------------------------------------------

export type PolarProduct = { plan: PaidPlan; interval: PlanInterval };

/** Client tenants included in the MSP base price. */
export const MSP_INCLUDED_TENANTS = 10;

/** Length of the trial offered to an owner who never had a paid plan. */
export const TRIAL_DAYS = 30;

const productTable = (): [string | undefined, PolarProduct][] => [
  [env.POLAR_PRODUCT_PRO_MONTH, { plan: "pro", interval: "month" }],
  [env.POLAR_PRODUCT_PRO_YEAR, { plan: "pro", interval: "year" }],
  [env.POLAR_PRODUCT_MSP_MONTH, { plan: "msp", interval: "month" }],
  [env.POLAR_PRODUCT_MSP_YEAR, { plan: "msp", interval: "year" }],
];

/** The Polar product id configured for a plan and interval, or null. */
export const polarProductId = (product: PolarProduct): string | null =>
  productTable().find(
    ([, p]) => p.plan === product.plan && p.interval === product.interval,
  )?.[0] ?? null;

/** The plan and interval of a Polar product id, or null when it is not ours. */
export const polarProductOf = (productId: string): PolarProduct | null =>
  productTable().find(([id]) => Boolean(id) && id === productId)?.[1] ?? null;

// --- payloads ----------------------------------------------------------------

const timestamp = z.string().datetime({ offset: true });

/**
 * The fields of a Polar Subscription this app reads. Everything else passes
 * through unvalidated so a new Polar field never breaks the webhook.
 */
export const polarSubscriptionSchema = z
  .object({
    id: z.string().min(1),
    status: z.string().min(1),
    product_id: z.string().min(1),
    customer_id: z.string().min(1),
    customer: z
      .object({ external_id: z.string().nullish() })
      .passthrough()
      .nullish(),
    metadata: z.record(z.unknown()).nullish(),
    /** Null for a product without seat-based pricing. */
    seats: z.number().int().nullish(),
    current_period_end: timestamp.nullish(),
    trial_end: timestamp.nullish(),
    cancel_at_period_end: z.boolean(),
    ended_at: timestamp.nullish(),
  })
  .passthrough();

export type PolarSubscription = z.infer<typeof polarSubscriptionSchema>;

/** The webhook envelope: `type`, `timestamp` and the resource in `data`. */
export const polarWebhookSchema = z.object({
  type: z.string().min(1),
  timestamp,
  data: z.unknown(),
});

/** Every subscription event carries the full Subscription in `data`. */
export const POLAR_SUBSCRIPTION_EVENTS: ReadonlySet<string> = new Set([
  "subscription.created",
  "subscription.updated",
  "subscription.active",
  "subscription.canceled",
  "subscription.uncanceled",
  "subscription.revoked",
  "subscription.past_due",
  "subscription.cycled",
  "subscription.paused",
  "subscription.resumed",
]);

/** Checkout metadata key holding the owner reference; Polar copies it to the subscription. */
export const OWNER_METADATA_KEY = "owner_ref";

// --- mapping -----------------------------------------------------------------

/**
 * Polar status to the neutral status. "incomplete" is absent on purpose: the
 * first payment is still being processed, so there is nothing to record yet.
 */
const STATUS: Record<string, EntitlementStatus> = {
  trialing: "trialing",
  active: "active",
  past_due: "past_due",
  canceled: "canceled",
  unpaid: "suspended",
  paused: "suspended",
  incomplete_expired: "suspended",
};

export type PolarIgnoreReason =
  | "incomplete"
  | "unknownStatus"
  | "unknownProduct"
  | "unknownOwner"
  | "ownerPlanMismatch";

export type PolarMapResult =
  | { ok: true; event: EntitlementEvent }
  | { ok: false; reason: PolarIgnoreReason; detail: string };

export type PolarEventMeta = Pick<
  EntitlementEvent,
  "eventId" | "type" | "occurredAt"
>;

const dateOrNull = (value: string | null | undefined): Date | null =>
  value ? new Date(value) : null;

/**
 * The owner a subscription was bought for. The checkout metadata is read
 * first because it belongs to this one subscription; the customer's external
 * id is the fallback. Polar keeps one customer per email address, so a person
 * paying for two owners can end up with both subscriptions on the customer of
 * the first, and only the metadata still tells them apart.
 */
const ownerOf = (sub: PolarSubscription): EntitlementOwner | null =>
  parseOwnerRef(sub.metadata?.[OWNER_METADATA_KEY]) ??
  parseOwnerRef(sub.customer?.external_id);

/**
 * Pure mapper from a Polar subscription to the neutral event. Anything it
 * cannot place with certainty (a product that is not ours, an owner it cannot
 * parse, a Pro plan on an MSP account or the reverse) is reported, never
 * guessed.
 *
 * Quantity: Pro always covers one workspace. The MSP products are modelled as
 * seat-based, where `seats` is the total number of client tenants covered, the
 * included ten among them; the floor keeps the included ten even if Polar
 * reports fewer seats or none at all.
 */
export function entitlementEventOf(
  sub: PolarSubscription,
  meta: PolarEventMeta,
): PolarMapResult {
  if (sub.status === "incomplete") {
    return { ok: false, reason: "incomplete", detail: sub.id };
  }
  const status = STATUS[sub.status];
  if (!status) {
    return { ok: false, reason: "unknownStatus", detail: sub.status };
  }
  const product = polarProductOf(sub.product_id);
  if (!product) {
    return { ok: false, reason: "unknownProduct", detail: sub.product_id };
  }
  const owner = ownerOf(sub);
  if (!owner) return { ok: false, reason: "unknownOwner", detail: sub.id };
  if ("mspAccountId" in owner !== (product.plan === "msp")) {
    return { ok: false, reason: "ownerPlanMismatch", detail: sub.id };
  }

  // A revoked subscription ends at once, whatever was left of its period.
  const periodEnd = dateOrNull(sub.current_period_end);
  const endedAt = dateOrNull(sub.ended_at);
  const currentPeriodEnd =
    endedAt && (!periodEnd || endedAt.getTime() < periodEnd.getTime())
      ? endedAt
      : periodEnd;

  return {
    ok: true,
    event: {
      ...meta,
      provider: "polar",
      owner,
      plan: product.plan,
      status,
      quantity:
        product.plan === "msp"
          ? Math.max(MSP_INCLUDED_TENANTS, sub.seats ?? 0)
          : 1,
      trialEnd: dateOrNull(sub.trial_end),
      currentPeriodEnd,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      providerSubscriptionId: sub.id,
      providerCustomerId: sub.customer_id,
    },
  };
}

// --- applying ----------------------------------------------------------------

export type PolarApplyResult =
  | { result: ApplyResult }
  | { result: "ignored"; reason: PolarIgnoreReason | "superseded" };

/** Whether a row, or the row an event would write, grants a paid plan right now. */
export const grantsNow = (
  record: NonNullable<Parameters<typeof entitlementOf>[0]["record"]>,
  now: Date = new Date(),
): boolean =>
  entitlementOf({
    tenant: { isDemo: false },
    record,
    covered: true,
    billingEnabled: true,
    now,
  }).plan !== "free";

/** The entitlements row of an owner, if any. */
export const entitlementRowOf = async (owner: EntitlementOwner) => {
  const [row] = await db
    .select()
    .from(entitlements)
    .where(
      "tenantId" in owner
        ? eq(entitlements.tenantId, owner.tenantId)
        : eq(entitlements.mspAccountId, owner.mspAccountId),
    )
    .limit(1);
  return row ?? null;
};

/** The owner's workspace or MSP account still exists. */
const ownerExists = async (owner: EntitlementOwner): Promise<boolean> => {
  const [row] =
    "tenantId" in owner
      ? await db
          .select({ id: tenants.id })
          .from(tenants)
          .where(eq(tenants.id, owner.tenantId))
          .limit(1)
      : await db
          .select({ id: mspAccounts.id })
          .from(mspAccounts)
          .where(eq(mspAccounts.id, owner.mspAccountId))
          .limit(1);
  return row !== undefined;
};

/**
 * One of our products that cannot be placed: a customer may be paying without
 * getting the plan, so a person has to look at it.
 */
const reportUnplaced = (
  sub: PolarSubscription,
  meta: PolarEventMeta,
  reason: PolarIgnoreReason,
  detail: string,
) =>
  notifyOps(`Polar ${meta.type} not applied: ${reason} (${detail})`, {
    key: `polar-unplaced:${sub.id}`,
    cooldownMs: 24 * 60 * 60 * 1000,
  });

/**
 * The one path from a Polar subscription to the entitlements table, shared by
 * the webhook and the daily reconciliation. An owner has a single row, so the
 * end of an older subscription must not wipe out the plan a newer one grants:
 * an event that grants nothing is skipped while the row belongs to a different
 * subscription that still does.
 */
export async function applyPolarSubscription(
  sub: PolarSubscription,
  meta: PolarEventMeta,
  now: Date = new Date(),
): Promise<PolarApplyResult> {
  const mapped = entitlementEventOf(sub, meta);
  if (!mapped.ok) {
    if (mapped.reason === "unknownProduct") {
      // The Polar organization may sell other products; not an incident.
      console.warn(`[polar] ${meta.type} skipped: product ${mapped.detail}`);
    } else if (mapped.reason !== "incomplete") {
      await reportUnplaced(sub, meta, mapped.reason, mapped.detail);
    }
    return { result: "ignored", reason: mapped.reason };
  }
  const { event } = mapped;

  // A deleted workspace would fail the foreign key on every redelivery.
  if (!(await ownerExists(event.owner))) {
    await reportUnplaced(sub, meta, "unknownOwner", `${sub.id}, owner deleted`);
    return { result: "ignored", reason: "unknownOwner" };
  }

  if (!grantsNow({ ...event, source: "polar" }, now)) {
    const existing = await entitlementRowOf(event.owner);
    if (
      existing &&
      existing.providerSubscriptionId !== event.providerSubscriptionId &&
      grantsNow(existing, now)
    ) {
      return { result: "ignored", reason: "superseded" };
    }
  }
  return { result: await applyEntitlementEvent(event) };
}

// --- webhook signature -------------------------------------------------------

/** Standard Webhooks tolerance for the signed timestamp, in seconds. */
export const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

export type WebhookVerification =
  | { ok: true }
  | { ok: false; reason: "missingHeaders" | "staleTimestamp" | "badSignature" };

/**
 * Standard Webhooks verification: HMAC-SHA256 over `id.timestamp.body` with
 * the raw body, compared in constant time against every `v1,` signature in
 * the header. Polar uses the secret string itself as the key (its guides
 * base64-encode the secret only because the reference libraries decode it
 * again), so the key is the UTF-8 bytes of POLAR_WEBHOOK_SECRET.
 */
export function verifyPolarSignature(
  secret: string,
  headers: Headers,
  rawBody: string,
  now: Date = new Date(),
): WebhookVerification {
  const id = headers.get("webhook-id");
  const sentAt = headers.get("webhook-timestamp");
  const signatures = headers.get("webhook-signature");
  if (!id || !sentAt || !signatures) {
    return { ok: false, reason: "missingHeaders" };
  }

  const seconds = Number(sentAt);
  if (
    !/^\d+$/.test(sentAt) ||
    Math.abs(now.getTime() / 1000 - seconds) > WEBHOOK_TOLERANCE_SECONDS
  ) {
    return { ok: false, reason: "staleTimestamp" };
  }

  const expected = createHmac("sha256", Buffer.from(secret, "utf-8"))
    .update(`${id}.${sentAt}.${rawBody}`)
    .digest();
  const match = signatures.split(" ").some((entry) => {
    const [version, value] = entry.split(",");
    if (version !== "v1" || !value) return false;
    const given = Buffer.from(value, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
  return match ? { ok: true } : { ok: false, reason: "badSignature" };
}

// --- API client --------------------------------------------------------------

export class PolarApiError extends Error {
  constructor(
    readonly status: number,
    path: string,
  ) {
    super(`Polar API ${status} on ${path}`);
    this.name = "PolarApiError";
  }
}

/** Sandbox unless POLAR_SERVER says production. */
export const polarBaseUrl = () =>
  env.POLAR_SERVER === "production"
    ? "https://api.polar.sh"
    : "https://sandbox-api.polar.sh";

const polarFetch = async (
  path: string,
  init: { method: "GET" } | { method: "POST"; body: unknown },
): Promise<unknown> => {
  if (!env.POLAR_ACCESS_TOKEN) throw new Error("Polar is not configured");
  const res = await fetch(`${polarBaseUrl()}${path}`, {
    method: init.method,
    headers: {
      authorization: `Bearer ${env.POLAR_ACCESS_TOKEN}`,
      accept: "application/json",
      ...(init.method === "POST" ? { "content-type": "application/json" } : {}),
    },
    body: init.method === "POST" ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  // The response body can echo customer details, so it is never logged.
  if (!res.ok) throw new PolarApiError(res.status, path);
  return res.json() as Promise<unknown>;
};

export type PolarCheckoutInput = {
  product: PolarProduct;
  owner: EntitlementOwner;
  customerEmail: string | null;
  successUrl: string;
  returnUrl: string;
  /** False for an owner who already had a paid plan: one trial per owner. */
  allowTrial: boolean;
};

/** POST /v1/checkouts/. Returns the hosted checkout URL. */
export async function createPolarCheckout(
  input: PolarCheckoutInput,
): Promise<{ id: string; url: string }> {
  const productId = polarProductId(input.product);
  if (!productId) throw new Error("Polar product is not configured");
  const ref = ownerRef(input.owner);
  const body = {
    products: [productId],
    external_customer_id: ref,
    metadata: { [OWNER_METADATA_KEY]: ref },
    success_url: input.successUrl,
    return_url: input.returnUrl,
    ...(input.customerEmail ? { customer_email: input.customerEmail } : {}),
    ...(input.allowTrial
      ? { trial_interval: "day", trial_interval_count: TRIAL_DAYS }
      : { allow_trial: false }),
    // Seat fields are accepted for seat-based products only, which is how the
    // MSP products are modelled: the included tenants are the minimum.
    ...(input.product.plan === "msp"
      ? { seats: MSP_INCLUDED_TENANTS, min_seats: MSP_INCLUDED_TENANTS }
      : {}),
  };
  const json = await polarFetch("/v1/checkouts/", { method: "POST", body });
  return z.object({ id: z.string(), url: z.string().url() }).parse(json);
}

/**
 * POST /v1/customer-sessions/. Addresses the customer by its Polar id when the
 * entitlement row has one (the customer a subscription really sits on), else
 * by the owner reference used as external customer id at checkout.
 */
export async function createPolarPortalSession(input: {
  owner: EntitlementOwner;
  customerId: string | null;
  returnUrl: string;
}): Promise<{ url: string }> {
  const json = await polarFetch("/v1/customer-sessions/", {
    method: "POST",
    body: {
      ...(input.customerId
        ? { customer_id: input.customerId }
        : { external_customer_id: ownerRef(input.owner) }),
      return_url: input.returnUrl,
    },
  });
  const session = z
    .object({ customer_portal_url: z.string().url() })
    .parse(json);
  return { url: session.customer_portal_url };
}

/** GET /v1/subscriptions/{id}. Null when Polar does not know the id. */
export async function getPolarSubscription(
  id: string,
): Promise<PolarSubscription | null> {
  try {
    const json = await polarFetch(
      `/v1/subscriptions/${encodeURIComponent(id)}`,
      { method: "GET" },
    );
    return polarSubscriptionSchema.parse(json);
  } catch (err) {
    if (err instanceof PolarApiError && err.status === 404) return null;
    throw err;
  }
}

const LIST_PAGE_SIZE = 100;
/** Upper bound on pages read in one run, so a paging bug can never loop. */
const LIST_MAX_PAGES = 100;

/**
 * GET /v1/subscriptions/, every page, every status. Reconciliation uses it to
 * find a subscription whose creation webhook never arrived. Items that do not
 * parse are skipped: one odd subscription must not stop the run.
 */
export async function listPolarSubscriptions(): Promise<PolarSubscription[]> {
  const all: PolarSubscription[] = [];
  for (let page = 1; page <= LIST_MAX_PAGES; page += 1) {
    const json = await polarFetch(
      `/v1/subscriptions/?page=${page}&limit=${LIST_PAGE_SIZE}`,
      { method: "GET" },
    );
    const { items, pagination } = z
      .object({
        items: z.array(z.unknown()),
        pagination: z.object({ max_page: z.number().int() }),
      })
      .parse(json);
    for (const item of items) {
      const parsed = polarSubscriptionSchema.safeParse(item);
      if (parsed.success) all.push(parsed.data);
    }
    if (page >= pagination.max_page) break;
  }
  return all;
}
