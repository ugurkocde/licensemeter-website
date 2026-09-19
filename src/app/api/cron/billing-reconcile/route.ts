import { randomUUID } from "node:crypto";

import { and, eq, isNotNull } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { polarEnabled } from "~/env";
import {
  applyPolarSubscription,
  getPolarSubscription,
  listPolarSubscriptions,
  type PolarSubscription,
} from "~/server/billing/polar";
import { requireCronAuth } from "~/server/cronAuth";
import { db } from "~/server/db";
import { entitlements } from "~/server/db/schema";
import { notifyOps } from "~/server/ops";

export const maxDuration = 300;

/** Statuses that can grant a plan; applied last so they win an owner's row. */
const RUNNING = new Set(["trialing", "active", "past_due"]);

/**
 * Daily repair of missed Polar webhooks. Protected by CRON_SECRET. Reads every
 * subscription from Polar and applies its current state through the same
 * writer as the webhook, so a lost event (a creation included) is caught
 * within a day. A row whose subscription the listing did not return is fetched
 * on its own; if Polar does not know it either, the row is left untouched and
 * reported.
 */
export const GET = async (req: NextRequest) => {
  const denied = requireCronAuth(req);
  if (denied) return denied;
  if (!polarEnabled()) {
    return NextResponse.json({ skipped: "polar not configured" });
  }

  const runId = randomUUID();
  // Taken before the first read: a webhook sent after this moment is newer
  // than what this run saw, and must still win over it.
  const readAt = new Date();

  const listed = await listPolarSubscriptions();
  const byId = new Map(listed.map((sub) => [sub.id, sub]));

  const rows = await db
    .select({ subscriptionId: entitlements.providerSubscriptionId })
    .from(entitlements)
    .where(
      and(
        eq(entitlements.source, "polar"),
        isNotNull(entitlements.providerSubscriptionId),
      ),
    );

  const counts: Record<string, number> = {};
  const count = (key: string) => {
    counts[key] = (counts[key] ?? 0) + 1;
  };

  const reconcile = async (sub: PolarSubscription) => {
    try {
      const outcome = await applyPolarSubscription(sub, {
        eventId: `reconcile:${runId}:${sub.id}`,
        type: "reconcile",
        occurredAt: readAt,
      });
      count(outcome.result);
    } catch (err) {
      count("failed");
      void notifyOps(
        `billing reconcile failed for Polar subscription ${sub.id}: ${err instanceof Error ? err.message : String(err)}`,
        { key: `billing-reconcile:${sub.id}`, cooldownMs: 24 * 60 * 60 * 1000 },
      );
    }
  };

  for (const { subscriptionId } of rows) {
    if (!subscriptionId || byId.has(subscriptionId)) continue;
    const sub = await getPolarSubscription(subscriptionId).catch(() => {
      count("failed");
      return undefined;
    });
    if (sub === undefined) continue;
    if (sub === null) {
      count("missing");
      void notifyOps(
        `billing reconcile: Polar does not know subscription ${subscriptionId}; the entitlement row was left as it is.`,
        {
          key: `billing-reconcile-missing:${subscriptionId}`,
          cooldownMs: 24 * 60 * 60 * 1000,
        },
      );
      continue;
    }
    await reconcile(sub);
  }

  const ordered = [...listed].sort(
    (a, b) => Number(RUNNING.has(a.status)) - Number(RUNNING.has(b.status)),
  );
  for (const sub of ordered) await reconcile(sub);

  return NextResponse.json({ runId, subscriptions: listed.length, counts });
};
