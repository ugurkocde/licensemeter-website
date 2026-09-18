/**
 * Period keys for the scheduled emails. A key names the one email a recipient
 * may get per period, so it is the idempotency unit of the delivery ledger.
 * Everything is computed in UTC, like the cron schedules. Pure, no IO.
 */

export type EmailJob = "digest" | "report";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * ISO 8601 week of the given instant, e.g. "2026-W38". Weeks start on Monday
 * and belong to the year that holds their Thursday, so late December can be
 * week 1 of the next year and early January week 52 or 53 of the previous one.
 */
export const isoWeekKey = (now: Date): string => {
  const day = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  // Move to the Thursday of this ISO week (Monday = 1 ... Sunday = 7).
  const weekday = day.getUTCDay() === 0 ? 7 : day.getUTCDay();
  day.setUTCDate(day.getUTCDate() + 4 - weekday);
  const year = day.getUTCFullYear();
  const yearStart = Date.UTC(year, 0, 1);
  const week = Math.ceil(((day.getTime() - yearStart) / DAY_MS + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
};

/**
 * Month the monthly report covers: the calendar month before the run, e.g. a
 * run on 2027-01-01 reports "2026-12". A late re-run in the same month keeps
 * the same key, so it only finishes what the first run left over.
 */
export const reportMonthKey = (now: Date): string => {
  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1));
  return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, "0")}`;
};

export const periodKeyFor = (job: EmailJob, now: Date): string =>
  job === "digest" ? isoWeekKey(now) : reportMonthKey(now);
