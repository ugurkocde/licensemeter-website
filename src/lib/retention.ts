/**
 * Retention periods, in one place. The daily retention job
 * (/api/cron/retention, src/server/retention.ts) enforces the first three;
 * the email delivery ledger is pruned by the scheduled email run.
 */
export const DAY_MS = 24 * 60 * 60 * 1000;

export const RETENTION_DAYS = {
  /** Sign-in tracking rows (oid, tid, UPN) after the identity last signed in. */
  seenSignins: 90,
  /**
   * Upper bound for a rate-limit window. Rows whose window has ended are
   * deleted by the daily retention job; a key that is used again before that
   * run starts a new window on the same row, so an active key keeps one
   * current row.
   */
  rateLimitMaxAge: 7,
  /** Names, UPNs and notes on a resolved finding after its resolution. */
  resolvedFindingPersonData: 90,
  /** Email delivery ledger rows. */
  emailDeliveries: 400,
} as const;

export const retentionMs = (days: number): number => days * DAY_MS;
