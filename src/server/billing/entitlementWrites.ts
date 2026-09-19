import { eq } from "drizzle-orm";

import { db } from "~/server/db";
import { billingEvents, entitlements } from "~/server/db/schema";
import type {
  BillingProvider,
  EntitlementStatus,
  PaidPlan,
} from "~/server/types";

/** Who a paid plan belongs to: one workspace (Pro) or one MSP account (MSP). */
export type EntitlementOwner = { tenantId: string } | { mspAccountId: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The reference handed to a provider at checkout (Polar external customer id,
 * Marketplace link record) and read back from its webhooks.
 */
export const ownerRef = (owner: EntitlementOwner) =>
  "tenantId" in owner ? `t_${owner.tenantId}` : `m_${owner.mspAccountId}`;

export const parseOwnerRef = (ref: unknown): EntitlementOwner | null => {
  if (typeof ref !== "string") return null;
  const id = ref.slice(2);
  if (!UUID.test(id)) return null;
  if (ref.startsWith("t_")) return { tenantId: id };
  if (ref.startsWith("m_")) return { mspAccountId: id };
  return null;
};

/** A provider event, already verified and mapped to the neutral shape. */
export type EntitlementEvent = {
  provider: BillingProvider;
  eventId: string;
  type: string;
  /** When the provider says it happened; gates out-of-order deliveries. */
  occurredAt: Date;
  owner: EntitlementOwner;
  plan: PaidPlan;
  status: EntitlementStatus;
  quantity: number;
  trialEnd: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  providerSubscriptionId: string;
  providerCustomerId: string | null;
};

export type ApplyResult = "applied" | "duplicate" | "stale" | "comped";

/**
 * The only writer of provider-driven entitlement rows. One transaction: the
 * ledger insert makes a redelivered event a no-op, a handler failure rolls the
 * ledger row back so the provider retry is processed exactly once, an older
 * event never overwrites a newer one, and a hand-set comp is never touched.
 */
export async function applyEntitlementEvent(
  event: EntitlementEvent,
): Promise<ApplyResult> {
  return db.transaction(async (tx) => {
    const ledger = await tx
      .insert(billingEvents)
      .values({
        provider: event.provider,
        eventId: event.eventId,
        type: event.type,
      })
      .onConflictDoNothing()
      .returning({ eventId: billingEvents.eventId });
    if (ledger.length === 0) return "duplicate";

    const ownerMatch =
      "tenantId" in event.owner
        ? eq(entitlements.tenantId, event.owner.tenantId)
        : eq(entitlements.mspAccountId, event.owner.mspAccountId);
    const [existing] = await tx
      .select()
      .from(entitlements)
      .where(ownerMatch)
      .for("update");

    if (existing?.source === "comped") return "comped";
    if (
      existing?.lastEventAt &&
      existing.lastEventAt.getTime() > event.occurredAt.getTime()
    ) {
      return "stale";
    }

    const values = {
      plan: event.plan,
      source: event.provider,
      status: event.status,
      quantity: event.quantity,
      trialEnd: event.trialEnd,
      currentPeriodEnd: event.currentPeriodEnd,
      cancelAtPeriodEnd: event.cancelAtPeriodEnd,
      providerSubscriptionId: event.providerSubscriptionId,
      providerCustomerId: event.providerCustomerId,
      lastEventAt: event.occurredAt,
      updatedAt: new Date(),
    };
    if (existing) {
      await tx
        .update(entitlements)
        .set(values)
        .where(eq(entitlements.id, existing.id));
    } else {
      await tx.insert(entitlements).values({
        ...values,
        tenantId: "tenantId" in event.owner ? event.owner.tenantId : null,
        mspAccountId:
          "mspAccountId" in event.owner ? event.owner.mspAccountId : null,
      });
    }
    return "applied";
  });
}
