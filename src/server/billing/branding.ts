import { and, asc, eq, isNotNull, or } from "drizzle-orm";
import { z } from "zod";

import { workspaceLabel } from "~/lib/format";
import type { AccessContext } from "~/server/access";
import { db } from "~/server/db";
import { mspAccounts, tenants, type TenantRow } from "~/server/db/schema";
import { hasFeature, type Entitlement } from "~/server/entitlement";
import {
  BRAND_COLOR_PATTERN,
  BRAND_NAME_MAX,
  LOGO_MAX_BYTES,
  LOGO_MEDIA_TYPES,
  type LogoMediaType,
  type ReportBranding,
} from "~/server/report/brandStyle";

/**
 * White-label report branding, included in Pro and MSP. A workspace attached
 * to an MSP account takes the account's marks, so one brand reaches the PDF of
 * every covered client workspace. A standalone workspace carries its own marks
 * on its tenants row. Either way the workspace needs the whiteLabel feature,
 * and clearing the branding only brings the LicenseMeter report back.
 */

// --- validation ----------------------------------------------------------------

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_MAGIC = [0xff, 0xd8, 0xff];

const startsWith = (bytes: Uint8Array, magic: number[]) =>
  bytes.length > magic.length && magic.every((b, i) => bytes[i] === b);

/** The image type the bytes themselves announce, whatever the upload claimed. */
export const sniffLogoType = (bytes: Uint8Array): LogoMediaType | null => {
  if (startsWith(bytes, PNG_MAGIC)) return "image/png";
  if (startsWith(bytes, JPEG_MAGIC)) return "image/jpeg";
  return null;
};

export type LogoRefusal =
  "notDataUrl" | "unsupportedType" | "tooLarge" | "contentMismatch";

const DATA_URL = /^data:([a-z0-9.+/-]+);base64,([A-Za-z0-9+/]+={0,2})$/;

/**
 * Checks a logo data URL: PNG or JPEG only, at most LOGO_MAX_BYTES decoded, and
 * the decoded bytes must start with the magic number of the declared type. The
 * declared media type is never trusted on its own. SVG is refused because it
 * can carry scripts and external references.
 */
export const checkLogo = (
  dataUrl: string,
): { ok: true } | { ok: false; reason: LogoRefusal } => {
  const match = DATA_URL.exec(dataUrl);
  if (!match) return { ok: false, reason: "notDataUrl" };
  const [, mediaType, payload] = match as unknown as [string, string, string];
  if (!(LOGO_MEDIA_TYPES as readonly string[]).includes(mediaType)) {
    return { ok: false, reason: "unsupportedType" };
  }
  if (payload.length % 4 !== 0) return { ok: false, reason: "notDataUrl" };
  // Size from the base64 length first, so an oversized upload is never decoded.
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  if ((payload.length / 4) * 3 - padding > LOGO_MAX_BYTES) {
    return { ok: false, reason: "tooLarge" };
  }
  const bytes = Buffer.from(payload, "base64");
  if (sniffLogoType(bytes) !== mediaType) {
    return { ok: false, reason: "contentMismatch" };
  }
  return { ok: true };
};

const LOGO_MESSAGES: Record<LogoRefusal, string> = {
  notDataUrl: "The logo could not be read. Upload a PNG or JPEG file.",
  unsupportedType: "The logo must be a PNG or JPEG file. SVG is not accepted.",
  tooLarge: `The logo must be at most ${LOGO_MAX_BYTES / 1024} KB.`,
  contentMismatch: "The file content is not a valid PNG or JPEG image.",
};

export const brandingInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a brand name.")
    .max(BRAND_NAME_MAX, `Use at most ${BRAND_NAME_MAX} characters.`),
  color: z
    .string()
    .regex(BRAND_COLOR_PATTERN, "Use a colour in the form #RRGGBB.")
    .transform((c) => c.toLowerCase())
    .nullable(),
  logo: z
    .string()
    .superRefine((value, issue) => {
      const checked = checkLogo(value);
      if (!checked.ok) {
        issue.addIssue({
          code: z.ZodIssueCode.custom,
          message: LOGO_MESSAGES[checked.reason],
        });
      }
    })
    .nullable(),
});

