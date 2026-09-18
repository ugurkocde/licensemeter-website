import type {
  EntitlementSource,
  EntitlementStatus,
  PaidPlan,
} from "~/server/types";

export type Plan = "free" | PaidPlan;

/** Everything a paid plan can switch on. Free features are never listed here. */
export const FEATURES = [
  "signedDpa",
  "history24",
  "mcp",
  "whiteLabel",
  "portfolioAlerts",
  "mspTeam",
] as const;

export type Feature = (typeof FEATURES)[number];

/** The single plan-to-features map. MSP includes everything in Pro. */
const PRO_FEATURES: readonly Feature[] = ["signedDpa", "history24", "mcp"];

export const PLAN_FEATURES: Record<Plan, readonly Feature[]> = {
  free: [],
  pro: PRO_FEATURES,
  msp: [...PRO_FEATURES, "whiteLabel", "portfolioAlerts", "mspTeam"],
};

/** The cheapest plan that includes a feature, for upgrade prompts. */
export const planFor = (feature: Feature): PaidPlan =>
  PLAN_FEATURES.pro.includes(feature) ? "pro" : "msp";

export type EntitlementState =
  | "free"
  | "demo"
  /** Billing is not configured: a self-hosted install with every feature. */
  | "selfHosted"
  | "trialing"
  | "active"
  | "pastDue"
  | "canceling"
  | "comped"
  /** An MSP plan exists, but this workspace is beyond its covered quantity. */
  | "overQuantity";

export type Entitlement = {
  plan: Plan;
  state: EntitlementState;
  source: EntitlementSource | null;
  /** Plain object so it can cross into client components. */
  features: Record<Feature, boolean>;
  /** When access ends or renews, when the provider reported one. */
  currentPeriodEnd: Date | null;
};

/** The columns of an entitlements row that decide access. */
export type EntitlementRecord = {
  plan: PaidPlan;
  source: EntitlementSource;
  status: EntitlementStatus;
  trialEnd: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
};

export type EntitlementInput = {
  tenant: { isDemo: boolean };
  /** The workspace's own row, or the row of the MSP account it belongs to. */
  record: EntitlementRecord | null;
  /** False when the row is an MSP plan and this workspace is beyond quantity. */
  covered: boolean;
  billingEnabled: boolean;
  now: Date;
};

const featuresOf = (plan: Plan): Record<Feature, boolean> => {
  const included = PLAN_FEATURES[plan];
  return Object.fromEntries(
    FEATURES.map((f) => [f, included.includes(f)]),
  ) as Record<Feature, boolean>;
};

const resolved = (
  plan: Plan,
  state: EntitlementState,
  record: EntitlementRecord | null = null,
): Entitlement => ({
  plan,
  state,
  source: record?.source ?? null,
  features: featuresOf(plan),
  currentPeriodEnd: record?.currentPeriodEnd ?? null,
});

const stillRunning = (end: Date | null, now: Date) =>
  end !== null && end.getTime() > now.getTime();

/** The paid state a row grants right now, or null when it grants nothing. */
const paidState = (
  record: EntitlementRecord,
  now: Date,
): EntitlementState | null => {
  // A comp is set by hand and outlives whatever a provider reports.
  if (record.source === "comped") return "comped";
  switch (record.status) {
    case "active":
      return record.cancelAtPeriodEnd ? "canceling" : "active";
    case "trialing":
      // Either date still ahead keeps the trial: a missed webhook must never
      // cut off a customer the provider has already started billing.
      return stillRunning(record.trialEnd, now) ||
        stillRunning(record.currentPeriodEnd, now)
        ? "trialing"
        : null;
    case "past_due":
      // The provider is still retrying the payment; access ends when it gives
      // up and reports canceled or suspended.
      return "pastDue";
    case "canceled":
      return stillRunning(record.currentPeriodEnd, now) ? "canceling" : null;
    case "suspended":
      return null;
  }
};

/**
 * The only place that decides what a workspace may use. Free keeps everything
 * it has today; a paid plan only adds the features in PLAN_FEATURES. Nothing
 * here ever locks a workspace or deletes data.
 */
export function entitlementOf(input: EntitlementInput): Entitlement {
  const { tenant, record, covered, billingEnabled, now } = input;
  if (!billingEnabled) return resolved("msp", "selfHosted");
  if (tenant.isDemo) return resolved("msp", "demo");
  if (!record) return resolved("free", "free");
  const state = paidState(record, now);
  if (!state) return resolved("free", "free");
  if (!covered) return resolved("free", "overQuantity", record);
  return resolved(record.plan, state, record);
}

export const hasFeature = (entitlement: Entitlement, feature: Feature) =>
  entitlement.features[feature];
