import { isIP } from "node:net";

import { sql } from "drizzle-orm";

import { db } from "~/server/db";
import { rateLimits } from "~/server/db/schema";

export class RateLimitUnavailableError extends Error {
  constructor() {
    super("The submission limiter is unavailable.");
    this.name = "RateLimitUnavailableError";
  }
}

/**
 * Durable fixed-window rate limiter backed by Postgres, so a limit holds across
 * serverless instances and cold starts (the in-memory limiter resets per
 * instance, multiplying the real ceiling under scale-out). One atomic upsert per
 * check: insert a fresh window, or on key conflict either start a new window (if
 * the previous one expired) or increment the live one, returning the new count.
 * Returns true when the request is within the limit. On a DB error it fails open
 * (returns true) by default. Public mail endpoints can choose "deny" to stop
 * sending when the limiter is unavailable, or "throw" to distinguish a service
 * failure from an exhausted quota.
 */
export const rateLimitDurable = async (
  key: string,
  max: number,
  windowMs: number,
  failureMode: "allow" | "deny" | "throw" = "allow",
): Promise<boolean> => {
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowMs);
  try {
    const [row] = await db
      .insert(rateLimits)
      .values({ key, count: 1, resetAt })
      .onConflictDoUpdate({
        target: rateLimits.key,
        set: {
          // Raw SQL parameters bypass Drizzle's column date encoder. Postgres.js
          // needs strings here; PGlite also accepts Dates and hid this bug.
          count: sql`case when ${rateLimits.resetAt} <= ${now.toISOString()}::timestamptz then 1 else ${rateLimits.count} + 1 end`,
          resetAt: sql`case when ${rateLimits.resetAt} <= ${now.toISOString()}::timestamptz then ${resetAt.toISOString()}::timestamptz else ${rateLimits.resetAt} end`,
        },
      })
      .returning({ count: rateLimits.count });
    return (row?.count ?? 1) <= max;
  } catch (err) {
    console.error(`rateLimitDurable failed for ${key}`, err);
    if (failureMode === "throw") throw new RateLimitUnavailableError();
    return failureMode === "allow";
  }
};

/**
 * Client IP from Vercel's trusted x-real-ip header. x-forwarded-for is
 * intentionally not trusted because clients can spoof it. Anything that is not
 * a literal IP address collapses to "unknown" so a malformed header cannot mint
 * an unbounded number of rate-limit keys.
 */
export const clientIp = (headerStore: {
  get(name: string): string | null;
}): string => {
  const value = headerStore.get("x-real-ip")?.trim() ?? "";
  return isIP(value) ? value : "unknown";
};
