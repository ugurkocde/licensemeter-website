import { RULE_META } from "~/lib/rules";
import { isActionable, type RenewalPlan } from "~/server/renewals/plan";
import type { WasteRuleId } from "~/server/types";
import { comparableWaste } from "~/server/waste/spend";

/**
 * The executive one-page savings report as plain data. Pure (no env, no db),
 * so the PDF, the live preview and the PII test read one shape.
 *
 * Privacy by construction: the input takes only a finding's rule and monthly
 * impact, and a renewal plan item's product, seat and date fields. Nothing
 * that names or identifies a person (display names, UPNs, emails, user ids,
 * finding titles or details) can reach the output.
 */

/** Renewal actions inside this many days are listed. */
export const RENEWAL_WINDOW_DAYS = 90;
export const TREND_MONTHS = 6;
/** Rows that fit on the single page; the rest are summed into one line. */
export const MAX_RULE_ROWS = 8;
export const MAX_RENEWAL_ROWS = 8;

export type ExecutiveFinding = {
  rule: WasteRuleId;
  monthlyImpactCents: number;
};

export type ExecutiveLedger = {
  realizedThisMonth: number;
  runRate: number;
  cumulative: number;
  series: readonly { month: string; cents: number }[];
};

export type ExecutiveSnapshot = {
  /** yyyy-mm-dd */
  day: string;
  totalMonthlySpendCents: number;
  totalMonthlyWasteCents: number;
};

export type ExecutiveInput = {
  workspace: string;
  currency: string;
  now: Date;
  monthlySpendCents: number;
  /** Open and acknowledged findings. */
  findings: readonly ExecutiveFinding[];
  /** Null when the workspace has no savings ledger (Free). */
  ledger: ExecutiveLedger | null;
  plan: RenewalPlan;
  /** Any order; only the last TREND_MONTHS months are read. */
  snapshots: readonly ExecutiveSnapshot[];
};

export type ExecutiveRuleRow = {
  /** A rule label, or "Other rules" for the rows past MAX_RULE_ROWS. */
  label: string;
  count: number;
  monthlyCents: number;
};

export type ExecutiveRenewalAction = {
  /** Product or contract name, never a person. */
  label: string;
  vendor: string;
  kind: "subscription" | "contract";
  /** yyyy-mm-dd */
  renewalDate: string;
  /** yyyy-mm-dd, the last day to set the lower seat count. */
  decideBy: string;
  daysUntil: number;
  paidSeats: number;
  recommendedSeats: number;
  cutSeats: number;
  annualSavingsCents: number | null;
  unpricedCutSeats: number;
  estimate: boolean;
};

export type ExecutiveTrendPoint = {
  /** yyyy-mm */
  month: string;
  /** From the month's last snapshot; null when there is none. */
  spendCents: number | null;
  wasteCents: number | null;
  /** Monthly value recorded in the ledger that month; null without a ledger. */
  realizedCents: number | null;
};

export type ExecutiveSummary = {
  workspace: string;
  currency: string;
  /** ISO timestamp. */
  generatedAt: string;
  spend: { monthlyCents: number; annualCents: number };
  waste: {
    /** Capped at comparable spend, like the waste report. */
    monthlyCents: number;
    annualCents: number;
    openFindings: number;
    /** The cap lowered the sum of the findings. */
    capped: boolean;
    byRule: ExecutiveRuleRow[];
  };
  /** Null without the savings ledger. */
  savings: {
    realizedThisMonthCents: number;
    runRateCents: number;
    annualRunRateCents: number;
    cumulativeCents: number;
  } | null;
  renewals: {
    windowDays: number;
    /** Every actionable renewal in the window, earliest first. */
    count: number;
    cutSeats: number;
    annualSavingsCents: number;
    unpricedCutSeats: number;
    estimate: boolean;
    /** The first MAX_RENEWAL_ROWS actions. */
    actions: ExecutiveRenewalAction[];
  };
  trend: ExecutiveTrendPoint[];
};

const monthKey = (date: Date, offset: number) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1))
    .toISOString()
    .slice(0, 7);

