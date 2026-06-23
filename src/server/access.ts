import { and, asc, eq, gt, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { billingEnabled, env } from "~/env";
import { workspaceLabel } from "~/lib/format";
import { auth, type Session } from "~/server/auth";
import { cookieOptions } from "~/server/auth/session";
import { db } from "~/server/db";
import { memberships, mspAccounts, tenants } from "~/server/db/schema";
import { ensureDemoWorkspace } from "~/server/demo/seed";
import {
  entitlementOf,
  mspEntitlementOf,
  type Entitlement,
} from "~/server/entitlement";
import type { MembershipRole } from "~/server/types";

// __Host- prefix in production locks the workspace cookie to this exact host
// over HTTPS (no subdomain can inject it), matching the session/oauth cookies.
export const WORKSPACE_COOKIE =
  env.NODE_ENV === "production" ? "__Host-lm_ws" : "lm_ws";
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
 * Resolve the active workspace's billing entitlement. Default (self-serve) path
 * is byte-identical to the old inline entitlementOf call: cached tenant columns,
 * no extra query. Only when a workspace is attached to an MSP account
 * (tenant.mspAccountId set — never true today) do we load that account row and
 * resolve from the MSP's single quantity subscription instead. Inert until an
 * MSP portfolio exists, and zero added cost for normal tenants.
 */
const resolveEntitlement = async (
  tenant: typeof tenants.$inferSelect,
): Promise<Entitlement> => {
  const billingDisabled = !billingEnabled();
  if (tenant.mspAccountId) {
    const [account] = await db
      .select()
      .from(mspAccounts)
      .where(eq(mspAccounts.id, tenant.mspAccountId))
      .limit(1);
    // A dangling reference (account deleted out from under the tenant) falls
    // back to the standalone path rather than locking the workspace out.
    if (account) return mspEntitlementOf(account, new Date(), billingDisabled);
  }
  return entitlementOf(tenant, null, new Date(), billingDisabled);
};

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
const resolveEntra = async (
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
      name: workspaceLabel(r.tenant),
      role: r.membership.role,
      isDemo: r.tenant.isDemo,
    })),
    // Cached-column fast path: status/paidUntil live on the tenant row, so the
    // banner and gates need no extra query (the MSP branch only loads a row when
    // mspAccountId is set). The full subscription row (plan, cancel date) is
    // loaded only on the billing page.
    entitlement: await resolveEntitlement(active.tenant),
  };
};

/**
 * Public email providers: their domain is shared by strangers, so it must never
 * trigger domain-JIT (a gmail.com user must not auto-join another gmail user's
 * workspace). Everything else is treated as a corporate domain.
 */
const CONSUMER_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com",
  "msn.com", "yahoo.com", "yahoo.co.uk", "icloud.com", "me.com", "mac.com",
  "aol.com", "proton.me", "protonmail.com", "pm.me", "gmx.com", "gmx.de",
  "gmx.net", "web.de", "mail.com", "yandex.com", "zoho.com", "fastmail.com",
  "hey.com", "qq.com", "163.com", "126.com",
]);

const domainOfEmail = (email: string): string | null => {
  const d = email.split("@")[1]?.toLowerCase().trim();
  return d?.includes(".") ? d : null;
};

/** A verified, non-consumer email domain eligible for workspace domain-JIT. */
const corporateDomainOf = (
  email: string,
  emailVerified: boolean,
): string | null => {
  if (!emailVerified) return null;
  const d = domainOfEmail(email);
  return d && !CONSUMER_EMAIL_DOMAINS.has(d) ? d : null;
};

/**
 * First WorkOS sign-in with no membership: provision access so the user lands on
 * a dashboard instead of a dead end. Domain-JIT — a verified corporate-domain
 * user joins the existing same-domain workspace that allows it (no duplicate
 * empty workspaces for colleagues); everyone else gets a fresh personal
 * workspace they own. The workspace carries NO tid/connector and NO
 * trialStartedAt yet: the trial clock starts when they connect their first
 * service. Returns true when a membership now exists for this user.
 */
