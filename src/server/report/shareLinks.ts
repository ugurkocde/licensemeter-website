import { createHash, randomBytes } from "node:crypto";

import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";

import { db } from "~/server/db";
import {
  reportShareLinks,
  tenants,
  type ReportShareLinkRow,
  type TenantRow,
} from "~/server/db/schema";
import type { ReportBranding } from "~/server/report/brandStyle";
import type { ExecutiveSummary } from "~/server/report/executiveSummary";
import type { ShareLinkMode } from "~/server/types";

/**
 * Read-only share links to the executive savings report, for a CFO or a board
 * member without a LicenseMeter account. A link is `lmr_` plus 32 random bytes
 * (256 bits); only its sha256 and a short display prefix are stored, so the
 * plain link exists once, in the response that creates it.
 *
 * Two modes:
 *  - live: renders the current report on every view, and only while the
 *    workspace's plan includes the executive report;
 *  - snapshot: carries the report as it was at creation, so it keeps working
 *    after a downgrade or cancellation until it expires or is revoked.
 *
 * Revoking always works, on any plan: it only takes access away.
 */

export const SHARE_TOKEN_PREFIX = "lmr_";
/** Links that are neither revoked nor expired, per workspace. */
export const MAX_ACTIVE_LINKS = 20;
export const SHARE_LABEL_MAX = 60;
/** The lifetimes an admin can pick; the first is the default. */
export const SHARE_TTL_DAYS = [30, 7, 90] as const;
export type ShareTtlDays = (typeof SHARE_TTL_DAYS)[number];

const TOKEN_BYTES = 32;
const DISPLAY_PREFIX_LENGTH = SHARE_TOKEN_PREFIX.length + 6;
/** 32 bytes as unpadded base64url. */
const TOKEN_PATTERN = /^lmr_[A-Za-z0-9_-]{43}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export const isShareTtl = (value: unknown): value is ShareTtlDays =>
  (SHARE_TTL_DAYS as readonly unknown[]).includes(value);

export const isShareMode = (value: unknown): value is ShareLinkMode =>
  value === "live" || value === "snapshot";

/** True when the string has the exact shape of a share token. */
export const isShareToken = (value: string): boolean =>
  TOKEN_PATTERN.test(value);

/** Hex sha256, the only form of a share token that is stored. */
export const hashShareToken = (token: string): string =>
  createHash("sha256").update(token, "utf8").digest("hex");

export const generateShareToken = (): string =>
  SHARE_TOKEN_PREFIX + randomBytes(TOKEN_BYTES).toString("base64url");

/** What a snapshot link stores: the report and its marks, as they were. */
export type SnapshotPayload = {
  version: 1;
  summary: ExecutiveSummary;
  branding: ReportBranding | null;
};

const isSnapshotPayload = (value: unknown): value is SnapshotPayload => {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<SnapshotPayload>;
  return (
    v.version === 1 &&
    typeof v.summary === "object" &&
    v.summary !== null &&
    typeof v.summary.workspace === "string" &&
    typeof v.summary.generatedAt === "string"
  );
};

/** Month a link belongs to (yyyy-mm, UTC). */
export const sharePeriodKey = (now: Date): string =>
  now.toISOString().slice(0, 7);

export type ShareLinkSummary = Pick<
  ReportShareLinkRow,
  | "id"
  | "label"
  | "tokenPrefix"
  | "mode"
  | "periodKey"
  | "createdAt"
  | "expiresAt"
  | "lastViewedAt"
  | "viewCount"
>;

const summaryColumns = {
  id: reportShareLinks.id,
  label: reportShareLinks.label,
  tokenPrefix: reportShareLinks.tokenPrefix,
  mode: reportShareLinks.mode,
  periodKey: reportShareLinks.periodKey,
  createdAt: reportShareLinks.createdAt,
  expiresAt: reportShareLinks.expiresAt,
  lastViewedAt: reportShareLinks.lastViewedAt,
  viewCount: reportShareLinks.viewCount,
};

export type CreateShareLinkInput = {
  tenantId: string;
  label: string;
  mode: ShareLinkMode;
  ttlDays: ShareTtlDays;
  createdByKey: string;
  /** Required for a snapshot link, ignored for a live one. */
  snapshot?: SnapshotPayload;
};

export type CreateShareLinkResult =
  | { ok: true; token: string; link: ShareLinkSummary }
  | { ok: false; error: "limit" | "snapshotMissing" };

/**
 * Creates a link, refusing beyond MAX_ACTIVE_LINKS active links. The
 * workspace row is locked for the count and the insert, so two concurrent
 * requests cannot both pass the cap. The plan and demo checks belong to the
 * caller (the server action), which also builds the snapshot.
 */
