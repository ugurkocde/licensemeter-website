import { createHash } from "node:crypto";

import { and, eq, isNotNull, lt, lte, sql } from "drizzle-orm";

import { RETENTION_DAYS, retentionMs } from "~/lib/retention";
import { RULE_META } from "~/lib/rules";
import { db } from "~/server/db";
import { findings, rateLimits, seenSignins } from "~/server/db/schema";
import type { WasteRuleId } from "~/server/types";

/**
 * Personal-data keys a finding's detail can carry (engine.ts userDetail, the
 * SaaS and Adobe analyzers). Licenses, dates and amounts stay: without a name
 * they no longer identify the person.
 */
export const PERSON_DETAIL_KEYS = [
  "upn",
  "displayName",
  "email",
  "mail",
  "name",
] as const;

/** Prefix of a dedupe key replaced by its hash (see pseudonymisedDedupeKey). */
export const PSEUDONYMISED_KEY_PREFIX = "pseudonymised:";

/**
 * The stored form of a dedupe key that embeds an email address, once its
 * finding was pseudonymised: the SHA-256 of the key. Keys without an address
 * (Microsoft findings carry the Graph object ID) are kept as they are. Must
 * match the SQL in pseudonymiseResolvedFindings; the sync uses it to reopen a
 * pseudonymised finding when the same seat shows up again.
 */
export const pseudonymisedDedupeKey = (key: string): string =>
  key.includes("@")
    ? PSEUDONYMISED_KEY_PREFIX +
      createHash("sha256").update(key, "utf8").digest("hex")
    : key;

const hashedKeySql = sql`case when position('@' in ${findings.dedupeKey}) > 0 then '${sql.raw(PSEUDONYMISED_KEY_PREFIX)}' || encode(sha256(convert_to(${findings.dedupeKey}, 'UTF8')), 'hex') else ${findings.dedupeKey} end`;

const personKeysArray = sql.raw(
  `array[${PERSON_DETAIL_KEYS.map((k) => `'${k}'`).join(",")}]::text[]`,
);

/** Deletes sign-in tracking rows of identities not seen within the period. */
export const purgeSeenSignins = async (now = new Date()): Promise<number> => {
  const cutoff = new Date(
    now.getTime() - retentionMs(RETENTION_DAYS.seenSignins),
  );
  const rows = await db
    .delete(seenSignins)
    .where(lt(seenSignins.lastSeenAt, cutoff))
    .returning({ oid: seenSignins.oid });
  return rows.length;
};

/** Deletes rate-limit rows whose window has ended. */
export const purgeRateLimits = async (now = new Date()): Promise<number> => {
  const rows = await db
    .delete(rateLimits)
    .where(lte(rateLimits.resetAt, now))
    .returning({ key: rateLimits.key });
  return rows.length;
};

/**
 * Pseudonymises person-level findings resolved longer ago than the period:
 * the title becomes the rule's category label, name and UPN keys leave the
 * detail, and a dedupe key that embeds an email address (SaaS and Adobe
 * seats) is replaced by its SHA-256 hash. A finding that recurs is matched
 * on that hash (or on the Graph object ID, which stays) and reopens the same
 * row with its plain key and title restored. Aggregate findings carry no
 * person data and are left alone. Idempotent through the `pseudonymised` flag.
 */
export const pseudonymiseResolvedFindings = async (
  now = new Date(),
): Promise<number> => {
  const cutoff = new Date(
    now.getTime() - retentionMs(RETENTION_DAYS.resolvedFindingPersonData),
  );
  let total = 0;
  for (const [rule, meta] of Object.entries(RULE_META) as [
    WasteRuleId,
    { label: string },
  ][]) {
    const rows = await db
      .update(findings)
      .set({
        title: meta.label,
        detail: sql`(${findings.detail} - ${personKeysArray}) || '{"pseudonymised":true}'::jsonb`,
        dedupeKey: hashedKeySql,
      })
      .where(
        and(
          eq(findings.rule, rule),
          eq(findings.status, "resolved"),
          lt(findings.resolvedAt, cutoff),
          sql`(${findings.graphUserId} is not null or ${findings.detail} ?| ${personKeysArray} or position('@' in ${findings.dedupeKey}) > 0)`,
          sql`coalesce((${findings.detail} ->> 'pseudonymised')::boolean, false) = false`,
          // Never collide with a row that already holds the hashed key.
          sql`not exists (select 1 from ${findings} as other where other.tenant_id = ${findings.tenantId} and other.id <> ${findings.id} and other.dedupe_key = ${hashedKeySql})`,
        ),
      )
      .returning({ id: findings.id });
    total += rows.length;
  }
  return total;
};

/**
 * Clears the free-text workflow note of every finding resolved longer ago
 * than the period, aggregate findings and notes added after an earlier
 * pseudonymisation included: a note may name anyone.
 */
export const clearResolvedFindingNotes = async (
  now = new Date(),
): Promise<number> => {
  const cutoff = new Date(
    now.getTime() - retentionMs(RETENTION_DAYS.resolvedFindingPersonData),
  );
  const rows = await db
    .update(findings)
    .set({ workflowNote: null })
    .where(
      and(
        eq(findings.status, "resolved"),
        lt(findings.resolvedAt, cutoff),
        isNotNull(findings.workflowNote),
      ),
    )
    .returning({ id: findings.id });
  return rows.length;
};

export type RetentionResult = {
  seenSignins: number;
  rateLimits: number;
  findingsPseudonymised: number;
  findingNotesCleared: number;
};

export const runRetention = async (
  now = new Date(),
): Promise<RetentionResult> => ({
  seenSignins: await purgeSeenSignins(now),
  rateLimits: await purgeRateLimits(now),
  findingsPseudonymised: await pseudonymiseResolvedFindings(now),
  findingNotesCleared: await clearResolvedFindingNotes(now),
});
