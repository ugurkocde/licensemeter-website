import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { marketplaceEnabled } from "~/env";
import {
  applyEntitlementEvent,
  type EntitlementOwner,
} from "~/server/billing/entitlementWrites";
import {
  acknowledgeOperation,
  getOperation,
  getSubscription,
  isPendingAction,
  MarketplaceApiError,
  subscriptionToEvent,
  verifyConfiguredWebhookToken,
  webhookPayloadSchema,
  withOperation,
} from "~/server/billing/marketplace";
import { db } from "~/server/db";
import { entitlements } from "~/server/db/schema";
import { readCapped } from "~/server/httpBody";
import { notifyOps } from "~/server/ops";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The documented payloads are about 2 KB; anything near this is not Microsoft. */
const MAX_BODY_BYTES = 64 * 1024;

const answer = (body: Record<string, unknown>, status = 200) =>
  NextResponse.json(body, { status });

/**
 * An unanswered operation is auto-accepted after 10 seconds. A lost Success
 * therefore changes nothing, but a lost Failure would let Microsoft apply a
 * change the entitlement refused, so the caller answers 5xx in that case and
 * Microsoft retries the whole notification.
 */
const acknowledge = async (
  subscriptionId: string,
  operationId: string,
  status: "Success" | "Failure",
): Promise<boolean> => {
  try {
    await acknowledgeOperation(subscriptionId, operationId, status);
    return true;
  } catch (err) {
    console.error(
      `[marketplace] acknowledge ${status} failed: ${err instanceof Error ? err.message : "unknown error"}`,
    );
    return false;
  }
};

/**
 * Connection webhook of the Microsoft Marketplace SaaS offer.
 * https://learn.microsoft.com/partner-center/marketplace-offers/pc-saas-fulfillment-webhook
 *
 * Actions: Subscribe, ChangePlan, ChangeQuantity, Renew, Suspend, Unsubscribe,
 * Reinstate. The body is only used to find the subscription and the operation;
 * the state always comes from Get subscription and Get operation. 200
 * acknowledges receipt, a 4xx within 10 seconds rejects a ChangePlan or
 * ChangeQuantity, and a 5xx makes Microsoft retry (500 times over eight hours),
 * so persistence errors are left to bubble.
 */
export const POST = async (req: NextRequest) => {
  if (!marketplaceEnabled()) {
    return answer({ error: "marketplace not configured" }, 503);
  }

  // Cheap pre-auth rejection of a declared oversized body; readCapped below
  // still bounds the actual read (chunked or understated length).
  if (Number(req.headers.get("content-length") ?? "0") > MAX_BODY_BYTES) {
    return answer({ error: "payload too large" }, 413);
  }

  // "ISVs must validate the Microsoft Entra Token (JWT Token) on their webhook
  // endpoint from the request header."
  const token = await verifyConfiguredWebhookToken(
    req.headers.get("authorization"),
  );
  if (!token.ok) {
    console.warn(`[marketplace] webhook token rejected: ${token.reason}`);
    return answer({ error: "unauthorized" }, 401);
  }

  const raw = await readCapped(req, MAX_BODY_BYTES);
  if (raw === null) {
    return answer({ error: "payload too large" }, 413);
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return answer({ error: "invalid json" }, 400);
  }
  const parsed = webhookPayloadSchema.safeParse(json);
  if (!parsed.success) return answer({ error: "invalid payload" }, 400);
  const { id: operationId, subscriptionId, action } = parsed.data;

  // The owner is whoever activated the subscription on the landing page.
  const [row] = await db
    .select()
    .from(entitlements)
    .where(
      and(
        eq(entitlements.source, "marketplace"),
        eq(entitlements.providerSubscriptionId, subscriptionId),
      ),
    )
    .limit(1);
  if (!row) {
    // Bought but never configured on the landing page (or an auto-activated
    // Subscribe that arrived first). There is nothing to update, and a non-2xx
    // would only make Microsoft retry for eight hours, so acknowledge receipt.
    console.warn(
      `[marketplace] ${action} for a subscription with no linked workspace: ${subscriptionId}`,
    );
    return answer({ received: true, linked: false });
  }
  const owner: EntitlementOwner | null = row.tenantId
    ? { tenantId: row.tenantId }
    : row.mspAccountId
      ? { mspAccountId: row.mspAccountId }
      : null;
  if (!owner) return answer({ received: true, linked: false });

  // "The SaaS service is required to call the Get Operation API to validate
  // and authorize the webhook call and payload data before taking action."
  const operation = await getOperation(subscriptionId, operationId);
  if (
    operation &&
    ((operation.subscriptionId &&
      operation.subscriptionId !== subscriptionId) ||
      (operation.action && operation.action !== action))
  ) {
    console.warn(`[marketplace] ${action} does not match its operation`);
    return answer({ error: "operation mismatch" }, 400);
  }
  // A pending change is described only by its operation. Without one there is
  // nothing to verify the new plan or quantity against, so it is rejected.
  if (isPendingAction(action) && !operation) {
    console.warn(`[marketplace] ${action} without a readable operation`);
    return answer({ error: "unknown operation" }, 400);
  }

  let current;
  try {
    current = await getSubscription(subscriptionId);
  } catch (err) {
    if (err instanceof MarketplaceApiError && err.status === 404) {
      console.warn(
        `[marketplace] ${action} for a subscription Microsoft does not know`,
      );
      return answer({ error: "unknown subscription" }, 400);
    }
    throw err;
  }
  const subscription =
    operation && isPendingAction(action)
      ? withOperation(current, { ...operation, action })
      : current;

  // Activate answered 200 on the landing page, but Microsoft can keep reporting
  // PendingFulfillmentStart for a few minutes. The landing page already wrote
  // the activated state; writing this one would take the plan away again.
  if (subscription.saasSubscriptionStatus === "PendingFulfillmentStart") {
    return answer({ received: true, applied: false });
  }

  const event = subscriptionToEvent(subscription, {
    owner,
    eventId: operationId,
    type: action,
    occurredAt: new Date(),
  });
  if (!event) {
    // A plan we do not sell, or a status the docs do not list. Refuse the
    // change where Microsoft lets us, keep the current plan, and tell ops.
    if (
      isPendingAction(action) &&
      !(await acknowledge(subscriptionId, operationId, "Failure"))
    ) {
      return answer({ error: "rejection not acknowledged" }, 502);
    }
    void notifyOps(
      `Marketplace ${action} could not be mapped (plan "${subscription.planId ?? ""}", status "${subscription.saasSubscriptionStatus}"). The entitlement was left unchanged.`,
      { key: `marketplace-unmapped-${subscriptionId}`, cooldownMs: 3_600_000 },
    );
    return answer({ received: true, applied: false });
  }

  if (event.plan === "msp" && "tenantId" in owner) {
    void notifyOps(
      "A Marketplace subscription linked to a single workspace is now on the MSP plan. The workspace gets the MSP features, but client tenants are only covered once the plan is moved to an MSP account.",
      { key: `marketplace-msp-on-workspace-${subscriptionId}` },
    );
  }

  const result = await applyEntitlementEvent(event);

  // ChangePlan, ChangeQuantity and Reinstate are the operations that take an
  // acknowledgement; the others are notify only.
  // https://learn.microsoft.com/partner-center/marketplace-offers/pc-saas-fulfillment-operations-api
  if (isPendingAction(action) && result !== "duplicate") {
    await acknowledge(subscriptionId, operationId, "Success");
  }
  return answer({ received: true, result });
};
