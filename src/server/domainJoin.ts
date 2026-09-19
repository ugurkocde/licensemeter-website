import { and, asc, eq, sql } from "drizzle-orm";

import {
  corporateDomainOf,
  decideDomainJoin,
  isConsumerEmailDomain,
} from "~/lib/domainJoin";
import type { Db } from "~/server/db";
import {
  auditLog,
  joinRequests,
  memberships,
  tenants,
  type TenantRow,
} from "~/server/db/schema";

/**
 * Database side of domain join. Takes the db as an argument and imports
 * nothing from Next.js or the auth stack, so it runs unchanged against the
 * PGlite test harness. Mail, rate limits and request scope stay with callers.
 */

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export type SignInIdentity = {
  /** Lowercased sign-in email. */
  email: string;
  emailVerified: boolean;
  workosUserId: string;
  name: string | null;
};

export type JoinRequestRow = typeof joinRequests.$inferSelect;

/**
 * The one workspace that answers for an email domain: the oldest non-demo
 * workspace carrying it. Its domainJoinMode decides what colleagues may do,
 * including 'off'. Workspaces provisioned later for people from the same
 * domain are created without a domain, so they can never take over this role.
 */
export const findDomainWorkspace = async (
  db: Db,
  domain: string,
): Promise<TenantRow | null> => {
  const [row] = await db
    .select()
    .from(tenants)
    .where(and(eq(tenants.domain, domain), eq(tenants.isDemo, false)))
    .orderBy(asc(tenants.createdAt), asc(tenants.id))
    .limit(1);
  return row ?? null;
};

/** Whether the "Who can join" setting has any effect for this workspace. */
export const holdsJoinableDomain = async (
  db: Db,
  tenant: Pick<TenantRow, "id" | "domain" | "isDemo">,
): Promise<boolean> => {
  if (!tenant.domain || tenant.isDemo) return false;
  if (isConsumerEmailDomain(tenant.domain)) return false;
  const holder = await findDomainWorkspace(db, tenant.domain);
  return holder?.id === tenant.id;
};

/**
 * Gives the person a viewer membership linked to their WorkOS identity. A row
 * someone already signed in with keeps its role. An unclaimed row can only be
 * an invite that expired (a live one would have matched at sign-in), and a
 * domain join must not inherit the role that invite carried.
 */
const linkViewerMembership = async (
  tx: Tx,
  tenantId: string,
  who: { email: string; workosUserId: string; name: string | null },
): Promise<void> => {
  const [existing] = await tx
    .select()
    .from(memberships)
    .where(
      and(
        eq(memberships.tenantId, tenantId),
        eq(sql`lower(${memberships.email})`, who.email),
      ),
    )
    .limit(1);
  if (existing) {
    const claimed = Boolean(existing.oid ?? existing.workosUserId);
    await tx
      .update(memberships)
      .set(
        claimed
          ? { workosUserId: existing.workosUserId ?? who.workosUserId }
          : {
              workosUserId: who.workosUserId,
              role: "viewer",
              name: existing.name ?? who.name,
            },
      )
      .where(eq(memberships.id, existing.id));
    return;
  }
  await tx
    .insert(memberships)
    .values({
      tenantId,
      workosUserId: who.workosUserId,
      email: who.email,
      name: who.name,
      role: "viewer",
    })
    .onConflictDoUpdate({
      target: [memberships.tenantId, memberships.email],
      set: { workosUserId: who.workosUserId, role: "viewer" },
    });
};

export type DomainJoinOutcome =
  | { kind: "none" }
  | { kind: "joined"; tenant: TenantRow }
  | { kind: "requested"; tenant: TenantRow; requestId: string };

export type DomainJoinResult = {
  outcome: DomainJoinOutcome;
  /** The verified corporate domain of the identity, if any. */
  domain: string | null;
  /** Whether some workspace already answers for that domain. */
  domainHeld: boolean;
};

/**
 * Runs the domain-join decision for a sign-in that has no workspace yet.
 * `allowRequest` is consulted only right before a NEW request would be filed;
 * returning false drops it silently (rate limiting lives with the caller).
 */
