import { sql } from "drizzle-orm";

import { db } from "~/server/db";
import { rateLimits } from "~/server/db/schema";

/**
 * Durable fixed-window rate limiter backed by Postgres, so a limit holds across
 * serverless instances and cold starts (the in-memory limiter resets per
 * instance, multiplying the real ceiling under scale-out). One atomic upsert per
 * check: insert a fresh window, or on key conflict either start a new window (if
 * the previous one expired) or increment the live one, returning the new count.
 * Returns true when the request is within the limit. On a DB error it fails open
 * (returns true) so a limiter outage never hard-blocks a legitimate action.
 */
export const rateLimitDurable = async (
  key: string,
  max: number,
  windowMs: number,
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
          count: sql`case when ${rateLimits.resetAt} < ${now} then 1 else ${rateLimits.count} + 1 end`,
          resetAt: sql`case when ${rateLimits.resetAt} < ${now} then ${resetAt} else ${rateLimits.resetAt} end`,
        },
      })
      .returning({ count: rateLimits.count });
    return (row?.count ?? 1) <= max;
  } catch (err) {
    console.error(`rateLimitDurable failed for ${key}`, err);
    return true;
  }
};

/**
 * Client IP from Vercel's trusted x-real-ip header. x-forwarded-for is
 * intentionally not trusted because clients can spoof it.
 */
export const clientIp = (headerStore: {
  get(name: string): string | null;
}): string =>
  headerStore.get("x-real-ip") ?? "unknown";
