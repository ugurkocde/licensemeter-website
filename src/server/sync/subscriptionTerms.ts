import type { GraphSubscription } from "~/server/graph/types";

export type SkuTerms = {
  /** Seats of enabled trial subscriptions; Microsoft counts them as prepaid. */
  trialUnits: number;
  /**
   * Renewal date of the paid seats: the earliest nextLifecycleDateTime among
   * enabled paid subscriptions. When every enabled subscription of the SKU is
   * a trial, the earliest trial end instead. Null when Microsoft reports none
   * (free and viral SKUs).
   */
  nextLifecycleAt: Date | null;
};

const earliest = (values: (string | null)[]): Date | null =>
  values.reduce<Date | null>((min, v) => {
    if (!v) return min;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return min;
    return !min || d < min ? d : min;
  }, null);

/**
 * Folds /directory/subscriptions into one row per SKU. Only "Enabled"
 * subscriptions count: their seats are the ones in subscribedSkus'
 * prepaidUnits.enabled, which is what the trial seats are subtracted from.
 */
export const subscriptionTermsBySku = (
  subscriptions: readonly GraphSubscription[],
): Map<string, SkuTerms> => {
  const bySku = new Map<string, GraphSubscription[]>();
  for (const s of subscriptions) {
    if (s.status !== "Enabled") continue;
    bySku.set(s.skuId, [...(bySku.get(s.skuId) ?? []), s]);
  }
  const terms = new Map<string, SkuTerms>();
  for (const [skuId, subs] of bySku) {
    const trials = subs.filter((s) => s.isTrial);
    const paid = subs.filter((s) => !s.isTrial);
    terms.set(skuId, {
      trialUnits: trials.reduce(
        (sum, s) => sum + Math.max(0, s.totalLicenses),
        0,
      ),
      nextLifecycleAt: earliest(
        (paid.length > 0 ? paid : trials).map((s) => s.nextLifecycleDateTime),
      ),
    });
  }
  return terms;
};