export const applyDomainJoin = async (
  db: Db,
  who: SignInIdentity,
  opts: { allowRequest?: (tenantId: string) => Promise<boolean> } = {},
): Promise<DomainJoinResult> => {
  const domain = corporateDomainOf(who.email, who.emailVerified);
  if (!domain) return { outcome: { kind: "none" }, domain, domainHeld: false };

  const tenant = await findDomainWorkspace(db, domain);
  if (!tenant) return { outcome: { kind: "none" }, domain, domainHeld: false };
  const none: DomainJoinResult = {
    outcome: { kind: "none" },
    domain,
    domainHeld: true,
  };

  const [request] = await db
    .select({ status: joinRequests.status })
    .from(joinRequests)
    .where(
      and(
        eq(joinRequests.tenantId, tenant.id),
        eq(joinRequests.email, who.email),
      ),
    )
    .limit(1);

  const decision = decideDomainJoin({
    mode: tenant.domainJoinMode,
    requestStatus: request?.status ?? null,
    emailVerified: who.emailVerified,
    consumerDomain: false,
  });
  if (decision === "none") return none;

  if (decision === "join") {
    await db.transaction(async (tx) => {
      await linkViewerMembership(tx, tenant.id, who);
      // Recorded as approved so removing this member later sticks: the next
      // sign-in sees a decided row and does not join again.
      const now = new Date();
      await tx
        .insert(joinRequests)
        .values({
          tenantId: tenant.id,
          email: who.email,
          workosUserId: who.workosUserId,
          name: who.name,
          status: "approved",
          decidedAt: now,
        })
        .onConflictDoUpdate({
          target: [joinRequests.tenantId, joinRequests.email],
          set: { status: "approved", decidedAt: now },
        });
      await tx.insert(auditLog).values({
        tenantId: tenant.id,
        actorOid: who.workosUserId,
        actorEmail: who.email,
        action: "member_domain_joined",
        detail: { email: who.email, role: "viewer" },
      });
    });
    return { ...none, outcome: { kind: "joined", tenant } };
  }

  if (opts.allowRequest && !(await opts.allowRequest(tenant.id))) return none;
  const requestId = await db.transaction(async (tx) => {
    // onConflictDoNothing: a concurrent sign-in of the same person files the
    // request once; the loser gets no row back and notifies nobody.
    const [created] = await tx
      .insert(joinRequests)
      .values({
        tenantId: tenant.id,
        email: who.email,
        workosUserId: who.workosUserId,
        name: who.name,
      })
      .onConflictDoNothing()
      .returning({ id: joinRequests.id });
    if (!created) return null;
    await tx.insert(auditLog).values({
      tenantId: tenant.id,
      actorOid: who.workosUserId,
      actorEmail: who.email,
      action: "member_join_requested",
      detail: { email: who.email },
    });
    return created.id;
  });
  return requestId
    ? { ...none, outcome: { kind: "requested", tenant, requestId } }
    : none;
};

/**
 * A workspace owned by this person, in one transaction so a crash cannot leave
 * a workspace without an owner. `domain` is set only for the first workspace
 * of a corporate domain; everyone else gets a workspace nobody can match.
 */
export const createOwnedWorkspace = async (
  db: Db,
  who: SignInIdentity,
  domain: string | null,
): Promise<boolean> =>
  db.transaction(async (tx) => {
    // A first sign-in fires several requests at once (layout, page, prefetch),
    // and every one of them arrives here with no membership yet. Serialise per
    // user and look again inside the lock: the first request creates the
    // workspace, the others adopt it instead of creating an empty twin.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`workspace-provision:${who.workosUserId}`}, 0))`,
    );
    const [existing] = await tx
      .select({ id: memberships.id })
      .from(memberships)
      .where(eq(memberships.workosUserId, who.workosUserId))
      .limit(1);
    if (existing) return true;

    const [created] = await tx
      .insert(tenants)
      .values({ name: domain, domain })
      .returning({ id: tenants.id });
    if (!created) return false;
    await tx.insert(memberships).values({
      tenantId: created.id,
      workosUserId: who.workosUserId,
      email: who.email,
      name: who.name,
      role: "owner",
    });
    return true;
  });

