import type { FindingStatus } from "~/server/types";
import { isValidIsoDate } from "~/lib/isoDate";

/**
 * Pure helpers behind the weekly digest's "what changed" framing: the 7-day
 * finding delta, the AI API spend week-over-week split, and the
 * renewal-window date math. No DB, no IO, unit tested.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** The digest's look-back window. */
export const DELTA_WINDOW_MS = 7 * DAY_MS;

export type DeltaFindingRow = {
  status: FindingStatus;
  firstSeenAt: Date;
  resolvedAt: Date | null;
  monthlyImpactCents: number;
};

export type DigestDelta = {
  /** Findings that first appeared within the window and are still open/acknowledged. */
  newCount: number;
  newCents: number;
  /** Findings resolved within the window. */
  resolvedCount: number;
  resolvedCents: number;
};

const withinWindow = (t: Date, now: Date): boolean =>
  now.getTime() - t.getTime() <= DELTA_WINDOW_MS;

/**
 * 7-day delta over finding rows (boundary inclusive: exactly 7 days old still
 * counts). A finding that appeared and was resolved within the same window
 * counts as resolved, not as new. The status filters keep the two branches
 * disjoint per row. The resolved branch also requires status "resolved":
 * a manually reopened finding can carry a stale resolvedAt (the UI status
 * actions do not clear it) and has not actually freed any money.
 */
export const computeDigestDelta = (
  rows: DeltaFindingRow[],
  now: Date,
): DigestDelta => {
  const delta: DigestDelta = {
    newCount: 0,
    newCents: 0,
    resolvedCount: 0,
    resolvedCents: 0,
  };
  for (const row of rows) {
    if (
      (row.status === "open" || row.status === "acknowledged") &&
      withinWindow(row.firstSeenAt, now)
    ) {
      delta.newCount++;
      delta.newCents += row.monthlyImpactCents;
    } else if (
      row.status === "resolved" &&
      row.resolvedAt &&
      withinWindow(row.resolvedAt, now)
    ) {
      delta.resolvedCount++;
      delta.resolvedCents += row.monthlyImpactCents;
    }
  }
  return delta;
};

/**
 * Whole days from `now`'s UTC date to a yyyy-mm-dd date-column string,
 * negative when the date is past, null when unset or malformed. Both sides
 * are pinned to UTC midnight, since `new Date("yyyy-mm-dd")` math drifts a
 * day on servers west of UTC.
 */
export const daysUntilDate = (
  dateStr: string | null,
  now: Date,
): number | null => {
  if (!dateStr || !isValidIsoDate(dateStr)) return null;
  const target = Date.parse(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(target)) return null;
  const today = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  return Math.round((target - today) / DAY_MS);
};

export type DigestRenewalRow = {
  vendor: string;
  contractName: string;
  renewalDate: string;
  noticeDays: number;
};

const upcomingTiming = (days: number): string =>
  days === 0 ? "today" : days === 1 ? "in 1 day" : `in ${days} days`;

const deadlineTiming = (days: number): string => {
  if (days >= 0) return `is ${upcomingTiming(days)}`;
  const overdue = Math.abs(days);
  return `passed ${overdue} ${overdue === 1 ? "day" : "days"} ago`;
};

/**
 * Picks the most urgent upcoming contract by cancellation deadline, not merely
 * by renewal date. This prevents a long notice period from being surfaced only
 * after the customer can no longer cancel. Returns null while every actionable
 * date remains outside the digest window.
 */
export const renewalDigestLine = (
  renewals: DigestRenewalRow[],
  now: Date,
  windowDays = 90,
): string | null => {
  const candidates = renewals
    .map((renewal) => {
      const renewalDays = daysUntilDate(renewal.renewalDate, now);
      const noticeDays = Math.max(0, renewal.noticeDays);
      return renewalDays === null
        ? null
        : {
            renewal,
            renewalDays,
            noticeDays,
            actionDays: renewalDays - noticeDays,
          };
    })
    .filter(
      (candidate): candidate is NonNullable<typeof candidate> =>
        candidate !== null &&
        candidate.renewalDays >= 0 &&
        candidate.actionDays <= windowDays,
    )
    .sort(
      (a, b) => a.actionDays - b.actionDays || a.renewalDays - b.renewalDays,
    );
  const next = candidates[0];
  if (!next) return null;

  const vendor = next.renewal.vendor.trim();
  const contract = next.renewal.contractName.trim();
  const label = contract.toLowerCase().includes(vendor.toLowerCase())
    ? contract
    : `${vendor}: ${contract}`;
  const renewalTiming = upcomingTiming(next.renewalDays);
  return next.noticeDays > 0
    ? `${label}: cancellation notice deadline ${deadlineTiming(next.actionDays)}; renewal ${renewalTiming}`
    : `${label} renewal ${renewalTiming}`;
};

export type AiSpendDay = { day: string; amountCents: number };

/**
 * Week-over-week AI API spend split. A row's age in whole days (UTC-pinned
 * via daysUntilDate, same boundary semantics) picks its bucket: 0-6 days old
 * → last7Cents, exactly 7 through 13 → prior7Cents, anything else (future
 * days, older rows, malformed day strings) is ignored.
 */
export const computeAiSpendDelta = (
  rows: AiSpendDay[],
  now: Date,
): { last7Cents: number; prior7Cents: number } => {
  let last7Cents = 0;
  let prior7Cents = 0;
  for (const row of rows) {
    const until = daysUntilDate(row.day, now);
    if (until === null) continue;
    const age = -until;
    if (age >= 0 && age < 7) last7Cents += row.amountCents;
    else if (age >= 7 && age < 14) prior7Cents += row.amountCents;
  }
  return { last7Cents, prior7Cents };
};
