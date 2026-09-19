import { Check } from "lucide-react";
import Link from "next/link";

import { BillingRedirectButton } from "~/components/billing/BillingRedirectButton";
import {
  billingHref,
  planCardLines,
  type PlanCardLine,
} from "~/components/billing/billingView";
import { ButtonAnchor, Pill } from "~/components/ui";
import { planName } from "~/lib/planLabel";
import {
  BILLING_INTERVALS,
  formatPrice,
  intervalLabel,
  PLAN_PRICES,
  yearlySaving,
  type BillingInterval,
  type PricedPlan,
} from "~/lib/pricing";
import type { Feature } from "~/server/entitlement";

const INTERVAL_NAME: Record<BillingInterval, string> = {
  month: "Monthly",
  year: "Yearly",
};

/**
 * Monthly or yearly, as two plain links: the choice lives in the URL, so it
 * works without scripts and survives a reload.
 */
export const IntervalChoice = ({
  interval,
  feature,
}: {
  interval: BillingInterval;
  feature: Feature | null;
}) => (
  <nav
    aria-label="Billing interval"
    className="border-line bg-card inline-flex max-w-full rounded-xl border p-1"
  >
    {BILLING_INTERVALS.map((option) => {
      const selected = option === interval;
      return (
        <Link
          key={option}
          href={billingHref(option, feature)}
          scroll={false}
          aria-current={selected ? "true" : undefined}
          className={`inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-medium transition ${
            selected
              ? "bg-ink text-white"
              : "text-ink-soft hover:text-ink hover:bg-subtle"
          }`}
        >
          {INTERVAL_NAME[option]}
        </Link>
      );
    })}
  </nav>
);

const Line = ({ line }: { line: PlanCardLine }) => (
  <li className="flex items-start gap-2.5 text-sm">
    <Check
      aria-hidden="true"
      className="text-brand-text mt-0.5 size-4 shrink-0"
    />
    <span className="min-w-0">
      <span className={line.comingSoon ? "text-ink-soft" : undefined}>
        {line.text}
      </span>
      {line.comingSoon && (
        <Pill tone="outline" className="ml-2 align-middle">
          Coming soon
        </Pill>
      )}
    </span>
  </li>
);

export type PlanCardStatus =
  /** The plan this workspace or MSP account has right now. */
  | "current"
  /** Pro, seen from an MSP plan that already contains it. */
  | "included"
  | "available";

export const PlanCard = ({
  plan,
  interval,
  status,
  canBuy,
  marketplaceUrl,
  cardCheckout,
  note,
}: {
  plan: PricedPlan;
  interval: BillingInterval;
  status: PlanCardStatus;
  /** An owner of a real workspace; everyone else only reads the card. */
  canBuy: boolean;
  /** The public Marketplace listing, when this channel is offered. */
  marketplaceUrl: string | null;
  /** Whether card checkout through Polar is offered. */
  cardCheckout: boolean;
  note?: string;
}) => {
  const headingId = `plan-${plan}`;
  const name = planName(plan);
  const showActions = canBuy && status === "available";
  return (
    <section
      aria-labelledby={headingId}
      className="border-line bg-card shadow-card flex min-w-0 flex-col rounded-2xl border p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={headingId} className="font-display text-xl tracking-tight">
          {name}
        </h3>
        {status === "current" && <Pill tone="brand">Current plan</Pill>}
        {status === "included" && (
          <Pill tone="outline">Included in your plan</Pill>
        )}
      </div>
      <p className="mt-3 flex flex-wrap items-baseline gap-x-2">
        <span className="font-display text-3xl tracking-tight">
          {formatPrice(PLAN_PRICES[plan][interval])}
        </span>
        <span className="text-ink-soft text-sm">{intervalLabel(interval)}</span>
      </p>
      <p className="text-ink-faint mt-1 text-xs">
        {interval === "year"
          ? `${formatPrice(yearlySaving(plan))} less than paying monthly for a year.`
          : `Or ${formatPrice(PLAN_PRICES[plan].year)} per year.`}
      </p>

      <ul className="mt-5 flex flex-col gap-2.5">
        {planCardLines(plan, interval).map((line) => (
          <Line key={line.text} line={line} />
        ))}
      </ul>

      {showActions && (marketplaceUrl ?? cardCheckout) && (
        <div className="mt-6 flex flex-col gap-2.5">
          {marketplaceUrl && (
            <ButtonAnchor
              href={marketplaceUrl}
              target="_blank"
              rel="noopener noreferrer"
              variant={cardCheckout ? "secondary" : "primary"}
              className="w-full text-center"
            >
              Buy on Microsoft Marketplace
              <span className="sr-only">: {name} plan, opens in a new tab</span>
            </ButtonAnchor>
          )}
          {cardCheckout && (
            <BillingRedirectButton
              target={{ kind: "checkout", plan, interval }}
              label="Pay by card"
              srDetail={`${name} plan`}
            />
          )}
        </div>
      )}
      {showActions && !marketplaceUrl && !cardCheckout && (
        <p className="text-ink-soft mt-6 text-sm">
          Buying is not open yet. Nothing changes for your workspace until it
          is.
        </p>
      )}
      {note && <p className="text-ink-soft mt-4 text-xs">{note}</p>}
    </section>
  );
};
