"use client";

import { useEffect, useRef, useState } from "react";

import { IntervalToggle } from "~/components/pricing/IntervalToggle";
import { ButtonAnchor, ButtonLink, buttonClass } from "~/components/ui";
import {
  PLANS,
  parsePlanString,
  planString,
} from "~/lib/plans";
import { SUPPORT_MAILTO } from "~/lib/support";
import type { PlanInterval, PlanTier } from "~/server/types";

type Props = {
  isOwner: boolean;
  state: string;
  manageable: boolean;
  overSelfServe: boolean;
  recommendedTier: PlanTier | null;
  /** Present while the no-card trial is running; subscribing preserves it. */
  trialInfo?: { daysLeft: number; endsAt: string } | null;
  planParam?: string;
  checkoutParam?: string;
};

/** German thousands separators, whole euros, matching the rest of the site. */
const fmtEuros = (n: number): string => new Intl.NumberFormat("de-DE").format(n);

const MspCard = () => (
  <div className="flex flex-col gap-4 rounded-2xl border border-line bg-subtle p-5">
    <div>
      <p className="text-sm font-medium">
        Your tenant has more than 2,500 seats. Self-serve plans stop here.
      </p>
      <p className="mt-1 text-sm text-ink-soft">
        We price larger tenants and MSP portfolios directly. Get in touch and
        we will set you up.
      </p>
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <ButtonLink href="/msp" variant="primary">
        See the MSP plan
      </ButtonLink>
      <ButtonAnchor href={SUPPORT_MAILTO}>Contact support</ButtonAnchor>
    </div>
  </div>
);

export const BillingActions = ({
  isOwner,
  state,
  manageable,
  overSelfServe,
  recommendedTier,
  trialInfo,
  planParam,
  checkoutParam,
}: Props) => {
  const [interval, setInterval] = useState<PlanInterval>("month");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Switched on when Stripe reports the tenant outgrew self-serve mid-flow.
  const [forcedMsp, setForcedMsp] = useState(false);
  const autoFired = useRef(false);

  const startCheckout = async (plan: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (res.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      switch (data.error) {
        case "price_unconfigured":
        case "billing_disabled":
          setError("Billing is not available yet.");
          break;
        case "seats_exceed_self_serve":
          setForcedMsp(true);
          break;
        default:
          setError("Could not start checkout, try again.");
      }
      setBusy(false);
    } catch {
      setError("Could not start checkout, try again.");
      setBusy(false);
    }
  };

  const openPortal = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (res.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      // No subscription to manage: fall through to the plan picker below.
      if (data.error === "no_subscription") {
        setBusy(false);
        return;
      }
      setError("Could not open the billing portal, try again.");
      setBusy(false);
    } catch {
      setError("Could not open the billing portal, try again.");
      setBusy(false);
    }
  };

  // Auto-open checkout when arriving from a pricing CTA (?plan=growth:annual).
  useEffect(() => {
    if (autoFired.current) return;
    if (!isOwner || !planParam || manageable || overSelfServe) return;
    const parsed = parsePlanString(planParam);
    if (!parsed) return;
    autoFired.current = true;
    void startCheckout(planString(parsed.tier, parsed.interval));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!isOwner) {
    return (
      <p className="text-sm text-ink-soft">
        Billing is managed by a workspace owner.
      </p>
    );
  }

  const notice =
    checkoutParam === "success" ? (
      <p className="rounded-xl bg-good-soft px-4 py-2 text-sm text-good-text">
        Subscription active. Thank you.
      </p>
    ) : checkoutParam === "cancelled" ? (
      <p className="text-sm text-ink-faint">Checkout cancelled.</p>
    ) : null;

  const autoStarting = Boolean(planParam && !manageable && autoFired.current);

  let body: React.ReactNode;
  if (autoStarting && busy) {
    body = <p className="text-sm text-ink-soft">Starting checkout…</p>;
  } else if (manageable) {
    body = (
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={openPortal}
          disabled={busy}
          className={buttonClass("primary")}
        >
          Manage billing
        </button>
        <button
          type="button"
          onClick={openPortal}
          disabled={busy}
          className={buttonClass("secondary")}
        >
          Change plan
        </button>
      </div>
    );
  } else if (overSelfServe || forcedMsp) {
    body = <MspCard />;
  } else {
    body = (
      <div className="flex flex-col gap-4">
        {state === "incomplete" && (
          <p className="text-sm text-ink-soft">
            Your last payment was not completed — choose a plan to try again.
          </p>
        )}
        {trialInfo && (
          <p className="text-sm text-ink-soft">
            Subscribe now to lock in your plan. You keep your remaining{" "}
            {trialInfo.daysLeft} free trial{" "}
            {trialInfo.daysLeft === 1 ? "day" : "days"} — billing starts{" "}
            {trialInfo.endsAt} and you can cancel anytime before then.
          </p>
        )}
        <IntervalToggle interval={interval} onChange={setInterval} />
        <div className="grid gap-px border border-line bg-line sm:grid-cols-3">
          {PLANS.map((plan) => {
            const recommended = plan.tier === recommendedTier;
            const price =
              interval === "year" ? plan.annual : plan.monthly;
            return (
              <div
                key={plan.tier}
                className={`flex flex-col bg-card px-5 py-5 ${
                  recommended
                    ? "outline outline-2 -outline-offset-1 outline-brand"
                    : ""
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-medium tracking-[0.18em] text-ink-faint uppercase">
                    {plan.name}
                  </span>
                  {recommended && (
                    <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-medium tracking-wide text-brand-deep uppercase">
                      Recommended for your size
                    </span>
                  )}
                </div>
                <div className="mt-2 font-display text-2xl tracking-tight">
                  € {fmtEuros(price)}
                  <span className="font-sans text-xs text-ink-soft">
                    {interval === "year" ? " / year" : " / month"}
                  </span>
                </div>
                {interval === "year" && (
                  <div className="mt-1 text-xs font-medium text-brand-deep">
                    2 months free
                  </div>
                )}
                <div className="mt-1 text-xs text-ink-soft">{plan.seats}</div>
                <button
                  type="button"
                  onClick={() =>
                    startCheckout(planString(plan.tier, interval))
                  }
                  disabled={busy}
                  className={buttonClass(
                    recommended ? "primary" : "secondary",
                    "mt-4 w-full",
                  )}
                >
                  {trialInfo ? "Subscribe" : "Choose"} {plan.name}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {notice}
      {body}
      {error && <p className="text-sm text-danger-text">{error}</p>}
    </div>
  );
};
