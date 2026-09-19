import type { Entitlement } from "~/server/entitlement";

/**
 * The waste history window. Snapshots are never deleted or pruned: the plan
 * only decides how far back a chart, a comparison or an export may read.
 * Pure date math, no DB, unit tested. The readers live in historyStore.ts.
 */

export const FREE_HISTORY_MONTHS = 12;
export const FULL_HISTORY_MONTHS = 24;

export type HistoryMonths =
  | typeof FREE_HISTORY_MONTHS
  | typeof FULL_HISTORY_MONTHS;

/** Only the features are read, so a caller can pass any entitlement-like value. */
type HistoryEntitlement = Pick<Entitlement, "features">;

export const historyMonths = (
  entitlement: HistoryEntitlement,
): HistoryMonths =>
  entitlement.features.history24 ? FULL_HISTORY_MONTHS : FREE_HISTORY_MONTHS;

/**
 * The first instant inside the window: `now`'s UTC date moved back by whole
 * calendar months, at 00:00 UTC. A day the target month does not have clamps
 * to that month's last day (29 February minus 12 months is 28 February), so
 * the window is never shorter than the months it promises.
 */
export const historyStart = (
  entitlement: HistoryEntitlement,
  now: Date,
): Date => {
  const months = historyMonths(entitlement);
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() - months;
  // Day 0 of the following month is the last day of the target month.
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(now.getUTCDate(), lastDay)));
};

/**
 * historyStart as the yyyy-mm-dd string the `snapshots.day` date column
 * compares against. The window is inclusive: read `day >= historyStartDay`.
 */
export const historyStartDay = (
  entitlement: HistoryEntitlement,
  now: Date,
): string => historyStart(entitlement, now).toISOString().slice(0, 10);

/**
 * Whether to tell the workspace its history is cut off: only on a plan with
 * the short window, and only when snapshots older than the window exist.
 * Self-hosted installs and the demo have history24, so they never see it.
 */
export const showHistoryHint = (
  entitlement: HistoryEntitlement,
  olderExists: boolean,
): boolean => !entitlement.features.history24 && olderExists;
