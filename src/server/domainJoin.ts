import { and, asc, eq, isNull, or, sql } from "drizzle-orm";

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
  /** Entra object id: the key of every row written here. */
  oid: string;
  /** Entra home tenant of the signer, proven by the id token's issuer. */
  tid: string;
  /**
   * Lowercased address the membership is stored under. Proven only when
   * emailVerified is true; otherwise a display value (the UPN) that names the
   * row and decides nothing.
   */
  email: string;
  /** The session's emailProven: the id token carried xms_edov with the email. */
  emailVerified: boolean;
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

/**
 * The workspace connected to a Microsoft tenant. tenants.tid is unique, and the
 * signer's tid comes from the verified id token, so a match is the strongest
 * proof of being a colleague there is: stronger than any email.
 */
export const findTenantWorkspace = async (
  db: Db,
  tid: string,
): Promise<TenantRow | null> => {
  if (!tid) return null;
  const [row] = await db
    .select()
    .from(tenants)
    .where(and(eq(tenants.tid, tid), eq(tenants.isDemo, false)))
    .orderBy(asc(tenants.createdAt), asc(tenants.id))
    .limit(1);
  return row ?? null;
};

/** Whether the "Who can join" setting has any effect for this workspace. */
export const holdsJoinableDomain = async (
  db: Db,
  tenant: Pick<TenantRow, "id" | "tid" | "domain" | "isDemo">,
): Promise<boolean> => {
  if (tenant.isDemo) return false;
  // Colleagues from the connected Microsoft tenant are matched by tid.
  if (tenant.tid) return true;
  if (!tenant.domain) return false;
  if (isConsumerEmailDomain(tenant.domain)) return false;
  const holder = await findDomainWorkspace(db, tenant.domain);
  return holder?.id === tenant.id;
};

/**
 * Gives the person a viewer membership keyed on their object id and reports
 * whether they now have one. A row they already hold keeps its role. A row
 * under their address that belongs to someone else (another object id, or a
 * legacy member who has not linked yet) is never touched: the address alone
 * proves nothing, and the legacy member gets in through the claim flow. An
 * unclaimed row can only be an invite that expired (a live one would have
 * matched at sign-in), and a domain join must not inherit the role it carried.
 */
const linkViewerMembership = async (
  tx: Tx,
  tenantId: string,
  who: { email: string; oid: string; name: string | null },
): Promise<boolean> => {
  const [mine] = await tx
    .select({ id: memberships.id })
    .from(memberships)
    .where(
      and(eq(memberships.tenantId, tenantId), eq(memberships.oid, who.oid)),
    )
    .limit(1);
  if (mine) return true;

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
    if (existing.oid ?? existing.workosUserId) return false;
    const claimed = await tx
      .update(memberships)
      .set({ oid: who.oid, role: "viewer", name: existing.name ?? who.name })
      .where(and(eq(memberships.id, existing.id), isNull(memberships.oid)))
      .returning({ id: memberships.id });
    return claimed.length > 0;
  }
  const inserted = await tx
    .insert(memberships)
    .values({
      tenantId,
      oid: who.oid,
      email: who.email,
      name: who.name,
      role: "viewer",
    })
    .onConflictDoNothing()
    .returning({ id: memberships.id });
  return inserted.length > 0;
};

/**
 * Approval of a request filed before sign-in moved to Entra: the row carries
 * no object id, so the membership is created as a legacy one. The person gets
 * in once it is linked, by proven email or by the claim mail.
 */
const linkLegacyViewerMembership = async (
  tx: Tx,
  tenantId: string,
  who: { email: string; workosUserId: string; name: string | null },
): Promise<void> => {
  await tx
    .insert(memberships)
    .values({
      tenantId,
      workosUserId: who.workosUserId,
      email: who.email,
      name: who.name,
      role: "viewer",
    })
    .onConflictDoNothing();
};

export type DomainJoinOutcome =
  | { kind: "none" }
  | { kind: "joined"; tenant: TenantRow }
  | { kind: "requested"; tenant: TenantRow; requestId: string };

export type DomainJoinResult = {
  outcome: DomainJoinOutcome;
  /** The verified corporate domain of the identity, if any. */
  domain: string | null;
  /**
   * Whether the person's organization already has a workspace: one answers for
   * that domain, or one is connected to their Microsoft tenant.
   */
  domainHeld: boolean;
};

/**
 * Runs the domain-join decision for a sign-in that has no workspace yet. The
 * workspace is the one connected to the signer's Microsoft tenant (tid, proven
 * by the token), else the one holding their proven email domain. An unproven
 * email never selects a workspace. `allowRequest` is consulted only right
 * before a NEW request would be filed; returning false drops it silently (rate
 * limiting lives with the caller).
 */
