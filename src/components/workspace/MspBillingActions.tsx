"use client";

import { useState } from "react";

import { IntervalToggle } from "~/components/pricing/IntervalToggle";
import { buttonClass } from "~/components/ui";
import { MSP_PRICE_ANNUAL_EUR, MSP_PRICE_EUR } from "~/lib/plans";
import type { PlanInterval } from "~/server/types";

/** German thousands separators, whole euros, matching the rest of the site. */
const fmtEuros = (n: number): string => new Intl.NumberFormat("de-DE").format(n);

type Props = {
  /** True once the account has a live Stripe subscription (manage, not subscribe). */
  manageable: boolean;
  checkoutParam?: string;
};

/**
 * Subscribe / manage controls for the MSP quantity subscription. Mirrors
 * BillingActions: interval toggle + a POST to the MSP checkout/portal routes,
 * then window.location to the returned Stripe url, with the same
 * stripe_unavailable + generic error messaging. MSP packaging is flat (one
 * per-tenant price), so there is no plan picker — just an interval choice.
 */
export const MspBillingActions = ({ manageable, checkoutParam }: Props) => {
  const [interval, setInterval] = useState<PlanInterval>("month");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startCheckout = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/msp/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interval }),
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
        case "msp_disabled":
          setError("Billing is not available yet.");
          break;
        case "stripe_unavailable":
          setError("Billing is temporarily unavailable, please try again in a moment.");
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
      const res = await fetch("/api/billing/msp/portal", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (res.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      // No subscription to manage: fall through to the subscribe controls below.
      if (data.error === "no_subscription") {
        setBusy(false);
        return;
      }
      if (data.error === "stripe_unavailable") {
        setError("Billing is temporarily unavailable, please try again in a moment.");
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

  const notice =
    checkoutParam === "success" ? (
      <p className="rounded-xl bg-good-soft px-4 py-2 text-sm text-good-text">
        Subscription active. Thank you.
      </p>
    ) : checkoutParam === "cancelled" ? (
      <p className="text-sm text-ink-faint">Checkout cancelled.</p>
    ) : null;

  let body: React.ReactNode;
  if (manageable) {
    // One portal entry point: Stripe's customer portal already exposes plan
    // changes and cancellation from its home (mirrors BillingActions).
    body = (
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={openPortal}
          disabled={busy}
          className={buttonClass("primary")}
        >
          Manage or cancel subscription
        </button>
      </div>
    );
  } else {
    const unit = interval === "year" ? MSP_PRICE_ANNUAL_EUR : MSP_PRICE_EUR;
    body = (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-ink-soft">
          One flat price per attached client tenant, billed by quantity on a
          single subscription. Attach or detach tenants below at any time — the
          quantity reconciles automatically.
        </p>
        <IntervalToggle
          interval={interval}
          onChange={setInterval}
          annualBadge="2 months free"
        />
        <div className="border border-line bg-card px-5 py-4">
          <div className="font-display text-2xl tracking-tight">
            € {fmtEuros(unit)}
            <span className="font-sans text-xs text-ink-soft">
              {interval === "year"
                ? " / tenant / year"
                : " / tenant / month"}
            </span>
          </div>
          {interval === "year" && (
            <div className="mt-1 text-xs font-medium text-brand-deep">
              2 months free
            </div>
          )}
        </div>
        <div>
          <button
            type="button"
            onClick={startCheckout}
            disabled={busy}
            className={buttonClass("primary")}
          >
            Subscribe
          </button>
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