const provisionWorkspace = async (
  session: Session,
  workosUserId: string,
): Promise<boolean> => {
  const email = (session.user.email ?? "").toLowerCase();
  if (!email) return false;
  const corp = corporateDomainOf(email, session.user.emailVerified === true);

  // Domain-JIT: join the oldest joinable workspace for this corporate domain.
  if (corp) {
    const [joinable] = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(
        and(
          eq(tenants.domain, corp),
          eq(tenants.allowDomainJoin, true),
          eq(tenants.isDemo, false),
        ),
      )
      .orderBy(asc(tenants.createdAt))
      .limit(1);
    if (joinable) {
      await db
        .insert(memberships)
        .values({
          tenantId: joinable.id,
          workosUserId,
          email,
          name: session.user.name ?? null,
          role: "viewer",
        })
        .onConflictDoUpdate({
          target: [memberships.tenantId, memberships.email],
          set: { workosUserId },
        });
      return true;
    }
  }

  // Otherwise create a personal workspace owned by this user, in one transaction
  // so a crash can't leave a tenant with no owner. Corporate domains are recorded
  // + joinable so the next colleague lands here; consumer domains are left null
  // (unmatchable) so strangers never auto-join.
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(tenants)
      .values({
        name: corp ?? null,
        domain: corp,
        allowDomainJoin: corp !== null,
      })
      .returning({ id: tenants.id });
    if (!created) return false;
    await tx.insert(memberships).values({
      tenantId: created.id,
      workosUserId,
      email,
      name: session.user.name ?? null,
      role: "owner",
    });
    return true;
  });
};

/**
 * WorkOS-mode resolution. Identity is the WorkOS user id; the workspace is
 * matched either by a previously-linked membership (workos_user_id) or, for the
 * user's own verified email, by the email column — which also lazily links that
 * membership (claiming an invite or adopting an entra-era row) on first sign-in.
 * A brand-new user with no membership is provisioned a workspace (domain-JIT or
 * personal) so sign-in always lands on a dashboard, never a forced connect gate.
 * There is no Entra tid here, so the home-tenant heuristic is dropped: active
 * workspace is the cookie choice, else the first accessible one.
 */
const resolveWorkos = async (
  session: Session,
  workosUserId: string,
): Promise<AccessContext | null> => {
  const upn = session.user.upn;
  const email = (session.user.email ?? "").toLowerCase();
  const canLinkByEmail = session.user.emailVerified === true && email.length > 0;
  const inviteCutoff = new Date(Date.now() - INVITE_TTL_DAYS * 86_400_000);

  const accessible = () =>
    db
      .select({ membership: memberships, tenant: tenants })
      .from(memberships)
      .innerJoin(tenants, eq(memberships.tenantId, tenants.id))
      .where(
        or(
          eq(memberships.workosUserId, workosUserId),
          // Link by the user's own verified email, but never resurrect a stale
          // unclaimed invite: only rows not yet linked to a WorkOS user that are
          // either an existing (entra-era, already-claimed) membership being
          // migrated, or a still-fresh invite.
          canLinkByEmail
            ? and(
                isNull(memberships.workosUserId),
                or(
                  isNotNull(memberships.oid),
                  gt(memberships.createdAt, inviteCutoff),
                ),
                eq(sql`lower(${memberships.email})`, email),
              )
            : sql`false`,
        ),
      );

  let rows = await accessible();
  if (rows.length === 0) {
    // First sign-in, no invite: provision a workspace (domain-JIT or personal)
    // and re-read, so the user lands on a dashboard rather than a dead end.
    const provisioned = await provisionWorkspace(session, workosUserId);
    if (!provisioned) return null;
    rows = await accessible();
    if (rows.length === 0) return null;
  }

  const cookieWs = (await cookies()).get(WORKSPACE_COOKIE)?.value;
  const active = rows.find((r) => r.tenant.id === cookieWs) ?? rows[0]!;

  // Link the active membership to this WorkOS identity on first touch.
  if (active.membership.workosUserId !== workosUserId) {
    await db
      .update(memberships)
      .set({
        workosUserId,
        name: session.user.name ?? active.membership.name,
      })
      .where(eq(memberships.id, active.membership.id));
    active.membership.workosUserId = workosUserId;
  }

  return {
    // Project the WorkOS user id onto the actor id used for audit/display.
    user: { oid: workosUserId, tid: "", upn, name: session.user.name ?? "", isDemo: false },
    tenant: active.tenant,
    membership: active.membership,
    workspaces: rows.map((r) => ({
      id: r.tenant.id,
      name: workspaceLabel(r.tenant),
      role: r.membership.role,
      isDemo: r.tenant.isDemo,
    })),
    entitlement: await resolveEntitlement(active.tenant),
  };
};

/**
 * Dispatches to the workos or entra resolver based on which identity the
 * session carries, so both login stacks share every downstream consumer.
 */
const resolveAccess = (
  session: Session | null,
): Promise<AccessContext | null> => {
  const workosUserId = session?.user?.workosUserId;
  if (session && workosUserId) return resolveWorkos(session, workosUserId);
  return resolveEntra(session);
};

/** For pages/layouts: redirects to landing when signed out. */
export const requireSession = async (): Promise<Session> => {
  const session = await auth();
  if (!session?.user || (!session.user.oid && !session.user.workosUserId)) {
    redirect("/");
  }
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