export type BrandingInput = z.infer<typeof brandingInputSchema>;

// --- reading -------------------------------------------------------------------

type BrandColumns = Pick<
  typeof mspAccounts.$inferSelect,
  "brandName" | "brandColor" | "brandLogo"
>;

const brandColumns = {
  brandName: mspAccounts.brandName,
  brandColor: mspAccounts.brandColor,
  brandLogo: mspAccounts.brandLogo,
};

/** An account counts as branded once it has a name or a logo. */
const hasMarks = or(
  isNotNull(mspAccounts.brandName),
  isNotNull(mspAccounts.brandLogo),
);

const toBranding = (row: BrandColumns): ReportBranding | null =>
  row.brandName || row.brandLogo
    ? { name: row.brandName, color: row.brandColor, logo: row.brandLogo }
    : null;

/** The brand columns a workspace itself carries, whichever table stores them. */
type BrandingTenant = Pick<
  TenantRow,
  "mspAccountId" | "brandName" | "brandColor" | "brandLogo"
>;

/**
 * The branding a workspace's report carries, only while the workspace has the
 * whiteLabel feature: the marks of its MSP account when it is attached to one,
 * otherwise the marks stored on the workspace itself. An attached workspace
 * never falls back to its own marks, so attaching it hands its reports to the
 * account's brand (or back to LicenseMeter when the account has none). Null
 * means the LicenseMeter report. Never queries for a workspace that cannot be
 * branded, and a standalone workspace is answered from its own row.
 */
export async function getBranding(
  tenant: BrandingTenant,
  entitlement: Entitlement,
): Promise<ReportBranding | null> {
  if (!hasFeature(entitlement, "whiteLabel")) return null;
  const accountId = tenant.mspAccountId;
  if (!accountId) return toBranding(tenant);
  const [row] = await db
    .select(brandColumns)
    .from(mspAccounts)
    .where(and(eq(mspAccounts.id, accountId), hasMarks))
    .limit(1);
  return row ? toBranding(row) : null;
}

// --- writing -------------------------------------------------------------------

export type BrandingRefusal =
  | "featureRequired"
  | "demoUser"
  /**
   * Only the owner of the MSP account may change its branding, and only a
   * workspace owner or admin may change a standalone workspace's branding.
   */
  | "notOwner"
  | "invalid";

export type BrandingResult =
  { ok: true } | { ok: false; reason: BrandingRefusal; message?: string };

/** The account belongs to the caller only when its owner is their Entra object id. */
const ownedByCaller = (ctx: AccessContext) =>
  eq(mspAccounts.ownerOid, ctx.user.oid);

const isAccountOwner = (
  ctx: AccessContext,
  account: Pick<typeof mspAccounts.$inferSelect, "ownerOid">,
) => !ctx.user.isDemo && account.ownerOid === ctx.user.oid;

/** Owners and admins manage a standalone workspace; viewers never do. */
const editsWorkspace = (ctx: AccessContext) =>
  !ctx.user.isDemo && ctx.membership.role !== "viewer";

/**
 * Writes the brand columns behind the active workspace: the MSP account it is
 * attached to, or the workspace itself when it stands alone. The account owner
 * check is part of the update itself, so it holds against the stored row and
 * never against anything the client sent.
 */
const writeBranding = async (
  ctx: AccessContext,
  values: BrandColumns,
): Promise<BrandingResult> => {
  if (!hasFeature(ctx.entitlement, "whiteLabel")) {
    return { ok: false, reason: "featureRequired" };
  }
  // The demo sign-in is shared by every visitor, so it never owns branding.
  if (ctx.user.isDemo) return { ok: false, reason: "demoUser" };
  const accountId = ctx.tenant.mspAccountId;

  if (!accountId) {
    if (!editsWorkspace(ctx)) {
      return {
        ok: false,
        reason: "notOwner",
        message: "Only a workspace owner or admin can change its branding.",
      };
    }
    const updated = await db
      .update(tenants)
      .set(values)
      .where(eq(tenants.id, ctx.tenant.id))
      .returning({ id: tenants.id });
    return updated.length > 0
      ? { ok: true }
      : { ok: false, reason: "notOwner" };
  }

  const updated = await db
    .update(mspAccounts)
    .set(values)
    .where(and(eq(mspAccounts.id, accountId), ownedByCaller(ctx)))
    .returning({ id: mspAccounts.id });
  return updated.length > 0 ? { ok: true } : { ok: false, reason: "notOwner" };
};

