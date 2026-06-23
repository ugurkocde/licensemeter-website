import type { PlanInterval, PlanTier } from "~/server/types";

/**
 * Length of the no-card trial in days. Lives here (client-safe) rather than in
 * the server entitlement module so marketing copy can derive "${TRIAL_DAYS}-day"
 * without pulling a server module into the client bundle; entitlement.ts
 * re-exports it so existing server imports keep working.
 */
export const TRIAL_DAYS = 14;

/**
 * Shared, secret-free plan catalog used by the marketing pricing page, the
 * dashboard billing UI, and the server-side price/seat mapping. Prices are in
 * whole euros; annual is 10x monthly (two months free). The Stripe Price ids
 * live in env vars (server only) and are mapped from these tiers in
 * src/server/stripe.ts.
 */
export type Plan = {
  tier: PlanTier;
  name: string;
  /** Monthly price in euros. */
  monthly: number;
  /** Annual price in euros (10x monthly). */
  annual: number;
  /** Display label, German thousands separators to match the site. */
  seats: string;
  /** Upper bound of the seat band (inclusive); above the top band -> MSP. */
  seatMax: number;
  featured: boolean;
};

export const PLANS: Plan[] = [
  { tier: "starter", name: "Starter", monthly: 79, annual: 790, seats: "up to 250 seats", seatMax: 250, featured: false },
  { tier: "growth", name: "Growth", monthly: 199, annual: 1990, seats: "up to 1.000 seats", seatMax: 1000, featured: true },
  { tier: "scale", name: "Scale", monthly: 499, annual: 4990, seats: "up to 2.500 seats", seatMax: 2500, featured: false },
];

/** Largest self-serve seat count; above this -> contact sales (MSP). */
export const MAX_SELF_SERVE_SEATS = 2500;

/**
 * MSP packaging: a flat price per connected client tenant, billed by quantity on
 * one MSP-account subscription (not per-workspace). Annual is 10x (two months
 * free), matching the self-serve convention. The flat price holds for normal
 * SMB-sized client tenants; a client tenant above MSP_LARGE_TENANT_SEATS is a
 * rare enterprise outlier priced separately (contact us) so one large tenant is
 * never underpriced at the flat rate.
 */
export const MSP_PRICE_EUR = 50;
export const MSP_PRICE_ANNUAL_EUR = 500;
export const MSP_LARGE_TENANT_SEATS = 1000;

export const planByTier = (tier: PlanTier): Plan =>
  PLANS.find((p) => p.tier === tier)!;

/** Smallest band that fits the seat count; null when over self-serve (-> MSP). */
export const tierForSeats = (seats: number): PlanTier | null =>
  PLANS.find((p) => seats <= p.seatMax)?.tier ?? null;

const TIER_ORDER: PlanTier[] = ["starter", "growth", "scale"];

/** The next band up, or null when already on the top self-serve band (-> MSP). */
export const nextTier = (tier: PlanTier): PlanTier | null => {
  const i = TIER_ORDER.indexOf(tier);
  return i >= 0 && i < TIER_ORDER.length - 1 ? (TIER_ORDER[i + 1] ?? null) : null;
};

/** Seats at or above this fraction of the band cap trigger an upgrade nudge. */
export const SEAT_NUDGE_RATIO = 0.85;

export type SeatNudge = {
  state: "approaching" | "over";
  /** Seat cap of the tenant's current band. */
  seatMax: number;
  /** Band to move to; null means past self-serve (-> MSP / contact sales). */
  recommendedTier: PlanTier | null;
};

/**
 * Whether a subscribed tenant should be nudged to change plan: "over" once its
 * seat count passes the current band cap, "approaching" within
 * SEAT_NUDGE_RATIO of it, null when comfortably inside. Pure and side-effect
 * free — nudges only; we never auto-charge a higher tier.
 */
export const seatNudge = (
  currentTier: PlanTier,
  seats: number,
): SeatNudge | null => {
  const seatMax = planByTier(currentTier).seatMax;
  if (seats > seatMax) {
    return { state: "over", seatMax, recommendedTier: tierForSeats(seats) };
  }
  if (seats >= Math.floor(seatMax * SEAT_NUDGE_RATIO)) {
    return { state: "approaching", seatMax, recommendedTier: nextTier(currentTier) };
  }
  return null;
};

/** Annual price expressed per month, for "/mo billed annually" copy. */
export const annualPerMonth = (plan: Plan): number => Math.round(plan.annual / 12);

export const priceEurosFor = (tier: PlanTier, interval: PlanInterval): number =>
  interval === "year" ? planByTier(tier).annual : planByTier(tier).monthly;

/** MSP per-tenant unit price in whole euros for an interval (annual = 10x monthly). */
export const mspPriceEurosFor = (interval: PlanInterval): number =>
  interval === "year" ? MSP_PRICE_ANNUAL_EUR : MSP_PRICE_EUR;

/** URL/checkout plan token, e.g. "growth:annual". */
export const planString = (tier: PlanTier, interval: PlanInterval): string =>
  `${tier}:${interval === "year" ? "annual" : "monthly"}`;

export const parsePlanString = (
  value: string | null | undefined,
): { tier: PlanTier; interval: PlanInterval } | null => {
  if (!value) return null;
  const [tierPart, intervalPart] = value.split(":");
  const plan = PLANS.find((p) => p.tier === tierPart);
  if (!plan) return null;
  if (intervalPart !== "monthly" && intervalPart !== "annual") return null;
  return { tier: plan.tier, interval: intervalPart === "annual" ? "year" : "month" };
};
