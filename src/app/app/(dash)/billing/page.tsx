import { eq } from "drizzle-orm";

import { BillingActions } from "~/components/workspace/BillingActions";
import { Card, Pill } from "~/components/ui";
import type { PillTone } from "~/components/ui";
import { billingEnabled } from "~/env";
import { fmtDate, fmtMoney } from "~/lib/format";
import {
  MAX_SELF_SERVE_SEATS,
  PLANS,
  planByTier,
  priceEurosFor,
  seatNudge,
  tierForSeats,
} from "~/lib/plans";
import { hasRole, requireAccess } from "~/server/access";
import { db } from "~/server/db";
import { subscriptions } from "~/server/db/schema";
import { entitlementOf } from "~/server/entitlement";
import { knownSeats } from "~/server/stripe";

export const metadata = { robots: { index: false, follow: false } };

const STATE_LABEL: Record<string, string> = {
  trial: "Trial",
  paid: "Active",
  past_due: "Past due",
  incomplete: "Payment incomplete",
  expired: "Expired",
  comped: "Complimentary",
  demo: "Demo",
};

const STATE_TONE: Record<string, PillTone> = {
  trial: "brand",
  paid: "good",
  past_due: "gold",
  incomplete: "danger",
  expired: "danger",
  comped: "slate",
  demo: "slate",
};

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireAccess("viewer");
  const isOwner = hasRole(ctx, "owner");
  const sp = await searchParams;
  const planParam = typeof sp.plan === "string" ? sp.plan : undefined;
  const checkoutParam = typeof sp.checkout === "string" ? sp.checkout : undefined;

  if (ctx.tenant.isDemo) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <header className="rise rise-1">
          <h1 className="font-display text-3xl tracking-tight">Billing</h1>
        </header>
        <div className="rise rise-2">
          <Card title="Demo workspace">
            <p className="text-sm text-ink-soft">
              This is the demo workspace. It runs on synthetic data and is never
              billed. Connect a real tenant from a Microsoft sign-in to manage a
              subscription.
            </p>
          </Card>
        </div>
      </div>
    );
  }

  const sub = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.tenantId, ctx.tenant.id),
  });
  const entitlement = entitlementOf(
    ctx.tenant,
    sub ?? null,
    new Date(),
    !billingEnabled(),
  );
  const seats = await knownSeats(ctx.tenant.id);

  // A subscribed tenant that outgrows its band gets a change-plan nudge (never
  // an auto-charge); the action is the existing Change plan button below.
  const overPlan =
    sub?.tier && seats.hasSync ? seatNudge(sub.tier, seats.seats) : null;

  // A subscription that exists (incl. a preserved-trial one) is managed through
  // the portal, not re-picked — otherwise the picker could start a 2nd checkout.
  const manageable = Boolean(
    sub &&
      (sub.status === "active" ||
        sub.status === "trialing" ||
        sub.status === "past_due"),
  );
  const overSelfServe = seats.hasSync && seats.seats > MAX_SELF_SERVE_SEATS;
  const recommendedTier = seats.hasSync
    ? (tierForSeats(seats.seats) ?? null)
    : null;
  // During the no-card trial, subscribing keeps the remaining free days.
  const trialInfo =
    entitlement.state === "trial"
      ? { daysLeft: entitlement.trialDaysLeft, endsAt: fmtDate(entitlement.trialEndsAt) }
      : null;

  const plan = sub?.tier ? PLANS.find((p) => p.tier === sub.tier) : undefined;
  const intervalLabel = sub?.interval === "year" ? "annual" : "monthly";
  const priceCents =
    plan && sub?.interval
      ? priceEurosFor(plan.tier, sub.interval) * 100
      : null;

  // Dated line: trial countdown, cancellation, or renewal.
  let datedLine: string | null = null;
  if (entitlement.state === "trial") {
    datedLine = `Trial ends ${fmtDate(entitlement.trialEndsAt)}`;
  } else if (
    (entitlement.state === "paid" || entitlement.state === "past_due") &&
    entitlement.cancelAtPeriodEnd &&
    sub?.currentPeriodEnd
  ) {
    datedLine = `Cancels on ${fmtDate(sub.currentPeriodEnd)}`;
  } else if (sub?.status === "trialing" && sub?.currentPeriodEnd) {
    datedLine = `Free trial — first charge ${fmtDate(sub.currentPeriodEnd)}`;
  } else if (entitlement.state === "paid" && sub?.currentPeriodEnd) {
    datedLine = `Renews on ${fmtDate(sub.currentPeriodEnd)}`;
  }

  const seatBand = seats.hasSync
    ? `${seats.seats} purchased seats → ${tierForSeats(seats.seats) ?? "contact sales"}`
    : "Seat count appears after your first sync.";

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header className="rise rise-1">
        <h1 className="font-display text-3xl tracking-tight">Billing</h1>
      </header>

      <div className="rise rise-2 flex flex-col gap-6">
        {overPlan && (
          <div
            className={`rounded-2xl px-5 py-4 text-sm ${
              overPlan.state === "over"
                ? "bg-danger-soft text-danger-text"
                : "bg-gold-soft text-gold-text"
            }`}
          >
            <p className="font-medium">
              {overPlan.state === "over"
                ? `Your tenant has ${seats.seats} seats — above ${plan?.name ?? "your plan"}'s ${overPlan.seatMax}.`
                : `You're at ${seats.seats} of ${plan?.name ?? "your plan"}'s ${overPlan.seatMax} seats.`}{" "}
              {overPlan.recommendedTier
                ? `Move up to ${planByTier(overPlan.recommendedTier).name} with Change plan below — the switch prorates automatically.`
                : overPlan.state === "over"
                  ? "Your seat count is past our self-serve bands — talk to us about an MSP plan."
                  : "You're near the top of our self-serve bands — talk to us about an MSP plan."}
            </p>
          </div>
        )}
        <Card title="Status">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <Pill tone={STATE_TONE[entitlement.state] ?? "slate"}>
                {STATE_LABEL[entitlement.state] ?? entitlement.state}
              </Pill>
              {plan && (
                <span className="text-sm">
                  <span className="font-medium">{plan.name}</span>{" "}
                  <span className="text-ink-soft">{intervalLabel}</span>
                  {priceCents !== null && (
                    <span className="text-ink-soft">
                      {" · "}
                      {fmtMoney(priceCents, "EUR")}/
                      {sub?.interval === "year" ? "yr" : "mo"}
                    </span>
                  )}
                </span>
              )}
            </div>
            {datedLine && (
              <p className="text-sm text-ink-soft">{datedLine}</p>
            )}
            <p className="text-sm text-ink-faint">{seatBand}</p>
          </div>
        </Card>

        <Card title="Plan">
          <BillingActions
            isOwner={isOwner}
            state={entitlement.state}
            manageable={manageable}
            overSelfServe={overSelfServe}
            recommendedTier={recommendedTier}
            trialInfo={trialInfo}
            planParam={planParam}
            checkoutParam={checkoutParam}
          />
        </Card>
      </div>
    </div>
  );
}