/** Saves the branding behind the active workspace. */
export async function saveBranding(
  ctx: AccessContext,
  input: unknown,
): Promise<BrandingResult> {
  // Refuse a workspace without the feature before looking at the payload.
  if (!hasFeature(ctx.entitlement, "whiteLabel")) {
    return { ok: false, reason: "featureRequired" };
  }
  const parsed = brandingInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      reason: "invalid",
      message: parsed.error.issues[0]?.message,
    };
  }
  const { name, color, logo } = parsed.data;
  return writeBranding(ctx, {
    brandName: name,
    brandColor: color,
    brandLogo: logo,
  });
}

/** Back to the LicenseMeter report for every workspace the branding reached. */
export async function clearBranding(
  ctx: AccessContext,
): Promise<BrandingResult> {
  return writeBranding(ctx, {
    brandName: null,
    brandColor: null,
    brandLogo: null,
  });
}

// --- portal page ---------------------------------------------------------------

export type BrandingSettings = {
  /** Null when the active workspace is not attached to an MSP account. */
  account: { id: string; name: string | null } | null;
  /** The signed-in user owns that account and may change its branding. */
  isOwner: boolean;
  /** Where the branding lives: the MSP account, or this workspace itself. */
  scope: "account" | "workspace";
  /**
   * The signed-in user may change the branding: the account owner for an
   * attached workspace, a workspace owner or admin for a standalone one.
   */
  canEdit: boolean;
  /** What is stored, whether or not it is complete enough to be applied. */
  branding: ReportBranding;
  /**
   * The workspaces the branding applies to. For an account, listed for its
   * owner only: a member of one client workspace must not learn the MSP's
   * other clients. For a standalone workspace, just itself, for its editors.
   */
  workspaces: { id: string; name: string }[];
};

/** What the branding page shows for the active workspace. */
export async function getBrandingSettings(
  ctx: AccessContext,
): Promise<BrandingSettings> {
  const accountId = ctx.tenant.mspAccountId;
  if (!accountId) {
    const canEdit = editsWorkspace(ctx);
    return {
      account: null,
      isOwner: false,
      scope: "workspace",
      canEdit,
      branding: {
        name: ctx.tenant.brandName,
        color: ctx.tenant.brandColor,
        logo: ctx.tenant.brandLogo,
      },
      workspaces: canEdit
        ? [{ id: ctx.tenant.id, name: workspaceLabel(ctx.tenant) }]
        : [],
    };
  }

  const [account] = await db
    .select()
    .from(mspAccounts)
    .where(eq(mspAccounts.id, accountId))
    .limit(1);
  if (!account) {
    // Attached to an account that no longer exists: nothing is branded.
    return {
      account: null,
      isOwner: false,
      scope: "account",
      canEdit: false,
      branding: { name: null, color: null, logo: null },
      workspaces: [],
    };
  }

  const isOwner = isAccountOwner(ctx, account);
  const attached = isOwner
    ? await db
        .select({ tenant: tenants })
        .from(tenants)
        .where(eq(tenants.mspAccountId, accountId))
        .orderBy(asc(tenants.createdAt), asc(tenants.id))
    : [];

  return {
    account: { id: account.id, name: account.name },
    isOwner,
    scope: "account",
    canEdit: isOwner,
    branding: {
      name: account.brandName,
      color: account.brandColor,
      logo: account.brandLogo,
    },
    workspaces: attached.map(({ tenant }) => ({
      id: tenant.id,
      name: workspaceLabel(tenant),
    })),
  };
}
