import { and, eq, gt, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";

import { env } from "~/env";
import { workspaceLabel } from "~/lib/format";
import { upgradePath } from "~/lib/upgrade";
import { auth, type Session } from "~/server/auth";
import { cookieOptions } from "~/server/auth/session";
import { db } from "~/server/db";
import { memberships, tenants } from "~/server/db/schema";
import { ensureDemoWorkspace } from "~/server/demo/seed";
import { provisionForSignIn } from "~/server/domainJoin";
import {
  hasFeature,
  planFor,
  type Entitlement,
  type Feature,
} from "~/server/entitlement";
import { loadEntitlement } from "~/server/entitlementStore";
import { clientIp, rateLimitDurable } from "~/server/rateLimit";
import type { MembershipRole } from "~/server/types";
import {
  sendDomainJoinedNotice,
  sendJoinRequestNotice,
} from "~/server/workspaceEmail";

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
  user: {
    oid: string;
    tid: string;
    upn: string;
    name: string;
    isDemo: boolean;
  };
  tenant: typeof tenants.$inferSelect;
  membership: typeof memberships.$inferSelect;
  /** Every workspace this user can open (MSP/consultant support). */
  workspaces: WorkspaceSummary[];
  /**
   * Plan and paid features of the active workspace. Free keeps everything it
   * has today; a self-hosted install resolves to every feature.
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
    entitlement: await loadEntitlement(active.tenant),
  };
};

/** Limits on new access requests, so sign-in loops cannot flood admins. */
const JOIN_REQUESTS_PER_WORKSPACE_PER_DAY = 20;
const JOIN_REQUESTS_PER_IP_PER_HOUR = 5;

/**
 * Gate for filing a NEW access request (each one mails every owner/admin).
 * A person can only ever hold one request per workspace, so the realistic
 * abuse is many fresh accounts: capped per target workspace and per client IP.
 * Fails closed: without a working limiter no request (and no mail) is created,
 * and the person simply lands in their own workspace.
 */
const allowJoinRequest = async (tenantId: string): Promise<boolean> => {
  const ip = clientIp(await headers());
  if (
    ip !== "unknown" &&
    !(await rateLimitDurable(
      `join-request-ip:${ip}`,
      JOIN_REQUESTS_PER_IP_PER_HOUR,
      60 * 60 * 1000,
      "deny",
    ))
  ) {
    return false;
  }
  return rateLimitDurable(
    `join-request:${tenantId}`,
    JOIN_REQUESTS_PER_WORKSPACE_PER_DAY,
    24 * 60 * 60 * 1000,
    "deny",
  );
};

/**
 * First WorkOS sign-in with no membership: provision access so the user lands on
 * a dashboard instead of a dead end. A verified corporate-domain user is matched
 * to the workspace holding that domain, and its owner decides what happens:
 * join as viewer ('auto'), file an access request ('approval') or nothing
 * ('off'). Everyone who did not join gets a fresh workspace they own, so nobody
 * waits on an approval to use the product. The workspace starts without a
 * connected service. Returns true when a membership now exists for this user.
 */
const provisionWorkspace = async (
  session: Session,
  workosUserId: string,
): Promise<boolean> => {
  const email = (session.user.email ?? "").toLowerCase();
  if (!email) return false;

  const { provisioned, outcome } = await provisionForSignIn(
    db,
    {
      email,
      emailVerified: session.user.emailVerified === true,
      workosUserId,
      name: session.user.name ?? null,
    },
    { allowRequest: allowJoinRequest },
  );

  // Owner/admin mail goes out after the response and can never block or fail
  // the sign-in. A request notifies once: only the sign-in that created the
  // row gets a "requested" outcome.
  if (outcome.kind !== "none") {
    const { kind, tenant } = outcome;
    after(async () => {
      try {
        if (kind === "requested") {
          await sendJoinRequestNotice(tenant, email);
        } else if (
          await rateLimitDurable(
            `join-notice:${tenant.id}`,
            JOIN_REQUESTS_PER_WORKSPACE_PER_DAY,
            24 * 60 * 60 * 1000,
            "deny",
          )
        ) {
          await sendDomainJoinedNotice(tenant, email);
        }
      } catch (err) {
        console.error("[domain-join] admin notice failed", err);
      }
    });
  }
  return provisioned;
};

/**
 * WorkOS-mode resolution. Identity is the WorkOS user id; the workspace is
 * matched either by a previously-linked membership (workos_user_id) or, for the
 * user's own verified email, by the email column, which also lazily links that
 * membership (claiming an invite or adopting an entra-era row) on first sign-in.
 * A brand-new user with no membership is provisioned a workspace (domain join or
 * their own) so sign-in always lands on a dashboard, never a forced connect gate.
 * There is no Entra tid here, so the home-tenant heuristic is dropped: active
 * workspace is the cookie choice, else the first accessible one.
 */
const resolveWorkos = async (
  session: Session,
  workosUserId: string,
): Promise<AccessContext | null> => {
  const upn = session.user.upn;
  const email = (session.user.email ?? "").toLowerCase();
  const canLinkByEmail =
    session.user.emailVerified === true && email.length > 0;
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
    // First sign-in, no invite: provision a workspace (domain join or their own)
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
    user: {
      oid: workosUserId,
      tid: "",
      upn,
      name: session.user.name ?? "",
      isDemo: false,
    },
    tenant: active.tenant,
    membership: active.membership,
    workspaces: rows.map((r) => ({
      id: r.tenant.id,
      name: workspaceLabel(r.tenant),
      role: r.membership.role,
      isDemo: r.tenant.isDemo,
    })),
    entitlement: await loadEntitlement(active.tenant),
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

/** For pages/layouts: like requireAccess, plus an upgrade redirect when the plan lacks the feature. */
export const requireFeature = async (
  feature: Feature,
  minRole: MembershipRole = "viewer",
): Promise<AccessContext> => {
  const ctx = await requireAccess(minRole);
  if (!hasFeature(ctx.entitlement, feature)) redirect(upgradePath(feature));
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

export type FeatureAccess =
  | { ctx: AccessContext; denied: null }
  | { ctx: null; denied: "unauthorized" }
  /** Signed in with the right role, but the plan lacks the feature: answer 402. */
  | {
      ctx: null;
      denied: "featureRequired";
      feature: Feature;
      plan: ReturnType<typeof planFor>;
    };

/**
 * For API routes and server actions that serve a paid feature: apiAccess, with
 * the missing-feature case kept apart so a route can answer 402 instead of 401.
 */
export const apiFeatureAccess = async (
  feature: Feature,
  minRole: MembershipRole = "viewer",
): Promise<FeatureAccess> => {
  const ctx = await apiAccess(minRole);
  if (!ctx) return { ctx: null, denied: "unauthorized" };
  if (!hasFeature(ctx.entitlement, feature)) {
    return {
      ctx: null,
      denied: "featureRequired",
      feature,
      plan: planFor(feature),
    };
  }
  return { ctx, denied: null };
};

/** Workspace-switch cookie options (validated against memberships per request). */
export const workspaceCookieOptions = () =>
  cookieOptions(WORKSPACE_COOKIE_MAX_AGE);
