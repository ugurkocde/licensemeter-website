"use client";

import { useState } from "react";

import { IntervalToggle } from "~/components/pricing/IntervalToggle";
import { buttonClass } from "~/components/ui";
import {
  PLANS,
  annualPerMonth,
  planString,
  priceEurosFor,
} from "~/lib/plans";
import type { PlanInterval } from "~/server/types";

/** German thousands separators, whole euros, to match the rest of the site. */
const fmtEuros = (n: number): string => new Intl.NumberFormat("de-DE").format(n);

export const PricingTiers = ({
  entraConfigured,
}: {
  entraConfigured: boolean;
}) => {
  const [interval, setInterval] = useState<PlanInterval>("month");

  return (
    <div>
      <div className="flex justify-center">
        <IntervalToggle interval={interval} onChange={setInterval} />
      </div>

      <div className="mt-8 grid gap-px border border-line bg-line md:grid-cols-3">
        {PLANS.map((plan) => {
          const perMonth =
            interval === "year"
              ? annualPerMonth(plan)
              : priceEurosFor(plan.tier, "month");
          const annualTotal = priceEurosFor(plan.tier, "year");
          const ctaHref = entraConfigured
            ? `/api/auth/signin?returnTo=${encodeURIComponent(
                "/app/billing?plan=" + planString(plan.tier, interval),
              )}`
            : "/#get-started";
          return (
            <div
              key={plan.tier}
              className={`flex flex-col bg-card px-6 py-6 ${
                plan.featured
                  ? "outline outline-2 -outline-offset-1 outline-ink"
                  : ""
              }`}
            >
              <div className="flex items-baseline justify-between">
                <h2 className="text-xs font-medium tracking-[0.18em] text-ink-faint uppercase">
                  {plan.name}
                </h2>
                {plan.featured && (
                  <span className="bg-ink px-2 py-0.5 text-[11px] font-medium tracking-wide text-canvas uppercase">
                    Most popular
                  </span>
                )}
              </div>
              <div className="mt-4 font-display text-4xl tracking-tight">
                € {fmtEuros(perMonth)}
                <span className="font-sans text-sm text-ink-soft"> / month</span>
              </div>
              <div className="mt-1 text-sm text-ink-soft">{plan.seats}</div>
              {interval === "year" && (
                <div className="mt-1 text-xs text-ink-faint">
                  billed annually (€ {fmtEuros(annualTotal)}) · 2 months free
                </div>
              )}
              <div className="mt-6">
                <a
                  href={ctaHref}
                  className={buttonClass(
                    plan.featured ? "primary" : "secondary",
                    "w-full",
                  )}
                >
                  {entraConfigured
                    ? "Start 14-day trial"
                    : "Start free"}
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
