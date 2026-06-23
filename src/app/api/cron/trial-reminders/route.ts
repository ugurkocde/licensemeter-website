import { desc, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { billingEnabled } from "~/env";
import { fmtMoney } from "~/lib/format";
import { planByTier, seatNudge } from "~/lib/plans";
import {
  sendSeatNudge,
  sendTrialExpired,
  sendTrialReminder,
} from "~/server/billingEmail";
import { db } from "~/server/db";
import { opsAlerts, snapshots, subscriptions, tenants } from "~/server/db/schema";
import { emailEnabled } from "~/server/email";
import { entitlementOf, type Entitlement } from "~/server/entitlement";
import { notifyOps } from "~/server/ops";
import { reconcileTenantSubscription } from "~/server/stripe";
import type { ReminderStage } from "~/server/types";
import { requireCronAuth } from "~/server/cronAuth";

export const maxDuration = 300;

/** A paid tenant gets at most one seat-band nudge per tier this often. */
const SEAT_NUDGE_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

/** Which reminder, if any, is due today for this entitlement. */
const stageFor = (e: Entitlement): ReminderStage | null => {
  if (e.state === "expired") return "trial_expired";
  if (e.state !== "trial") return null;
  if (e.trialDaysLeft <= 1) return "trial_last";
  if (e.trialDaysLeft <= 2) return "trial_day12";
  if (e.trialDaysLeft <= 7) return "trial_day7";
  return null;
};

/**
 * Daily trial-reminder + reconciliation cron. Reconciliation (healing missed
 * webhooks) runs whenever billing is on; reminder emails additionally need
 * email configured. Dedup is keyed to the trial epoch so a genuinely new trial
 * gets fresh reminders, and the row is written only after a successful send.
 */
export const GET = async (req: NextRequest) => {
  const denied = requireCronAuth(req);
  if (denied) return denied;
  if (!billingEnabled()) {
    return NextResponse.json({ skipped: "billing disabled" });
  }

  const allTenants = await db.query.tenants.findMany({
    where: eq(tenants.isDemo, false),
  });
  const now = new Date();

  // Reconciliation backstop: re-read Stripe for tenants with a customer id and
  // heal any drift from a missed webhook.
  let reconciled = 0;
  for (const tenant of allTenants) {
    if (!tenant.stripeCustomerId) continue;
    try {
      await reconcileTenantSubscription(tenant);
      reconciled++;
    } catch (err) {
      void notifyOps(
        `reconcile failed for tenant ${tenant.name ?? tenant.tid}: ${err instanceof Error ? err.message : String(err)}`,
        { key: `reconcile:${tenant.id}`, cooldownMs: 3_600_000 },
      );
    }
  }

  if (!emailEnabled()) {
    return NextResponse.json({ reconciled, skipped: "email not configured" });
  }

  let sent = 0;
  for (const tenant of allTenants) {
    try {
      // Reminders only target trialing/expired tenants (no paid sub), which
      // reconciliation never touched, so the in-memory tenant is current.
      const entitlement = entitlementOf(tenant, null, now, false);
      const stage = stageFor(entitlement);
      if (!stage) continue;

      const anchor = tenant.trialStartedAt ?? tenant.createdAt;
      const key = `trial-reminder:${tenant.id}:${anchor.toISOString()}:${stage}`;
      const already = await db.query.opsAlerts.findFirst({
        where: eq(opsAlerts.key, key),
        columns: { key: true },
      });
      if (already) continue;

      const snap = await db.query.snapshots.findFirst({
        where: eq(snapshots.tenantId, tenant.id),
        orderBy: desc(snapshots.day),
        columns: { totalMonthlyWasteCents: true },
      });
      const wasteLine =
        snap && snap.totalMonthlyWasteCents > 0
          ? `${fmtMoney(snap.totalMonthlyWasteCents, tenant.currency)}/mo in recoverable license waste found.`
          : undefined;

      const ok =
        stage === "trial_expired"
          ? await sendTrialExpired(tenant, wasteLine)
          : await sendTrialReminder(tenant, entitlement.trialDaysLeft, wasteLine);

      if (ok) {
        // Record the dedup row only after a successful send, so a transient
        // failure retries tomorrow rather than being permanently suppressed.
        await db
          .insert(opsAlerts)
          .values({ key, lastSentAt: new Date(), suppressedCount: 0 })
          .onConflictDoNothing();
        sent++;
      }
    } catch (err) {
      void notifyOps(
        `trial reminder failed for tenant ${tenant.name ?? tenant.tid}: ${err instanceof Error ? err.message : String(err)}`,
        { key: `trial-reminder-err:${tenant.id}`, cooldownMs: 3_600_000 },
      );
    }
  }

  // Seat-band nudges for paid tenants: tell owners to change plan (never an
  // auto-charge) when seats outgrow the band. At most one per (tenant, tier)
  // every SEAT_NUDGE_COOLDOWN, tracked in opsAlerts; suppressible by the owner.
  let nudged = 0;
  for (const tenant of allTenants) {
    try {
      const sub = await db.query.subscriptions.findFirst({
        where: eq(subscriptions.tenantId, tenant.id),
        columns: { tier: true, status: true },
      });
      if (!sub?.tier || (sub.status !== "active" && sub.status !== "trialing")) {
        continue;
      }
      const snap = await db.query.snapshots.findFirst({
        where: eq(snapshots.tenantId, tenant.id),
        orderBy: desc(snapshots.day),
        columns: { purchasedSeats: true },
      });
      if (!snap) continue;
      const nudge = seatNudge(sub.tier, snap.purchasedSeats);
      if (!nudge) continue;

      const key = `seat-nudge:${tenant.id}:${sub.tier}`;
      const prior = await db.query.opsAlerts.findFirst({
        where: eq(opsAlerts.key, key),
        columns: { lastSentAt: true },
      });
      if (
        prior &&
        now.getTime() - prior.lastSentAt.getTime() < SEAT_NUDGE_COOLDOWN_MS
      ) {
        continue;
      }

      const ok = await sendSeatNudge(tenant, {
        planName: planByTier(sub.tier).name,
        seats: snap.purchasedSeats,
        seatMax: nudge.seatMax,
        recommendedName: nudge.recommendedTier
          ? planByTier(nudge.recommendedTier).name
          : null,
        over: nudge.state === "over",
      });
      if (ok) {
        await db
          .insert(opsAlerts)
          .values({ key, lastSentAt: now, suppressedCount: 0 })
          .onConflictDoUpdate({
            target: opsAlerts.key,
            set: { lastSentAt: now },
          });
        nudged++;
      }
    } catch (err) {
      void notifyOps(
        `seat nudge failed for tenant ${tenant.name ?? tenant.tid}: ${err instanceof Error ? err.message : String(err)}`,
        { key: `seat-nudge-err:${tenant.id}`, cooldownMs: 3_600_000 },
      );
    }
  }

  return NextResponse.json({
    tenants: allTenants.length,
    reconciled,
    sent,
    nudged,
  });
};
