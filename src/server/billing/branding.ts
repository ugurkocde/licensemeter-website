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
 * White-label report branding of an MSP account. The marks live on the account
 * and reach the PDF of every client workspace attached to it, as long as that
 * workspace has the whiteLabel feature. Nothing here touches a workspace or
 * its data: clearing the branding only brings the LicenseMeter report back.
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
  | "notDataUrl"
  | "unsupportedType"
  | "tooLarge"
  | "contentMismatch";

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

/** The account a workspace may take its branding from, or null when it may not. */
const brandingAccountId = (
  tenant: Pick<TenantRow, "mspAccountId">,
  entitlement: Entitlement,
): string | null =>
  hasFeature(entitlement, "whiteLabel") ? tenant.mspAccountId : null;

/**
 * The branding a workspace's report carries: the marks of its MSP account, only
 * while the workspace has the whiteLabel feature, is attached to an account and
 * that account has a brand name or a logo. Null means the LicenseMeter report.
 * Never queries for a workspace that cannot be branded.
 */
export async function getBranding(
  tenant: Pick<TenantRow, "mspAccountId">,
  entitlement: Entitlement,
): Promise<ReportBranding | null> {
  const accountId = brandingAccountId(tenant, entitlement);
  if (!accountId) return null;
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
  /** The active workspace is not attached to an MSP account. */
  | "noAccount"
  /** Only the owner of the MSP account may change its branding. */
  | "notOwner"
  | "invalid";

export type BrandingResult =
  | { ok: true }
  | { ok: false; reason: BrandingRefusal; message?: string };

/**
 * The account is the caller's when its owner is their Entra object id. An
 * account from before sign-in moved to Entra gets that id when its owner's
 * membership is linked (identityLink.ts), so the legacy owner column is never
 * consulted here.
 */
const ownedByCaller = (ctx: AccessContext) =>
  eq(mspAccounts.ownerOid, ctx.user.oid);

const isAccountOwner = (
  ctx: AccessContext,
  account: Pick<typeof mspAccounts.$inferSelect, "ownerOid">,
) => !ctx.user.isDemo && account.ownerOid === ctx.user.oid;

/**
 * Writes the brand columns of the account the active workspace is attached to.
 * The owner check is part of the update itself, so it holds against the stored
 * row and never against anything the client sent.
 */
const writeBranding = async (
  ctx: AccessContext,
  values: BrandColumns,
): Promise<BrandingResult> => {
  if (!hasFeature(ctx.entitlement, "whiteLabel")) {
    return { ok: false, reason: "featureRequired" };
  }
  // The demo sign-in is shared by every visitor, so it never owns an account.
  if (ctx.user.isDemo) return { ok: false, reason: "demoUser" };
  const accountId = ctx.tenant.mspAccountId;
  if (!accountId) return { ok: false, reason: "noAccount" };

  const updated = await db
    .update(mspAccounts)
    .set(values)
    .where(and(eq(mspAccounts.id, accountId), ownedByCaller(ctx)))
    .returning({ id: mspAccounts.id });
  return updated.length > 0 ? { ok: true } : { ok: false, reason: "notOwner" };
};

/** Saves the branding of the MSP account behind the active workspace. */
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

/** Back to the LicenseMeter report for every workspace of the account. */
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
  /** What is stored, whether or not it is complete enough to be applied. */
  branding: ReportBranding;
  /**
   * The workspaces the branding applies to. Listed for the account owner only:
   * a member of one client workspace must not learn the MSP's other clients.
   */
  workspaces: { id: string; name: string }[];
};

/** What the branding page shows for the active workspace. */
export async function getBrandingSettings(
  ctx: AccessContext,
): Promise<BrandingSettings> {
  const none: BrandingSettings = {
    account: null,
    isOwner: false,
    branding: { name: null, color: null, logo: null },
    workspaces: [],
  };
  const accountId = ctx.tenant.mspAccountId;
  if (!accountId) return none;

  const [account] = await db
    .select()
    .from(mspAccounts)
    .where(eq(mspAccounts.id, accountId))
    .limit(1);
  if (!account) return none;

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
