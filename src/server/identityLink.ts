import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { and, asc, eq, gt, inArray, isNotNull, isNull, sql } from "drizzle-orm";

import type { Db } from "~/server/db";
import {
  auditLog,
  membershipClaims,
  memberships,
  mspAccounts,
} from "~/server/db/schema";

/**
 * Database side of moving a member from before sign-in was Entra-only onto
 * their Entra identity. Takes the db as an argument and imports nothing from
 * Next.js or the auth stack, so it runs unchanged against the PGlite test
 * harness. Mail, rate limits and the session stay with callers.
 *
 * A legacy membership has oid null and workosUserId set. It is linked (its oid
 * is set) in exactly two ways, and both end in linkLegacyMemberships:
 * - the id token proved the email (xms_edov), checked by the caller;
 * - the person opened the claim link mailed to the membership's own address.
 * Nothing here ever trusts an address the signer merely asserts.
 */

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export const CLAIM_TTL_MS = 30 * 60 * 1000;

export type LinkVia = "proven_email" | "email_claim";

/** Unlinked legacy memberships carrying this (lowercased) address. */
const legacyRowsOf = (email: string) =>
  and(
    isNull(memberships.oid),
    isNotNull(memberships.workosUserId),
    eq(sql`lower(${memberships.email})`, email),
  );

/**
 * Whether some unlinked legacy membership carries this address. Answers with a
 * boolean only, so a caller can never learn which workspaces those are.
 */
export const hasUnlinkedLegacyMembership = async (
  db: Db,
  email: string,
): Promise<boolean> => {
  const address = email.trim().toLowerCase();
  if (!address) return false;
  const [row] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(legacyRowsOf(address))
    .limit(1);
  return row !== undefined;
};

const linkWithin = async (
  tx: Tx,
  who: { oid: string; email: string; name: string | null },
  via: LinkVia,
): Promise<string[]> => {
  const address = who.email.trim().toLowerCase();
  if (!who.oid || !address) return [];

  // `oid is null` is the whole guard: a membership someone else already
  // linked is never touched, and a workspace where this person already has a
  // membership under another address is skipped instead of doubled.
  const linked = await tx
    .update(memberships)
    .set({
      oid: who.oid,
      name: sql`coalesce(${memberships.name}, ${who.name})`,
    })
    .where(
      and(
        legacyRowsOf(address),
        sql`not exists (
          select 1 from memberships mine
          where mine.tenant_id = ${memberships.tenantId} and mine.oid = ${who.oid}
        )`,
      ),
    )
    .returning({
      tenantId: memberships.tenantId,
      workosUserId: memberships.workosUserId,
    });
  if (linked.length === 0) return [];

  await tx.insert(auditLog).values(
    linked.map((row) => ({
      tenantId: row.tenantId,
      actorOid: who.oid,
      actorEmail: address,
      action: "member_identity_linked" as const,
      detail: { via },
    })),
  );

  // An MSP account the person created before the move follows them: the
  // oldest account owned by one of the linked legacy ids gets their object id.
  // One account per owner, so nothing is adopted when they already have one.
  const legacyIds = [
    ...new Set(
      linked.map((row) => row.workosUserId).filter((id) => id !== null),
    ),
  ];
  const [owned] = await tx
    .select({ id: mspAccounts.id })
    .from(mspAccounts)
    .where(eq(mspAccounts.ownerOid, who.oid))
    .limit(1);
  if (!owned && legacyIds.length > 0) {
    const [legacy] = await tx
      .select({ id: mspAccounts.id })
      .from(mspAccounts)
      .where(
        and(
          isNull(mspAccounts.ownerOid),
          inArray(mspAccounts.ownerWorkosUserId, legacyIds),
        ),
      )
      .orderBy(asc(mspAccounts.createdAt), asc(mspAccounts.id))
      .limit(1);
    if (legacy) {
      await tx
        .update(mspAccounts)
        .set({ ownerOid: who.oid })
        .where(
          and(eq(mspAccounts.id, legacy.id), isNull(mspAccounts.ownerOid)),
        );
    }
  }

  return linked.map((row) => row.tenantId);
};