const byRuleRows = (
  findings: readonly ExecutiveFinding[],
): ExecutiveRuleRow[] => {
  const agg = new Map<WasteRuleId, { count: number; monthlyCents: number }>();
  for (const f of findings) {
    const row = agg.get(f.rule) ?? { count: 0, monthlyCents: 0 };
    row.count += 1;
    row.monthlyCents += Math.max(0, f.monthlyImpactCents);
    agg.set(f.rule, row);
  }
  const rows = [...agg]
    .map(([rule, row]) => ({ label: RULE_META[rule].label, ...row }))
    .sort(
      (a, b) =>
        b.monthlyCents - a.monthlyCents ||
        b.count - a.count ||
        a.label.localeCompare(b.label),
    );
  if (rows.length <= MAX_RULE_ROWS) return rows;
  const rest = rows.slice(MAX_RULE_ROWS - 1);
  return [
    ...rows.slice(0, MAX_RULE_ROWS - 1),
    {
      label: "Other rules",
      count: rest.reduce((sum, r) => sum + r.count, 0),
      monthlyCents: rest.reduce((sum, r) => sum + r.monthlyCents, 0),
    },
  ];
};

const trendOf = (
  now: Date,
  snapshots: readonly ExecutiveSnapshot[],
  ledger: ExecutiveLedger | null,
): ExecutiveTrendPoint[] => {
  const latest = new Map<string, ExecutiveSnapshot>();
  for (const s of snapshots) {
    const month = s.day.slice(0, 7);
    const seen = latest.get(month);
    if (!seen || seen.day < s.day) latest.set(month, s);
  }
  const realized = new Map(ledger?.series.map((p) => [p.month, p.cents]));
  return Array.from({ length: TREND_MONTHS }, (_, i) => {
    const month = monthKey(now, i - (TREND_MONTHS - 1));
    const snap = latest.get(month);
    return {
      month,
      spendCents: snap?.totalMonthlySpendCents ?? null,
      wasteCents: snap?.totalMonthlyWasteCents ?? null,
      realizedCents: ledger ? (realized.get(month) ?? 0) : null,
    };
  });
};

export function buildExecutiveSummary(input: ExecutiveInput): ExecutiveSummary {
  const { plan, ledger } = input;
  const monthlySpend = Math.max(0, input.monthlySpendCents);
  const uncapped = input.findings.reduce(
    (sum, f) => sum + Math.max(0, f.monthlyImpactCents),
    0,
  );
  const monthlyWaste = comparableWaste(uncapped, monthlySpend);

  // Same rule as the overview's next renewal action, over the whole window.
  const due = plan.items.filter(
    (i) => isActionable(i) && i.daysUntil <= RENEWAL_WINDOW_DAYS,
  );

  return {
    workspace: input.workspace,
    currency: input.currency,
    generatedAt: input.now.toISOString(),
    spend: { monthlyCents: monthlySpend, annualCents: monthlySpend * 12 },
    waste: {
      monthlyCents: monthlyWaste,
      annualCents: monthlyWaste * 12,
      openFindings: input.findings.length,
      capped: monthlyWaste < uncapped,
      byRule: byRuleRows(input.findings),
    },
    savings: ledger && {
      realizedThisMonthCents: ledger.realizedThisMonth,
      runRateCents: ledger.runRate,
      annualRunRateCents: ledger.runRate * 12,
      cumulativeCents: ledger.cumulative,
    },
    renewals: {
      windowDays: RENEWAL_WINDOW_DAYS,
      count: due.length,
      cutSeats: due.reduce((sum, i) => sum + i.cutSeats, 0),
      annualSavingsCents: due.reduce(
        (sum, i) => sum + (i.annualSavingsCents ?? 0),
        0,
      ),
      unpricedCutSeats: due.reduce((sum, i) => sum + i.unpricedCutSeats, 0),
      estimate: due.some((i) => i.estimate),
      actions: due.slice(0, MAX_RENEWAL_ROWS).map((i) => ({
        label: i.label,
        vendor: i.vendor,
        kind: i.kind,
        renewalDate: i.renewalDate,
        decideBy: i.noticeDate,
        daysUntil: i.daysUntil,
        paidSeats: i.paidSeats,
        recommendedSeats: i.recommendedSeats,
        cutSeats: i.cutSeats,
        annualSavingsCents: i.annualSavingsCents,
        unpricedCutSeats: i.unpricedCutSeats,
        estimate: i.estimate,
      })),
    },
    trend: trendOf(input.now, input.snapshots, ledger),
  };
}

/**
 * What Free sees: its own headline numbers, without the renewal names, the
 * ledger or the per-rule breakdown that the full report carries.
 */
export const executiveTeaserOf = (
  summary: ExecutiveSummary,
): ExecutiveSummary => ({
  ...summary,
  waste: { ...summary.waste, byRule: [] },
  savings: null,
  renewals: { ...summary.renewals, actions: [] },
  trend: summary.trend.map((p) => ({ ...p, realizedCents: null })),
});
