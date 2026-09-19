import { and, eq, isNotNull } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { marketplaceEnabled } from "~/env";
import {
  applyEntitlementEvent,
  type EntitlementOwner,
} from "~/server/billing/entitlementWrites";
import {
  getSubscription,
  subscriptionToEvent,
} from "~/server/billing/marketplace";
import { requireCronAuth } from "~/server/cronAuth";
import { db } from "~/server/db";
import { entitlements } from "~/server/db/schema";
import { notifyOps } from "~/server/ops";

export const maxDuration = 300;
const RECONCILE_CONCURRENCY = 5;

/**
 * Daily safety net under the Marketplace webhook: reads every linked
 * subscription from Get subscription and applies what Microsoft reports, so a
 * missed webhook, a provisional trial date or a change that was still pending
 * when its webhook arrived never drifts for longer than a day.
 * https://learn.microsoft.com/partner-center/marketplace-offers/pc-saas-fulfillment-subscription-api#get-subscription
 */
export const GET = async (req: NextRequest) => {
  const denied = requireCronAuth(req);
  if (denied) return denied;
  if (!marketplaceEnabled()) {
    return NextResponse.json({ skipped: "marketplace not configured" });
  }

  const rows = await db
    .select()
    .from(entitlements)
    .where(
      and(
        eq(entitlements.source, "marketplace"),
        isNotNull(entitlements.providerSubscriptionId),
      ),
    );

  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const counts = { checked: 0, applied: 0, skipped: 0, failed: 0 };

  const reconcile = async (row: (typeof rows)[number]) => {
    const subscriptionId = row.providerSubscriptionId;
    const owner: EntitlementOwner | null = row.tenantId
      ? { tenantId: row.tenantId }
      : row.mspAccountId
        ? { mspAccountId: row.mspAccountId }
        : null;
    if (!subscriptionId || !owner) return;
    counts.checked += 1;
    try {
      const subscription = await getSubscription(subscriptionId);
      // Activate answered 200 but Microsoft has not finished yet: the landing
      // page already wrote the activated state, so leave it for the next run.
      if (subscription.saasSubscriptionStatus === "PendingFulfillmentStart") {
        counts.skipped += 1;
        return;
      }
      const event = subscriptionToEvent(subscription, {
        owner,
        eventId: `reconcile:${subscriptionId}:${day}`,
        type: "reconcile",
        occurredAt: now,
      });
      if (!event) {
        counts.skipped += 1;
        return;
      }
      if ((await applyEntitlementEvent(event)) === "applied") {
        counts.applied += 1;
      } else {
        counts.skipped += 1;
      }
    } catch (err) {
      counts.failed += 1;
      console.error(
        `[marketplace] reconcile failed for ${subscriptionId}: ${err instanceof Error ? err.message : "unknown error"}`,
      );
    }
  };

  // A few subscriptions at a time: one Get subscription call each, so the run
  // stays well inside the function limit without hammering the API.
  const queue = [...rows];
  await Promise.all(
    Array.from({ length: RECONCILE_CONCURRENCY }, async () => {
      for (let row = queue.shift(); row; row = queue.shift()) {
        await reconcile(row);
      }
    }),
  );

  if (counts.failed > 0) {
    void notifyOps(
      `Marketplace reconcile: ${counts.failed} of ${counts.checked} subscriptions could not be read.`,
      { key: "marketplace-reconcile-failed", cooldownMs: 6 * 60 * 60 * 1000 },
    );
  }
  return NextResponse.json(counts);
};