/**
 * Links every unlinked legacy membership with this address to the object id,
 * in one transaction, and returns the workspaces it linked. The CALLER has
 * proven that `who.email` belongs to `who.oid`; this function cannot check it.
 */
export const linkLegacyMemberships = (
  db: Db,
  who: { oid: string; email: string; name: string | null },
  via: LinkVia,
): Promise<string[]> => db.transaction((tx) => linkWithin(tx, who, via));

export const hashClaimToken = (token: string): string =>
  createHash("sha256").update(token, "utf8").digest("hex");

/**
 * Files a claim for the address and returns the plain token, which exists only
 * in the mail. The address must come from the membership lookup of the caller,
 * never from user input.
 */
export const createClaim = async (
  db: Db,
  args: { email: string; oid: string; tid: string; now?: Date },
): Promise<string> => {
  const now = args.now ?? new Date();
  const token = randomBytes(32).toString("base64url");
  await db.insert(membershipClaims).values({
    email: args.email.trim().toLowerCase(),
    tokenHash: hashClaimToken(token),
    requestedByOid: args.oid,
    requestedByTid: args.tid,
    createdAt: now,
    expiresAt: new Date(now.getTime() + CLAIM_TTL_MS),
  });
  return token;
};

/** Drops claims that expired more than a day ago. Best-effort housekeeping. */
export const pruneClaims = async (db: Db, now = new Date()): Promise<void> => {
  await db
    .delete(membershipClaims)
    .where(
      sql`${membershipClaims.expiresAt} < ${new Date(now.getTime() - 86_400_000)}`,
    );
};

export type RedeemResult =
  { ok: true; linkedTenantIds: string[] } | { ok: false };

/**
 * Redeems a claim token for the signed-in identity. The token is looked up by
 * its SHA-256 (the plain token is never stored or compared), and consumed by a
 * single conditional update, so of two concurrent clicks one wins and a used,
 * expired or foreign token changes nothing. Only the object id and tenant that
 * asked for the token can redeem it: a forwarded or intercepted mail is
 * worthless in any other session. Every failure looks the same to the caller.
 */
export const redeemClaimToken = (
  db: Db,
  args: {
    token: string;
    oid: string;
    tid: string;
    name: string | null;
    now?: Date;
  },
): Promise<RedeemResult> => {
  const now = args.now ?? new Date();
  // 32 random bytes in base64url are 43 characters; anything else is not ours.
  if (!/^[A-Za-z0-9_-]{43}$/.test(args.token) || !args.oid || !args.tid) {
    return Promise.resolve({ ok: false });
  }
  const tokenHash = hashClaimToken(args.token);

  return db.transaction(async (tx) => {
    const [claim] = await tx
      .update(membershipClaims)
      .set({ usedAt: now })
      .where(
        and(
          eq(membershipClaims.tokenHash, tokenHash),
          isNull(membershipClaims.usedAt),
          gt(membershipClaims.expiresAt, now),
          eq(membershipClaims.requestedByOid, args.oid),
          eq(membershipClaims.requestedByTid, args.tid),
        ),
      )
      .returning();
    if (!claim) return { ok: false } as const;
    // Belt and braces on top of the indexed lookup: compare the stored hash in
    // constant time before acting on the row.
    const stored = Buffer.from(claim.tokenHash, "hex");
    const given = Buffer.from(tokenHash, "hex");
    if (stored.length !== given.length || !timingSafeEqual(stored, given)) {
      throw new Error("claim token hash mismatch");
    }

    const linkedTenantIds = await linkWithin(
      tx,
      { oid: args.oid, email: claim.email, name: args.name },
      "email_claim",
    );
    return { ok: true, linkedTenantIds } as const;
  });
};
