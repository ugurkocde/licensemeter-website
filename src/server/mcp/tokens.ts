import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { and, asc, eq, isNull, lte, or, sql } from "drizzle-orm";

import { db } from "~/server/db";
import { apiTokens, tenants } from "~/server/db/schema";

/**
 * Bearer tokens for the MCP endpoint. A token is `lm_mcp_` plus 32 random
 * bytes; only its SHA-256 hash and a short display prefix are ever stored, so
 * the plain value exists once, in the response that creates it.
 */

export const TOKEN_PREFIX = "lm_mcp_";
export const MAX_ACTIVE_TOKENS = 10;
export const TOKEN_NAME_MAX = 60;

const TOKEN_BYTES = 32;
/** `lm_mcp_` plus the first characters of the random part. */
const DISPLAY_PREFIX_LENGTH = TOKEN_PREFIX.length + 6;
const LAST_USED_INTERVAL_MS = 60_000;
/** 32 bytes as unpadded base64url. */
const TOKEN_PATTERN = /^lm_mcp_[A-Za-z0-9_-]{43}$/;

export type TokenSummary = {
  id: string;
  name: string;
  tokenPrefix: string;
  createdAt: Date;
  lastUsedAt: Date | null;
};

export type CreateTokenResult =
  | { ok: true; token: string; summary: TokenSummary }
  | { ok: false; error: "limit" };

export type VerifiedToken = { tokenId: string; tenantId: string };

const sha256 = (value: string): Buffer =>
  createHash("sha256").update(value, "utf8").digest();

/** Hex SHA-256, the only form of a token that is stored. */
export const hashToken = (token: string): string =>
  sha256(token).toString("hex");

export const generateToken = (): string =>
  TOKEN_PREFIX + randomBytes(TOKEN_BYTES).toString("base64url");

/** Compares two hex hashes without leaking where they differ. */
export const hashesEqual = (a: string, b: string): boolean => {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  if (left.length !== right.length || left.length === 0) return false;
  return timingSafeEqual(left, right);
};

/** What a lookup miss is compared against, so a miss costs what a hit costs. */
const ABSENT_HASH = hashToken("absent");

const summaryColumns = {
  id: apiTokens.id,
  name: apiTokens.name,
  tokenPrefix: apiTokens.tokenPrefix,
  createdAt: apiTokens.createdAt,
  lastUsedAt: apiTokens.lastUsedAt,
};

/**
 * Creates a token for a workspace, refusing beyond MAX_ACTIVE_TOKENS. The
 * workspace row is locked for the count and the insert, so two concurrent
 * requests cannot both pass the cap.
 */
export const createToken = async (input: {
  tenantId: string;
  name: string;
  createdByKey: string;
}): Promise<CreateTokenResult> => {
  const token = generateToken();
  return db.transaction(async (tx) => {
    await tx
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.id, input.tenantId))
      .for("update");
    const [active] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(apiTokens)
      .where(
        and(
          eq(apiTokens.tenantId, input.tenantId),
          isNull(apiTokens.revokedAt),
        ),
      );
    if ((active?.count ?? 0) >= MAX_ACTIVE_TOKENS) {
      return { ok: false, error: "limit" } as const;
    }
    const [summary] = await tx
      .insert(apiTokens)
      .values({
        tenantId: input.tenantId,
        name: input.name,
        tokenHash: hashToken(token),
        tokenPrefix: token.slice(0, DISPLAY_PREFIX_LENGTH),
        createdByKey: input.createdByKey,
      })
      .returning(summaryColumns);
    if (!summary) throw new Error("api token insert returned no row");
    return { ok: true, token, summary } as const;
  });
};

/** Active tokens of one workspace, oldest first. Never returns a hash. */
export const listTokens = (tenantId: string): Promise<TokenSummary[]> =>
  db
    .select(summaryColumns)
    .from(apiTokens)
    .where(and(eq(apiTokens.tenantId, tenantId), isNull(apiTokens.revokedAt)))
    .orderBy(asc(apiTokens.createdAt));

/**
 * Revokes a token of this workspace. The workspace id is part of the match, so
 * an id from another workspace revokes nothing. Returns the revoked token's
 * summary, or null when nothing matched.
 */
export const revokeToken = async (
  tenantId: string,
  tokenId: string,
  now: Date = new Date(),
): Promise<TokenSummary | null> => {
  const [row] = await db
    .update(apiTokens)
    .set({ revokedAt: now })
    .where(
      and(
        eq(apiTokens.id, tokenId),
        eq(apiTokens.tenantId, tenantId),
        isNull(apiTokens.revokedAt),
      ),
    )
    .returning(summaryColumns);
  return row ?? null;
};

/**
 * Resolves a presented bearer token to its workspace, or null. The row is
 * found by the hash (a unique index), then the stored and presented hashes are
 * compared in constant time; a miss runs the same comparison against a fixed
 * hash. A revoked token never verifies. `lastUsedAt` moves at most once per
 * minute, and a failure to write it never fails the request.
 */
export const verifyToken = async (
  presented: string,
  now: Date = new Date(),
): Promise<VerifiedToken | null> => {
  const wellFormed = TOKEN_PATTERN.test(presented);
  const presentedHash = hashToken(presented);
  const row = wellFormed
    ? await db.query.apiTokens.findFirst({
        where: eq(apiTokens.tokenHash, presentedHash),
        columns: {
          id: true,
          tenantId: true,
          tokenHash: true,
          lastUsedAt: true,
          revokedAt: true,
        },
      })
    : undefined;

  const matches = hashesEqual(row?.tokenHash ?? ABSENT_HASH, presentedHash);
  if (!row || !matches || row.revokedAt !== null) return null;

  const cutoff = new Date(now.getTime() - LAST_USED_INTERVAL_MS);
  if (row.lastUsedAt === null || row.lastUsedAt <= cutoff) {
    try {
      // The condition repeats in SQL so concurrent requests write once.
      await db
        .update(apiTokens)
        .set({ lastUsedAt: now })
        .where(
          and(
            eq(apiTokens.id, row.id),
            or(isNull(apiTokens.lastUsedAt), lte(apiTokens.lastUsedAt, cutoff)),
          ),
        );
    } catch (err) {
      console.error("[mcp] lastUsedAt update failed", err);
    }
  }
  return { tokenId: row.id, tenantId: row.tenantId };
};
