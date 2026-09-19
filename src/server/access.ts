import {
  and,
  asc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
} from "drizzle-orm";
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
import { linkLegacyMemberships } from "~/server/identityLink";
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
 * First sign-in with no membership: provision access so the user lands on a
 * dashboard instead of a dead end. A colleague is matched to the workspace
 * connected to their Microsoft tenant, else to the one holding their proven
 * email domain, and its owner decides what happens: join as viewer ('auto'),
 * file an access request ('approval') or nothing ('off'). Everyone who did not
 * join gets a fresh workspace they own, so nobody waits on an approval to use
 * the product. The workspace starts without a connected service. Returns true
 * when a membership now exists for this user.
 */
const provisionWorkspace = async (session: Session): Promise<boolean> => {
  const { oid, tid, upn } = session.user;
  const emailProven = session.user.emailProven === true;
  // The address the membership is stored under. Unproven, the UPN is the
  // better label (its domain is verified in the home tenant, the email
  // attribute is free text); either way it only names the row.
  const email = (
    emailProven ? (session.user.email ?? "") : upn || (session.user.email ?? "")
  )
    .trim()
    .toLowerCase();
  if (!email) return false;

  const { provisioned, outcome } = await provisionForSignIn(
    db,
    {
      oid,
      tid,
      email,
      emailVerified: emailProven,
      name: session.user.name || null,
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

type MembershipRow = typeof memberships.$inferSelect;

/** A member from before sign-in moved to Entra who has not been linked yet. */
const isUnlinkedLegacy = (m: MembershipRow) =>
  m.oid === null && m.workosUserId !== null;

/**
 * Resolves every workspace the signed-in user may open, then the active one.
 * The one identity is the Entra object id.
 *
 * Membership matching is deliberately asymmetric:
 * - by Entra object id: the user has opened this workspace before;
 * - unclaimed invites from ANY tenant: only by an email the id token proved
 *   (emailProven), so a consultant invited as consultant@msp.example is the
 *   account Microsoft vouches for. The UPN alone opens nothing across tenants:
 *   Microsoft documents preferred_username as mutable and not to be used for
 *   authorization;
 * - unclaimed invites by UPN or unproven email claim: valid only when signing
 *   in FROM the workspace tenant itself, because both are admin/user-mutable
 *   and must not grant cross-tenant access;
 * - legacy memberships (no object id, from before sign-in moved to Entra) by
 *   email, ONLY when the id token proved that email (emailProven). They are
 *   linked on the spot, all of them, and keep role, plan and data. Without the
 *   proof nothing is linked and the person is offered the claim mail instead.
 *
 * An invite is a row nobody ever signed in to (no object id and no legacy id),
 * so the invite rules can never pick up a legacy member's row. Same-tenant
 * sign-in alone still opens nothing: it goes through the workspace's "who can
 * join" setting like a domain match. A person with no membership at all is
 * provisioned (domain join or a workspace of their own), so sign-in always
 * lands on a dashboard.
 */
const resolveAccess = async (
  session: Session | null,
): Promise<AccessContext | null> => {
  if (!session?.user?.oid || !session.user.tid) return null;
  const { oid, tid, upn, isDemo } = session.user;

  if (isDemo) await ensureDemoWorkspace();

  const identifiers = [upn, session.user.email ?? ""]
    .filter(Boolean)
    .map((s) => s.toLowerCase());
  const inviteCutoff = new Date(Date.now() - INVITE_TTL_DAYS * 86_400_000);
  // Strictly the boolean: a session from before the field existed is unproven.
  const provenEmail =
    !isDemo && session.user.emailProven === true
      ? (session.user.email ?? "").trim().toLowerCase()
      : "";
  const unclaimedInvite = and(
    isNull(memberships.oid),
    isNull(memberships.workosUserId),
    gt(memberships.createdAt, inviteCutoff),
  );

  // Ordered, so the active workspace without a cookie is stable across requests.
  const accessible = () =>
    db
      .select({ membership: memberships, tenant: tenants })
      .from(memberships)
      .innerJoin(tenants, eq(memberships.tenantId, tenants.id))
      .where(
        or(
          eq(memberships.oid, oid),
          provenEmail
            ? and(
                unclaimedInvite,
                eq(sql`lower(${memberships.email})`, provenEmail),
              )
            : sql`false`,
          identifiers.length > 0
            ? and(
                unclaimedInvite,
                inArray(sql`lower(${memberships.email})`, identifiers),
                eq(tenants.tid, tid),
              )
            : sql`false`,
          provenEmail
            ? and(
                isNull(memberships.oid),
                isNotNull(memberships.workosUserId),
                eq(sql`lower(${memberships.email})`, provenEmail),
              )
            : sql`false`,
        ),
      )
      .orderBy(asc(tenants.createdAt), asc(tenants.id));

  let rows = await accessible();
  if (provenEmail && rows.some((r) => isUnlinkedLegacy(r.membership))) {
    await linkLegacyMemberships(
      db,
      { oid, email: provenEmail, name: session.user.name || null },
      "proven_email",
    );
    rows = await accessible();
  }
  // A legacy row that is still unlinked was skipped on purpose (the person
  // already has a membership in that workspace) and opens nothing.
  rows = rows.filter((r) => !isUnlinkedLegacy(r.membership));

  if (rows.length === 0) {
    if (isDemo) return null;
    // First sign-in, no invite: provision a workspace (domain join or their
    // own) and re-read, so the user lands on a dashboard rather than a dead end.
    if (!(await provisionWorkspace(session))) return null;
    rows = (await accessible()).filter((r) => !isUnlinkedLegacy(r.membership));
    if (rows.length === 0) return null;
  }

  // Active workspace: cookie choice if still valid, else the home-tenant
  // workspace, else the oldest one.
  const cookieWs = (await cookies()).get(WORKSPACE_COOKIE)?.value;
  const active =
    rows.find((r) => r.tenant.id === cookieWs) ??
    rows.find((r) => r.tenant.tid === tid) ??
    rows[0]!;

  // First sign-in of an invited user: claim the membership row. The update
  // repeats the unclaimed condition, so it can never overwrite an identity.
  if (!active.membership.oid) {
    const claimed = await db
      .update(memberships)
      .set({ oid, name: session.user.name || active.membership.name })
      .where(
        and(
          eq(memberships.id, active.membership.id),
          isNull(memberships.oid),
          isNull(memberships.workosUserId),
        ),
      )
      .returning({ id: memberships.id });
    if (claimed.length === 0) return null;
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

/**
 * Whether memberships exist that could be this person's but were not linked
 * for lack of proof, so the UI can offer the claim mail. Boolean only.
 */
export { pendingClaimFor } from "~/server/membershipClaims";

/** Workspace-switch cookie options (validated against memberships per request). */
export const workspaceCookieOptions = () =>
  cookieOptions(WORKSPACE_COOKIE_MAX_AGE);
