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
   * Upper bound for a rate-limit row. Expired windows are deleted daily, and
   * no window may be longer than this, so no row (some keys carry an IP
   * address) outlives it.
   */
  rateLimitMaxAge: 7,
  /** Names, UPNs and notes on a resolved finding after its resolution. */
  resolvedFindingPersonData: 90,
  /** Email delivery ledger rows. */
  emailDeliveries: 400,
} as const;

export const retentionMs = (days: number): number => days * DAY_MS;
