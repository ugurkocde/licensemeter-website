import { and, eq } from "drizzle-orm";

import type { AccessContext, WorkspaceSummary } from "~/server/access";
import type { EntitlementOwner } from "~/server/billing/entitlementWrites";
import { getMspAccount } from "~/server/billing/mspAccount";
import { db } from "~/server/db";
import { entitlements, tenants } from "~/server/db/schema";
import { entitlementOf } from "~/server/entitlement";
import { loadEntitlement } from "~/server/entitlementStore";

export const LANDING_PATH = "/marketplace/landing";

/**
 * Every way the landing page can refuse, with the text the buyer reads. The
 * invalid token wording is the guidance Microsoft asks publishers to show:
 * https://learn.microsoft.com/partner-center/marketplace-offers/pc-saas-fulfillment-subscription-api#resolve-a-purchased-subscription
 */
export const LANDING_ERRORS = {
  notConfigured:
    "Purchases through Microsoft Marketplace are not set up on this installation of LicenseMeter, so there is nothing to activate here.",
  invalidToken:
    "We couldn't identify this purchase. Reopen this SaaS subscription in the Azure portal or in Microsoft 365 Admin Center and select Configure Account or Manage Account again.",
  unavailable:
    "Microsoft Marketplace did not answer just now. Nothing was changed and you have not been charged. Please try again in a few minutes.",
  unknownPlan:
    "This purchase is for a plan LicenseMeter does not recognise. Please contact us and mention the plan name shown in your Microsoft order.",
  ended:
    "This subscription has been cancelled in Microsoft Marketplace, so it cannot be activated. You can buy it again from the listing.",
  linkedElsewhere:
    "This subscription is already linked to a workspace you do not own. Ask the owner of that workspace, or sign in with the account that activated it.",
  notOwner:
    "Choose a workspace where you are the owner. Only an owner can attach a paid plan.",
  demo: "The demo workspace cannot hold a paid plan. Sign in with your own account and open this page again from Microsoft Marketplace.",
  otherProvider:
    "This workspace already has a paid plan that is billed another way. Cancel that plan first, or choose a different workspace, so you are never charged twice.",
  otherSubscription:
    "This workspace already has a different Microsoft Marketplace subscription. Choose another workspace, or cancel the older subscription in Microsoft Marketplace first.",
  attachFailed:
    "This workspace could not be added to your MSP plan. It may belong to another MSP account, or your owner role on it has changed. Nothing was activated and you have not been charged.",
  activateFailed:
    "Microsoft Marketplace did not accept the activation. You have not been charged. Please try again, and contact us if it keeps failing.",
} as const;

export type LandingError = keyof typeof LANDING_ERRORS;

export const isLandingError = (value: unknown): value is LandingError =>
  typeof value === "string" && value in LANDING_ERRORS;

/** The landing page with the purchase token kept, so a retry needs no new visit. */
export const landingPath = (token: string | null, error?: LandingError) => {
  const params = new URLSearchParams();
  if (token) params.set("token", token);
  if (error) params.set("error", error);
  const query = params.toString();
  return query ? `${LANDING_PATH}?${query}` : LANDING_PATH;
};

/**
 * A return path is only ever a relative path on this origin: one leading
 * slash, no scheme, no backslash or line break, and it must still resolve to
 * the origin it was joined to.
 */
export const safeReturnPath = (path: string): string | null => {
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  if (path.includes("://") || /[\\\r\n]/.test(path)) return null;
  const base = "https://return.invalid";
  try {
    return new URL(path, base).origin === base ? path : null;
  } catch {
    return null;
  }
};

/** Workspaces that can take a paid plan from this user: owner role, not the demo. */
export const ownedWorkspaces = (ctx: AccessContext): WorkspaceSummary[] =>
  ctx.workspaces.filter((w) => w.role === "owner" && !w.isDemo);

export type MarketplaceLink = typeof entitlements.$inferSelect;

/** The entitlement row a Marketplace subscription is linked to, if any. */
export const findMarketplaceLink = async (
  subscriptionId: string,
): Promise<MarketplaceLink | null> => {
  const [row] = await db
    .select()
    .from(entitlements)
    .where(
      and(
        eq(entitlements.source, "marketplace"),
        eq(entitlements.providerSubscriptionId, subscriptionId),
      ),
    )
    .limit(1);
  return row ?? null;
};

export const ownerOfLink = (link: MarketplaceLink): EntitlementOwner | null =>
  link.tenantId
    ? { tenantId: link.tenantId }
    : link.mspAccountId
      ? { mspAccountId: link.mspAccountId }
      : null;

/** Whether the signed-in user owns whatever the subscription is linked to. */
export const callerOwnsLink = async (
  ctx: AccessContext,
  link: MarketplaceLink,
): Promise<boolean> => {
  if (link.tenantId) {
    return ownedWorkspaces(ctx).some((w) => w.id === link.tenantId);
  }
  const account = await getMspAccount(ctx);
  return account !== null && account.id === link.mspAccountId;
};

/**
 * Refuses an owner that is already paying some other way, so nobody is billed
 * twice: a running plan from another provider (or a comp), or a different
 * Marketplace subscription that still grants a plan.
 */
export const ownerConflict = async (
  owner: EntitlementOwner,
  subscriptionId: string,
  now: Date = new Date(),
): Promise<LandingError | null> => {
  // A workspace can be granted a plan through its attached MSP account without
  // an entitlements row of its own. Resolve the full entitlement first so an
  // inherited grant is not mistaken for no coverage (which would let a second
  // plan be linked to an already-paid workspace).
  if ("tenantId" in owner) {
    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, owner.tenantId),
    });
    if (tenant) {
      const resolved = await loadEntitlement(tenant, now);
      if (resolved.plan !== "free") {
        const [own] = await db
          .select()
          .from(entitlements)
          .where(eq(entitlements.tenantId, owner.tenantId))
          .limit(1);
        if (
          own?.source === "marketplace" &&
          own.providerSubscriptionId === subscriptionId
        ) {
          return null;
        }
        return own?.source === "marketplace"
          ? "otherSubscription"
          : "otherProvider";
      }
    }
  }
  const [existing] = await db
    .select()
    .from(entitlements)
    .where(
      "tenantId" in owner
        ? eq(entitlements.tenantId, owner.tenantId)
        : eq(entitlements.mspAccountId, owner.mspAccountId),
    )
    .limit(1);
  if (!existing) return null;
  if (
    existing.source === "marketplace" &&
    existing.providerSubscriptionId === subscriptionId
  ) {
    return null;
  }
  const granted = entitlementOf({
    tenant: { isDemo: false },
    record: existing,
    covered: true,
    billingEnabled: true,
    now,
  });
  if (granted.plan === "free") return null;
  return existing.source === "marketplace"
    ? "otherSubscription"
    : "otherProvider";
};
