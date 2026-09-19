import { fmtMoney } from "~/lib/format";
import type { WasteRuleId } from "~/server/types";

/**
 * Offboarding leaks: someone left or was disabled, the seat keeps billing.
 * These recur forever until acted on, so they alert immediately on sync
 * instead of waiting up to a week for the digest. Pure helper, no IO.
 */
export const LEAK_RULES: ReadonlySet<WasteRuleId> = new Set<WasteRuleId>([
  "disabled_account_with_license",
  "adobe_disabled_in_entra",
  "adobe_orphaned",
  "saas_disabled_in_entra",
  "saas_orphaned",
]);

/** Newly inserted findings that belong to the offboarding-leak rule class. */
export const pickLeakFindings = <T extends { rule: WasteRuleId }>(
  inserted: T[],
): T[] => inserted.filter((f) => LEAK_RULES.has(f.rule));

/** Rows the alert lists; the remainder is summarized as one subtotal. */
const SHOWN = 10;

/**
 * The figures of one alert. Highest cost first, so the table never shows ten
 * zero-cost rows under a headline of thousands, and the shown and omitted
 * subtotals always add up to the headline.
 */
export const summarizeLeakFindings = <
  T extends { title: string; monthlyImpactCents: number },
>(
  rows: T[],
) => {
  const sorted = [...rows].sort(
    (a, b) =>
      b.monthlyImpactCents - a.monthlyImpactCents ||
      a.title.localeCompare(b.title),
  );
  const items = sorted.slice(0, SHOWN);
  const sum = (values: T[]) =>
    values.reduce((total, row) => total + row.monthlyImpactCents, 0);
  return {
    count: rows.length,
    totalCents: sum(sorted),
    shownCents: sum(items),
    omittedCount: sorted.length - items.length,
    omittedCents: sum(sorted.slice(items.length)),
    /** Findings that add nothing to the estimate: a free license or no price. */
    zeroCount: rows.filter((row) => row.monthlyImpactCents === 0).length,
    items,
  };
};

/**
 * "Potential" and "estimated" on purpose: a first scan reports leaks that have
 * existed for months, so the figure is no measured increase of the bill.
 */
export const leakAlertSubject = (
  count: number,
  cents: number,
  currency: string,
  tenantName: string,
): string =>
  `LicenseMeter: ${count} potential license leak${count === 1 ? "" : "s"} detected in ${tenantName} (${fmtMoney(cents, currency)}/mo estimated)`;
