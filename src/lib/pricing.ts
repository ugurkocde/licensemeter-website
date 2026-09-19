/**
 * The hosted plan prices, in whole euros. One source for the portal billing
 * page and the public pricing page. Dependency-free on purpose: the providers
 * charge what is configured on their side, this file only says what we show.
 */

export type PricedPlan = "pro" | "msp";
export type BillingInterval = "month" | "year";

export const BILLING_INTERVALS = ["month", "year"] as const;

export const PRICE_CURRENCY = "EUR";

export const PLAN_PRICES: Record<
  PricedPlan,
  Record<BillingInterval, number>
> = {
  pro: { month: 99, year: 990 },
  msp: { month: 299, year: 2990 },
};

/** Client tenants covered by the MSP base price. */
export const MSP_INCLUDED_TENANTS = 10;

/** Each client tenant beyond the included ones. */
export const MSP_EXTRA_TENANT_PRICE: Record<BillingInterval, number> = {
  month: 25,
  year: 250,
};

export const TRIAL_DAYS = 30;

export const isBillingInterval = (v: unknown): v is BillingInterval =>
  v === "month" || v === "year";

/** "EUR 2,990": code first, comma grouping, the same on server and client. */
export const formatPrice = (amount: number): string =>
  `${PRICE_CURRENCY} ${String(Math.round(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;

export const intervalLabel = (interval: BillingInterval): string =>
  interval === "month" ? "per month" : "per year";

/** "EUR 99 per month". */
export const planPriceLabel = (
  plan: PricedPlan,
  interval: BillingInterval,
): string =>
  `${formatPrice(PLAN_PRICES[plan][interval])} ${intervalLabel(interval)}`;

/** "EUR 25 per month", for each tenant beyond the included ones. */
export const extraTenantPriceLabel = (interval: BillingInterval): string =>
  `${formatPrice(MSP_EXTRA_TENANT_PRICE[interval])} ${intervalLabel(interval)}`;

/** What a year costs less than twelve monthly payments. */
export const yearlySaving = (plan: PricedPlan): number =>
  PLAN_PRICES[plan].month * 12 - PLAN_PRICES[plan].year;

/** The MSP price for a number of client tenants, extras included. */
export const mspPriceFor = (
  tenants: number,
  interval: BillingInterval,
): number => {
  const extra = Math.max(0, Math.floor(tenants) - MSP_INCLUDED_TENANTS);
  return PLAN_PRICES.msp[interval] + extra * MSP_EXTRA_TENANT_PRICE[interval];
};
