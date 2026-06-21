import { and, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { billingEnabled } from "~/env";
import { auth, type Session } from "~/server/auth";
import { cookieOptions } from "~/server/auth/session";
import { db } from "~/server/db";
import { memberships, tenants } from "~/server/db/schema";
import { ensureDemoWorkspace } from "~/server/demo/seed";
import { entitlementOf, type Entitlement } from "~/server/entitlement";
import type { MembershipRole } from "~/server/types";

export const WORKSPACE_COOKIE = "lm_ws";
const WORKSPACE_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

/** Unclaimed invites stop matching after this many days; resending resets the clock. */
export const INVITE_TTL_DAYS = 14;

export const inviteExpiry = (createdAt: Date): Date =>
  new Date(createdAt.getTime() + INVITE_TTL_DAYS * 86_400_000);

export type WorkspaceSummary = {
  id: string;
  name: string;
  role: MembershipRole;
  isDemo: boolean;
};

export type AccessContext = {
  user: { oid: string; tid: string; upn: string; name: string; isDemo: boolean };
  tenant: typeof tenants.$inferSelect;
  membership: typeof memberships.$inferSelect;
  /** Every workspace this user can open (MSP/consultant support). */
  workspaces: WorkspaceSummary[];
  /**
   * Billing entitlement for the active workspace, computed from cached tenant
   * columns (no extra query). Drives the trial banner and the soft-lock gates.
   */
  entitlement: Entitlement;
};

const ROLE_RANK: Record<MembershipRole, number> = {
  viewer: 0,
  admin: 1,
  owner: 2,
};

export const hasRole = (ctx: AccessContext, minRole: MembershipRole) =>
  ROLE_RANK[ctx.membership.role] >= ROLE_RANK[minRole];

/**
 * Resolves every workspace the signed-in user may open, then the active one.
 *
 * Membership matching is invite-based and deliberately asymmetric:
 * - by Entra object id: the user has opened this workspace before;
 * - unclaimed invites by UPN: valid from ANY tenant, because UPN domains are
 *   verified by Microsoft (a consultant invited as consultant@msp.example can
 *   only be the account whose home tenant owns msp.example);
 * - unclaimed invites by email claim: valid only when signing in FROM the
 *   workspace tenant itself, because the email attribute is admin/user-mutable
 *   and must not grant cross-tenant access.
 *
 * Same-tenant sign-in alone still grants nothing.
 */
const resolveAccess = async (
  session: Session | null,
): Promise<AccessContext | null> => {
  if (!session?.user?.oid) return null;
  const { oid, tid, upn, isDemo } = session.user;

  if (isDemo) await ensureDemoWorkspace();

  const upnLower = upn.toLowerCase();
  const identifiers = [upn, session.user.email ?? ""]
    .filter(Boolean)
    .map((s) => s.toLowerCase());
  const inviteCutoff = new Date(Date.now() - INVITE_TTL_DAYS * 86_400_000);

  const rows = await db
    .select({ membership: memberships, tenant: tenants })
    .from(memberships)
    .innerJoin(tenants, eq(memberships.tenantId, tenants.id))
    .where(
      or(
        eq(memberships.oid, oid),
        upnLower
          ? and(
              isNull(memberships.oid),
              gt(memberships.createdAt, inviteCutoff),
              eq(sql`lower(${memberships.email})`, upnLower),
            )
          : sql`false`,
        identifiers.length > 0
          ? and(
              isNull(memberships.oid),
              gt(memberships.createdAt, inviteCutoff),
              inArray(sql`lower(${memberships.email})`, identifiers),
              eq(tenants.tid, tid),
            )
          : sql`false`,
      ),
    );
  if (rows.length === 0) return null;

  // Active workspace: cookie choice if still valid, else the home-tenant
  // workspace, else the first one.
  const cookieWs = (await cookies()).get(WORKSPACE_COOKIE)?.value;
  const active =
    rows.find((r) => r.tenant.id === cookieWs) ??
    rows.find((r) => r.tenant.tid === tid) ??
    rows[0]!;

  // First sign-in of an invited user: claim the membership row.
  if (!active.membership.oid) {
    await db
      .update(memberships)
      .set({ oid, name: session.user.name ?? null })
      .where(eq(memberships.id, active.membership.id));
    active.membership.oid = oid;
  }

  return {
    user: { oid, tid, upn, name: session.user.name ?? "", isDemo },
    tenant: active.tenant,
    membership: active.membership,
    workspaces: rows.map((r) => ({
      id: r.tenant.id,
      name: r.tenant.name ?? r.tenant.tid,
      role: r.membership.role,
      isDemo: r.tenant.isDemo,
    })),
    // Cached-column fast path: status/paidUntil live on the tenant row, so the
    // banner and gates need no extra query. The full subscription row (plan,
    // cancel date) is loaded only on the billing page.
    entitlement: entitlementOf(
      active.tenant,
      null,
      new Date(),
      !billingEnabled(),
    ),
  };
};

/** For pages/layouts: redirects to landing when signed out. */
export const requireSession = async (): Promise<Session> => {
  const session = await auth();
  if (!session?.user?.oid) redirect("/");
  return session;
};

/** For pages/layouts: null when no workspace is accessible. */
export const getAccessContext = async (): Promise<AccessContext | null> => {
  const session = await requireSession();
  return resolveAccess(session);
};

/** For pages/layouts: redirects to the connect page / overview as appropriate. */
export const requireAccess = async (
  minRole: MembershipRole = "viewer",
): Promise<AccessContext> => {
  const ctx = await getAccessContext();
  if (!ctx) redirect("/app/connect");
  if (!hasRole(ctx, minRole)) redirect("/app");
  return ctx;
};

/** For API routes and server actions: returns null instead of redirecting. */
export const apiAccess = async (
  minRole: MembershipRole = "viewer",
): Promise<AccessContext | null> => {
  const session = await auth();
  const ctx = await resolveAccess(session);
  if (!ctx || !hasRole(ctx, minRole)) return null;
  return ctx;
};

/** Workspace-switch cookie options (validated against memberships per request). */
export const workspaceCookieOptions = () =>
  cookieOptions(WORKSPACE_COOKIE_MAX_AGE);