export const applyDomainJoin = async (
  db: Db,
  who: SignInIdentity,
  opts: { allowRequest?: (tenantId: string) => Promise<boolean> } = {},
): Promise<DomainJoinResult> => {
  const domain = corporateDomainOf(who.email, who.emailVerified);
  const tenant =
    (await findTenantWorkspace(db, who.tid)) ??
    (domain ? await findDomainWorkspace(db, domain) : null);
  if (!tenant) return { outcome: { kind: "none" }, domain, domainHeld: false };
  const none: DomainJoinResult = {
    outcome: { kind: "none" },
    domain,
    domainHeld: true,
  };

  // The person's own row, or (only with a proven email) the row they filed
  // under that address before sign-in moved to Entra: a decision made then
  // still stands.
  const [request] = await db
    .select({ status: joinRequests.status })
    .from(joinRequests)
    .where(
      and(
        eq(joinRequests.tenantId, tenant.id),
        who.emailVerified
          ? or(
              eq(joinRequests.oid, who.oid),
              and(isNull(joinRequests.oid), eq(joinRequests.email, who.email)),
            )
          : eq(joinRequests.oid, who.oid),
      ),
    )
    .orderBy(sql`${joinRequests.oid} is null`)
    .limit(1);

  const decision = decideDomainJoin({
    mode: tenant.domainJoinMode,
    requestStatus: request?.status ?? null,
    // Reaching this line means the match above was made on proof: the tid of
    // the verified token, or a proven email domain.
    emailVerified: true,
    consumerDomain: false,
  });
  if (decision === "none") return none;

  if (decision === "join") {
    const joined = await db.transaction(async (tx) => {
      if (!(await linkViewerMembership(tx, tenant.id, who))) return false;
      // Recorded as approved so removing this member later sticks: the next
      // sign-in sees a decided row and does not join again.
      const now = new Date();
      await tx
        .insert(joinRequests)
        .values({
          tenantId: tenant.id,
          email: who.email,
          oid: who.oid,
          tid: who.tid,
          name: who.name,
          status: "approved",
          decidedAt: now,
        })
        .onConflictDoUpdate({
          target: [joinRequests.tenantId, joinRequests.oid],
          targetWhere: sql`${joinRequests.oid} is not null`,
          set: { status: "approved", decidedAt: now },
        });
      await tx.insert(auditLog).values({
        tenantId: tenant.id,
        actorOid: who.oid,
        actorEmail: who.email,
        action: "member_domain_joined",
        detail: { email: who.email, role: "viewer" },
      });
      return true;
    });
    return joined ? { ...none, outcome: { kind: "joined", tenant } } : none;
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
        oid: who.oid,
        tid: who.tid,
        name: who.name,
      })
      .onConflictDoNothing()
      .returning({ id: joinRequests.id });
    if (!created) return null;
    await tx.insert(auditLog).values({
      tenantId: tenant.id,
      actorOid: who.oid,
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
 *
 * Two first requests of the same person (the page and a prefetch, two tabs)
 * both find no membership and both get here. The transaction-scoped advisory
 * lock on the object id serialises them, and the re-check inside the lock makes
 * the second one a no-op, so exactly one workspace is created.
 */
export const createOwnedWorkspace = async (
  db: Db,
  who: SignInIdentity,
  domain: string | null,
): Promise<boolean> =>
  db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${"workspace-provision:" + who.oid}, 0))`,
    );
    const [mine] = await tx
      .select({ id: memberships.id })
      .from(memberships)
      .where(eq(memberships.oid, who.oid))
      .limit(1);
    if (mine) return true;

    // The domain can have been taken while this request waited for its lock.
    const held = domain ? await findDomainWorkspace(tx, domain) : null;
    const claimed = held ? null : domain;
    const [created] = await tx
      .insert(tenants)
      .values({ name: claimed, domain: claimed })
      .returning({ id: tenants.id });
    if (!created) return false;
    await tx.insert(memberships).values({
      tenantId: created.id,
      oid: who.oid,
      email: who.email,
      name: who.name,
      role: "owner",
    });
    return true;
  });

/**
 * First sign-in with no membership. A colleague either joins the workspace of
 * their organization (auto) or files a request there (approval); unless they
 * joined, they also get a workspace of their own so they are never stuck
 * waiting. That workspace claims the domain only when nobody holds it.
 */
export const provisionForSignIn = async (
  db: Db,
  who: SignInIdentity,
  opts: { allowRequest?: (tenantId: string) => Promise<boolean> } = {},
): Promise<{ provisioned: boolean; outcome: DomainJoinOutcome }> => {
  if (!who.oid || !who.email) {
    return { provisioned: false, outcome: { kind: "none" } };
  }
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

export type ApprovalResult =
  | DecisionResult
  /**
   * The requester's address already names a membership of someone else here,
   * so no membership could be created. The request stays pending and nothing
   * was written.
   */
  | { status: "address_taken" };

/** Rolls the approval back when the membership could not be created. */
class AddressTakenError extends Error {}

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

/**
 * Approve a pending request of THIS workspace and link the viewer membership.
 * Both or neither: an approval that could not produce a membership would leave
 * the person locked out with a decided request they cannot file again.
 */
export const approveJoinRequestRow = async (
  db: Db,
  args: { tenantId: string; requestId: string; decidedByMembershipId: string },
): Promise<ApprovalResult> => {
  try {
    return await db.transaction(async (tx) => {
      const result = await decide(tx, args, "approved");
      if (result.status === "done" && result.changed) {
        const { email, oid, workosUserId, name } = result.request;
        if (oid) {
          const linked = await linkViewerMembership(tx, args.tenantId, {
            email,
            oid,
            name,
          });
          if (!linked) throw new AddressTakenError();
        } else if (workosUserId) {
          await linkLegacyViewerMembership(tx, args.tenantId, {
            email,
            workosUserId,
            name,
          });
        }
      }
      return result;
    });
  } catch (err) {
    if (err instanceof AddressTakenError) return { status: "address_taken" };
    throw err;
  }
};

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
  oid: string,
): Promise<{ id: string; tenantName: string | null }[]> =>
  db
    .select({ id: joinRequests.id, tenantName: tenants.name })
    .from(joinRequests)
    .innerJoin(tenants, eq(joinRequests.tenantId, tenants.id))
    .where(and(eq(joinRequests.oid, oid), eq(joinRequests.status, "pending")))
    .orderBy(asc(joinRequests.createdAt));
