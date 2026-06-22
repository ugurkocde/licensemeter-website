import type { subscriptions, tenants } from "~/server/db/schema";
import type { PlanTier, SubscriptionStatus } from "~/server/types";

/**
 * Pure entitlement resolver: the single place that decides whether a workspace
 * has full access, is in trial, or is soft-locked. No DB, no env reads, no
 * clock — everything is passed in so it is trivially unit-testable and the
 * cron, dashboard banner and API gates all agree.
 */

export const TRIAL_DAYS = 14;
const DAY_MS = 86_400_000;

/** Stripe statuses that grant access while the paid horizon still holds. */
const ENTITLED_STATUS = new Set<SubscriptionStatus>(["active", "trialing"]);

type TenantRow = typeof tenants.$inferSelect;
type SubRow = typeof subscriptions.$inferSelect;

/** Only the tenant fields entitlement actually reads. */
type TenantEntitlementInput = Pick<
  TenantRow,
  | "isDemo"
  | "compedAt"
  | "subscriptionStatus"
  | "paidUntil"
  | "trialStartedAt"
  | "createdAt"
>;

/** Only the subscription fields entitlement actually reads (UI detail). */
type SubEntitlementInput = Pick<SubRow, "tier" | "cancelAtPeriodEnd"> | null;

export type EntitlementState =
  | "demo"
  | "comped"
  | "paid"
  | "past_due"
  | "trial"
  | "expired";

export type Entitlement = {
  state: EntitlementState;
  /** Full feature access (exports, sync, finding detail, alerts). */
  active: boolean;
  /** Dashboard stays viewable but features are gated behind the paywall. */
  locked: boolean;
  trialEndsAt: Date;
  /** Whole days remaining in the app-managed trial (0 on the final day). */
  trialDaysLeft: number;
  plan: PlanTier | null;
  cancelAtPeriodEnd: boolean;
};

const startOfUtcDay = (d: Date): Date =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

/**
 * The trial window, normalized to whole UTC days so two tenants created hours
 * apart expire on the same calendar boundary and the banner ("ends 25 Jun")
 * and the email ("ends tomorrow") never disagree. A tenant that connects any
 * time on day 0 keeps access through the end of day 13 and expires at the
 * start of day 14 (e.g. anchor 2026-06-11 -> expires 2026-06-25 00:00 UTC).
 */
export const trialEndsAtFor = (anchor: Date): Date =>
  new Date(startOfUtcDay(anchor).getTime() + TRIAL_DAYS * DAY_MS);

export const trialDaysLeftAt = (anchor: Date, now: Date): number =>
  Math.max(
    0,
    Math.floor((trialEndsAtFor(anchor).getTime() - now.getTime()) / DAY_MS),
  );

/**
 * Resolve a workspace's entitlement. Precedence (first match wins): demo ->
 * billing-disabled/comped -> active/trialing paid (within horizon) -> past_due
 * (grace until horizon) -> trial-not-started -> in-trial -> expired.
 *
 * The trial clock starts on first connector connect (trialStartedAt is stamped
 * then). A workspace that has connected nothing has trialStartedAt = null and is
 * treated as full-access "not started" — exploring an empty dashboard never
 * burns trial days. The active/trialing fast-path also requires the paid horizon
 * so a missed `customer.subscription.deleted` webhook can never grant access
 * forever.
 */
export function entitlementOf(
  tenant: TenantEntitlementInput,
  sub: SubEntitlementInput,
  now: Date,
  billingDisabled: boolean,
): Entitlement {
  // No anchor yet (trial not started) -> measure a full window from now so the
  // banner shows the full trial and nothing expires before they connect.
  const anchor = tenant.trialStartedAt ?? now;
  const trialEndsAt = trialEndsAtFor(anchor);
  const trialDaysLeft = trialDaysLeftAt(anchor, now);
  const base = {
    trialEndsAt,
    trialDaysLeft,
    plan: sub?.tier ?? null,
    cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
  };
  const full = (state: EntitlementState): Entitlement => ({
    state,
    active: true,
    locked: false,
    ...base,
  });
  const lock = (state: EntitlementState): Entitlement => ({
    state,
    active: false,
    locked: true,
    ...base,
  });

  // 1. Demo workspaces are always full access and never billed.
  if (tenant.isDemo) return full("demo");

  // 2. Master flag off (Stripe unconfigured) or grandfathered/comped tenant:
  //    full access, no billing pressure. comped_at is never written by the
  //    webhook, so a later real subscribe/cancel cannot clobber it.
  if (billingDisabled || tenant.compedAt) return full("comped");

  const status = tenant.subscriptionStatus;
  const paidUntil = tenant.paidUntil;
  const horizonOk = !paidUntil || paidUntil.getTime() > now.getTime();

  // 3. Active/trialing paid subscription, within the paid horizon.
  if (status && ENTITLED_STATUS.has(status) && horizonOk) return full("paid");

  // 4. Dunning grace: keep access while past_due until the period end passes.
  if (status === "past_due") return horizonOk ? full("past_due") : lock("past_due");

  // 5. Trial not started: no service connected yet, so the clock hasn't begun.
  //    Full access with no countdown (an empty workspace gates nothing anyway).
  if (!tenant.trialStartedAt) return full("trial");

  // 6. Still inside the app-managed (no-card) trial.
  if (now.getTime() < trialEndsAt.getTime()) return full("trial");

  // 7. Trial elapsed with no active subscription -> soft lock.
  return lock("expired");
}
