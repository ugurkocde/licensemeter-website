import { sql } from "drizzle-orm";
import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import type { Db } from "~/server/db";
import { isUndefinedColumn } from "~/server/db/errors";
import { seenSignins } from "~/server/db/schema";
import { alertId } from "~/server/opsError";

/**
 * seen_signins as it was before signup_source. Drizzle names every schema
 * column in an insert, so while a hosted database still lacks the column
 * (scripts/db-add-signup-source.sql not yet run) every insert through the
 * full schema fails. Not exported from schema.ts, so drizzle-kit never sees it.
 */
const seenSigninsWithoutSource = pgTable("seen_signins", {
  oid: text("oid").primaryKey(),
  tid: text("tid").notNull(),
  upn: text("upn"),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  signinCount: integer("signin_count").notNull().default(1),
});

export type SigninRecord = {
  oid: string;
  tid: string;
  upn: string;
  /** Validated public page the sign-in started from; kept on the first sign-in only. */
  signupSource: string | null;
};

/**
 * Counts a sign-in and returns the identity's sign-in count, so 1 means a
 * first sign-in. Falls back to the table without signup_source when the
 * column is missing, so statistics and first-sign-in notes keep working and
 * only the attribution is lost.
 */
export const recordSignin = async (
  db: Db,
  record: SigninRecord,
): Promise<number | undefined> => {
  try {
    const rows = await db
      .insert(seenSignins)
      .values(record)
      .onConflictDoUpdate({
        target: seenSignins.oid,
        // signup_source is deliberately absent: it describes the first sign-in.
        set: {
          lastSeenAt: new Date(),
          upn: record.upn,
          signinCount: sql`${seenSignins.signinCount} + 1`,
        },
      })
      .returning({ count: seenSignins.signinCount });
    return rows[0]?.count;
  } catch (err) {
    if (!isUndefinedColumn(err)) throw err;
    console.error(
      "[auth] seen_signins.signup_source is missing; run scripts/db-add-signup-source.sql",
    );
    const t = seenSigninsWithoutSource;
    const rows = await db
      .insert(t)
      .values({ oid: record.oid, tid: record.tid, upn: record.upn })
      .onConflictDoUpdate({
        target: t.oid,
        set: {
          lastSeenAt: new Date(),
          upn: record.upn,
          signinCount: sql`${t.signinCount} + 1`,
        },
      })
      .returning({ count: t.signinCount });
    return rows[0]?.count;
  }
};

/**
 * Ops alert for an identity's first sign-in. It takes the Microsoft tenant
 * ID only: the page the sign-in started from is caller-controlled text (any
 * path that passes validateSignupSource), so it is stored for statistics but
 * never sent in an alert.
 */
export const firstSignInAlert = (tid: string): string =>
  `first sign-in from Microsoft tenant ${alertId(tid)}`;