/**
 * First sign-in with no membership. A verified colleague either joins the
 * workspace holding their domain (auto) or files a request there (approval);
 * unless they joined, they also get a workspace of their own so they are never
 * stuck waiting. That workspace claims the domain only when nobody holds it.
 */
export const provisionForSignIn = async (
  db: Db,
  who: SignInIdentity,
  opts: { allowRequest?: (tenantId: string) => Promise<boolean> } = {},
): Promise<{ provisioned: boolean; outcome: DomainJoinOutcome }> => {
  if (!who.email) return { provisioned: false, outcome: { kind: "none" } };
  const result = await applyDomainJoin(db, who, opts);
  if (result.outcome.kind === "joined") {
    return { provisioned: true, outcome: result.outcome };
  }
  const provisioned = await createOwnedWorkspace(
    db,
    who,
    result.domainHeld ? null : result.domain,
  );
  return { provisioned, outcome: result.outcome };
};

export type DecisionResult =
  | { status: "done"; request: JoinRequestRow; changed: boolean }
  | { status: "not_found" }
  | { status: "conflict"; current: "approved" | "declined" };

const decide = async (
  tx: Tx,
  args: { tenantId: string; requestId: string; decidedByMembershipId: string },
  to: "approved" | "declined",
): Promise<DecisionResult> => {
  // Compare-and-set on the pending state: of two concurrent clicks exactly one
  // gets the row back, so the membership and the emails happen once.
  const [won] = await tx
    .update(joinRequests)
    .set({
      status: to,
      decidedAt: new Date(),
      decidedByMembershipId: args.decidedByMembershipId,
    })
    .where(
      and(
        eq(joinRequests.id, args.requestId),
        eq(joinRequests.tenantId, args.tenantId),
        eq(joinRequests.status, "pending"),
      ),
    )
    .returning();
  if (won) return { status: "done", request: won, changed: true };

  const [current] = await tx
    .select()
    .from(joinRequests)
    .where(
      and(
        eq(joinRequests.id, args.requestId),
        eq(joinRequests.tenantId, args.tenantId),
      ),
    )
    .limit(1);
  if (!current) return { status: "not_found" };
  if (current.status === to) {
    return { status: "done", request: current, changed: false };
  }
  return {
    status: "conflict",
    current: current.status === "approved" ? "approved" : "declined",
  };
};

/** Approve a pending request of THIS workspace and link the viewer membership. */
export const approveJoinRequestRow = (
  db: Db,
  args: { tenantId: string; requestId: string; decidedByMembershipId: string },
): Promise<DecisionResult> =>
  db.transaction(async (tx) => {
    const result = await decide(tx, args, "approved");
    if (result.status === "done" && result.changed) {
      await linkViewerMembership(tx, args.tenantId, {
        email: result.request.email,
        workosUserId: result.request.workosUserId,
        name: result.request.name,
      });
    }
    return result;
  });

export const declineJoinRequestRow = (
  db: Db,
  args: { tenantId: string; requestId: string; decidedByMembershipId: string },
): Promise<DecisionResult> =>
  db.transaction((tx) => decide(tx, args, "declined"));

/** Pending requests for the Members card, oldest first. */
export const pendingJoinRequests = (
  db: Db,
  tenantId: string,
): Promise<JoinRequestRow[]> =>
  db
    .select()
    .from(joinRequests)
    .where(
      and(
        eq(joinRequests.tenantId, tenantId),
        eq(joinRequests.status, "pending"),
      ),
    )
    .orderBy(asc(joinRequests.createdAt));

/** Workspaces this person is still waiting on, for the dashboard notice. */
export const pendingJoinRequestsOf = (
  db: Db,
  workosUserId: string,
): Promise<{ id: string; tenantName: string | null }[]> =>
  db
    .select({ id: joinRequests.id, tenantName: tenants.name })
    .from(joinRequests)
    .innerJoin(tenants, eq(joinRequests.tenantId, tenants.id))
    .where(
      and(
        eq(joinRequests.workosUserId, workosUserId),
        eq(joinRequests.status, "pending"),
      ),
    )
    .orderBy(asc(joinRequests.createdAt));
