import { FEATURE_COPY } from "~/lib/featureCopy";
import { fmtDate } from "~/lib/format";
import {
  MSP_INCLUDED_TENANTS,
  extraTenantPriceLabel,
  isBillingInterval,
  type BillingInterval,
  type PricedPlan,
} from "~/lib/pricing";
import {
  FEATURES,
  PLAN_FEATURES,
  type Entitlement,
  type EntitlementState,
  type Feature,
} from "~/server/entitlement";
import type { EntitlementSource } from "~/server/types";

/** Pure view logic of the billing page, kept apart so it can be unit tested. */

export const SOURCE_LABEL: Record<EntitlementSource, string> = {
  marketplace: "Microsoft Marketplace",
  polar: "Card via Polar",
  comped: "Provided by LicenseMeter",
};

/** In the MSP plan on paper, not built yet. Never sold as available. */
export const COMING_SOON: readonly Feature[] = ["portfolioAlerts", "mspTeam"];

export const isComingSoon = (feature: Feature) => COMING_SOON.includes(feature);

export type BillingNotice = "checkout" | "marketplace";

export type BillingParams = {
  interval: BillingInterval;
  feature: Feature | null;
  notice: BillingNotice | null;
};

type RawParams = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) =>
  Array.isArray(v) ? v[0] : v;

/** Everything from the URL is checked against a closed list before it is used. */
export const parseBillingParams = (raw: RawParams): BillingParams => {
  const interval = first(raw.interval);
  const feature = first(raw.feature);
  return {
    interval: isBillingInterval(interval) ? interval : "month",
    feature: FEATURES.find((f) => f === feature) ?? null,
    notice:
      first(raw.checkout) === "success"
        ? "checkout"
        : first(raw.marketplace) === "activated"
          ? "marketplace"
          : null,
  };
};

/** The billing URL for an interval, keeping the feature a lock sent along. */
export const billingHref = (
  interval: BillingInterval,
  feature: Feature | null,
): string => {
  const params = new URLSearchParams();
  if (interval !== "month") params.set("interval", interval);
  if (feature) params.set("feature", feature);
  const query = params.toString();
  return query ? `/app/billing?${query}` : "/app/billing";
};

const STATE_LABEL: Record<EntitlementState, string> = {
  free: "Free",
  demo: "Demo",
  selfHosted: "Self-hosted",
  trialing: "Trial",
  active: "Active",
  pastDue: "Payment due",
  canceling: "Canceled",
  comped: "Active",
  overQuantity: "Not covered",
};

export const stateLabel = (state: EntitlementState): string =>
  STATE_LABEL[state];

/** A subscription a provider is still running, so a second one would double charge. */
export const isRunning = (state: EntitlementState): boolean =>
  state === "trialing" ||
  state === "active" ||
  state === "pastDue" ||
  state === "canceling";

/** When the plan renews or ends, in words. Null when there is nothing to say. */
export const planDateLine = (
  entitlement: Pick<Entitlement, "state" | "currentPeriodEnd">,
): string | null => {
  const end = entitlement.currentPeriodEnd;
  switch (entitlement.state) {
    case "trialing":
      return end ? `Trial ends ${fmtDate(end)}` : "In trial";
    case "active":
      return end ? `Renews ${fmtDate(end)}` : null;
    case "canceling":
      return end ? `Ends ${fmtDate(end)}` : "Ends with the current period";
    case "pastDue":
      return "The last payment did not go through. The plan stays on while the payment is retried.";
    case "comped":
      return end ? `Until ${fmtDate(end)}` : null;
    default:
      return null;
  }
};

export type PlanCardLine = { text: string; comingSoon?: boolean };

/** Support and uptime are part of the plan, but nothing the app switches on. */
const PRO_SERVICE_LINES: PlanCardLine[] = [
  { text: "Support by email" },
  { text: "99.9% uptime target, tracked on a public status page" },
];

const featureLine = (feature: Feature): PlanCardLine => ({
  text: FEATURE_COPY[feature].label,
  comingSoon: isComingSoon(feature),
});

/** What a plan adds, built from the same map the server enforces. */
export const planCardLines = (
  plan: PricedPlan,
  interval: BillingInterval,
): PlanCardLine[] => {
  if (plan === "pro") {
    return [
      { text: "One tenant" },
      ...PRO_SERVICE_LINES,
      ...PLAN_FEATURES.pro.map(featureLine),
    ];
  }
  const mspOnly = PLAN_FEATURES.msp.filter(
    (f) => !PLAN_FEATURES.pro.includes(f),
  );
  return [
    { text: "Everything in Pro" },
    {
      text: `${MSP_INCLUDED_TENANTS} client tenants included, each further tenant ${extraTenantPriceLabel(interval)}`,
    },
    { text: "Sub-processor data processing agreement (AVV)" },
    ...mspOnly.map(featureLine),
  ];
};

/** "3 of 10 covered", counting only what the plan covers right now. */
export const coverageSummary = (
  coveredCount: number,
  quantity: number,
): string => `${coveredCount} of ${quantity} covered`;