export const createShareLink = async (
  input: CreateShareLinkInput,
  now: Date = new Date(),
): Promise<CreateShareLinkResult> => {
  if (input.mode === "snapshot" && !input.snapshot) {
    return { ok: false, error: "snapshotMissing" };
  }
  const token = generateShareToken();
  return db.transaction(async (tx) => {
    await tx
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.id, input.tenantId))
      .for("update");
    const [active] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(reportShareLinks)
      .where(
        and(
          eq(reportShareLinks.tenantId, input.tenantId),
          isNull(reportShareLinks.revokedAt),
          gt(reportShareLinks.expiresAt, now),
        ),
      );
    if ((active?.count ?? 0) >= MAX_ACTIVE_LINKS) {
      return { ok: false, error: "limit" } as const;
    }
    const [link] = await tx
      .insert(reportShareLinks)
      .values({
        tenantId: input.tenantId,
        tokenHash: hashShareToken(token),
        tokenPrefix: token.slice(0, DISPLAY_PREFIX_LENGTH),
        label: input.label,
        mode: input.mode,
        periodKey: sharePeriodKey(now),
        snapshotPayload: input.mode === "snapshot" ? input.snapshot : null,
        createdByKey: input.createdByKey,
        createdAt: now,
        expiresAt: new Date(now.getTime() + input.ttlDays * DAY_MS),
      })
      .returning(summaryColumns);
    if (!link) throw new Error("share link insert returned no row");
    return { ok: true, token, link } as const;
  });
};

/**
 * Unrevoked links of one workspace, newest first, expired ones included so
 * they can be shown as expired. Never returns a hash or a payload.
 */
export const listShareLinks = (tenantId: string): Promise<ShareLinkSummary[]> =>
  db
    .select(summaryColumns)
    .from(reportShareLinks)
    .where(
      and(
        eq(reportShareLinks.tenantId, tenantId),
        isNull(reportShareLinks.revokedAt),
      ),
    )
    .orderBy(desc(reportShareLinks.createdAt));

/**
 * Revokes a link of this workspace. The workspace id is part of the match, so
 * an id from another workspace revokes nothing. Also drops a snapshot's
 * payload: a revoked link never serves it again, so there is no reason to
 * keep the copy. Returns the revoked link, or null when nothing matched.
 */
export const revokeShareLink = async (
  tenantId: string,
  linkId: string,
  now: Date = new Date(),
): Promise<ShareLinkSummary | null> => {
  const [link] = await db
    .update(reportShareLinks)
    .set({ revokedAt: now })
    .where(
      and(
        eq(reportShareLinks.tenantId, tenantId),
        eq(reportShareLinks.id, linkId),
        isNull(reportShareLinks.revokedAt),
      ),
    )
    .returning(summaryColumns);
  return link ?? null;
};

/** A link that may be shown right now, with the workspace it belongs to. */
export type ActiveShareLink = {
  link: Pick<ReportShareLinkRow, "id" | "mode" | "label" | "expiresAt">;
  tenant: TenantRow;
  /** Set for snapshot links; live links are rendered by the caller. */
  snapshot: SnapshotPayload | null;
};

/**
 * Looks a token up. Null for anything that must not be shown: a malformed
 * token, an unknown, revoked or expired link, a demo workspace, or a snapshot
 * whose payload cannot be read. The caller answers every null with the same
 * 404, so the response never tells these cases apart. The plan check for
 * live links happens in the caller, which also answers it with that 404.
 */
export const findActiveShareLink = async (
  token: string,
  now: Date = new Date(),
): Promise<ActiveShareLink | null> => {
  if (!isShareToken(token)) return null;
  const [row] = await db
    .select({ link: reportShareLinks, tenant: tenants })
    .from(reportShareLinks)
    .innerJoin(tenants, eq(tenants.id, reportShareLinks.tenantId))
    .where(eq(reportShareLinks.tokenHash, hashShareToken(token)))
    .limit(1);
  if (!row) return null;
  const { link, tenant } = row;
  if (link.revokedAt) return null;
  if (link.expiresAt.getTime() <= now.getTime()) return null;
  // The shared demo workspace never creates links; refuse one anyway.
  if (tenant.isDemo) return null;
  let snapshot: SnapshotPayload | null = null;
  if (link.mode === "snapshot") {
    if (!isSnapshotPayload(link.snapshotPayload)) return null;
    snapshot = link.snapshotPayload;
  }
  return {
    link: {
      id: link.id,
      mode: link.mode,
      label: link.label,
      expiresAt: link.expiresAt,
    },
    tenant,
    snapshot,
  };
};

/** Counts a view. Best effort: a failed counter never blocks the report. */
export const recordShareView = async (
  linkId: string,
  now: Date = new Date(),
): Promise<void> => {
  try {
    await db
      .update(reportShareLinks)
      .set({
        viewCount: sql`${reportShareLinks.viewCount} + 1`,
        lastViewedAt: now,
      })
      .where(eq(reportShareLinks.id, linkId));
  } catch (err) {
    console.error("[share-link] view count failed", err);
  }
};
