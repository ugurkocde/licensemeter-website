import { and, asc, eq, exists, isNull, or, sql } from "drizzle-orm";

import { billingEnabled } from "~/env";
import { workspaceLabel } from "~/lib/format";
import type { AccessContext } from "~/server/access";
import { db } from "~/server/db";
import {
  entitlements,
  memberships,
  mspAccounts,
  tenants,
} from "~/server/db/schema";
import { entitlementOf, type EntitlementState } from "~/server/entitlement";
import type { EntitlementSource } from "~/server/types";

/**
 * The MSP account of a signed-in user: one per owner, holding the MSP plan and
 * the client workspaces attached to it. Attaching only ever stamps
 * tenants.mspAccountId and detaching only ever clears it, so nothing here can
 * delete a workspace or its data.
 */

export type MspAccountSummary = { id: string; name: string | null };

export type CoverageWorkspace = {
  id: string;
  name: string;
  /** False when the caller attached it earlier and has since lost the owner role. */
  owned: boolean;
  isDemo: boolean;
  attached: boolean;
  /** Attached to a different MSP account, so it cannot be attached here. */
  attachedElsewhere: boolean;
  /** Among the first `quantity` attached workspaces. */
  covered: boolean;
};

export type MspCoverage = {
  account: MspAccountSummary | null;
  /** What the account's MSP plan grants right now; "free" when it has none. */
  state: EntitlementState;
  source: EntitlementSource | null;
  currentPeriodEnd: Date | null;
  /** Workspaces the plan covers right now: 0 without a running MSP plan. */
  quantity: number;
  attachedCount: number;
  coveredCount: number;
  workspaces: CoverageWorkspace[];
};

export type AttachRefusal =
  | "demoUser"
  | "noAccount"
  | "notFound"
  | "notOwner"
  | "demoWorkspace"
  | "attachedElsewhere";

export type DetachRefusal = "noAccount" | "notAttached";

export type AttachResult = { ok: true } | { ok: false; reason: AttachRefusal };
export type DetachResult = { ok: true } | { ok: false; reason: DetachRefusal };

export class MspAccountError extends Error {
  constructor(readonly reason: "demoUser") {
    super(`MSP account refused: ${reason}`);
    this.name = "MspAccountError";
  }
}

type Identity = { oid: string };

const identityOf = (ctx: AccessContext): Identity => ({ oid: ctx.user.oid });

const accountOwnedBy = (who: Identity) => eq(mspAccounts.ownerOid, who.oid);

const membershipOf = (who: Identity) => eq(memberships.oid, who.oid);

/** The caller holds the owner role on the tenants row of the outer query. */
const callerOwnsTenant = (who: Identity) =>
  exists(
    db
      .select({ one: sql`1` })
      .from(memberships)
      .where(
        and(
          eq(memberships.tenantId, tenants.id),
          eq(memberships.role, "owner"),
          membershipOf(who),
        ),
      ),
  );

/** The first `quantity` ids of a list already ordered by createdAt, then id. */
export const coveredIds = (
  orderedAttachedIds: readonly string[],
  quantity: number,
): Set<string> =>
  new Set(orderedAttachedIds.slice(0, Math.max(0, Math.floor(quantity))));

const findAccount = async (
  who: Identity,
): Promise<MspAccountSummary | null> => {
  const [row] = await db
    .select({ id: mspAccounts.id, name: mspAccounts.name })
    .from(mspAccounts)
    .where(accountOwnedBy(who))
    .orderBy(asc(mspAccounts.createdAt), asc(mspAccounts.id))
    .limit(1);
  return row ?? null;
};

/**
 * One statement decides and writes, so a concurrent role change or a second
 * account cannot slip between a check and the update: the workspace is stamped
 * only while the caller owns it, it is not the demo, and no other account
 * holds it.
 */
const attachIfAllowed = async (
  who: Identity,
  accountId: string,
  tenantId: string,
): Promise<boolean> => {
  const updated = await db
    .update(tenants)
    .set({ mspAccountId: accountId })
    .where(
      and(
        eq(tenants.id, tenantId),
        eq(tenants.isDemo, false),
        or(isNull(tenants.mspAccountId), eq(tenants.mspAccountId, accountId)),
        callerOwnsTenant(who),
      ),
    )
    .returning({ id: tenants.id });
  return updated.length > 0;
};

/** The caller's MSP account, or null when they never started one. */
export async function getMspAccount(
  ctx: AccessContext,
): Promise<MspAccountSummary | null> {
  if (ctx.user.isDemo) return null;
  return findAccount(identityOf(ctx));
}

/**
 * Creates or returns the caller's MSP account, then attaches the active
 * workspace when the caller owns it and no other account holds it, unless
 * `attachActive` is false (the Marketplace landing page attaches the workspace
 * the buyer picked instead). The unique owner indexes make a concurrent
 * double-create collapse into one row.
 */
export async function ensureMspAccount(
  ctx: AccessContext,
  options: { attachActive?: boolean } = {},
): Promise<{ id: string }> {
  // The demo sign-in is shared by every visitor, so it never owns an account.
  if (ctx.user.isDemo) throw new MspAccountError("demoUser");
  const who = identityOf(ctx);

  let account = await findAccount(who);
  if (!account) {
    await db
      .insert(mspAccounts)
      .values({ ownerOid: who.oid })
      .onConflictDoNothing();
    account = await findAccount(who);
  }
  if (!account) throw new Error("MSP account missing after create");

  if (options.attachActive !== false) {
    await attachIfAllowed(who, account.id, ctx.tenant.id);
  }
  return { id: account.id };
}

/**
 * The account, what its plan covers right now, and every workspace the caller
 * owns. Coverage follows the rule of loadEntitlement: the first `quantity`
 * attached workspaces, ordered by createdAt then id, in SQL.
 */
export async function listCoverage(
  ctx: AccessContext,
  now: Date = new Date(),
): Promise<MspCoverage> {
  const who = identityOf(ctx);
  const account = ctx.user.isDemo ? null : await findAccount(who);

  const [record] = account
    ? await db
        .select()
        .from(entitlements)
        .where(eq(entitlements.mspAccountId, account.id))
        .limit(1)
    : [];
  const granted = entitlementOf({
    tenant: { isDemo: false },
    record: record ?? null,
    covered: true,
    billingEnabled: billingEnabled(),
    now,
  });
  const running = record !== undefined && granted.plan === "msp";
  const quantity = running ? record.quantity : 0;

  const owned = await db
    .select({ tenant: tenants })
    .from(tenants)
    .where(callerOwnsTenant(who))
    .orderBy(asc(tenants.createdAt), asc(tenants.id));
  const attached = account
    ? await db
        .select({ tenant: tenants })
        .from(tenants)
        .where(eq(tenants.mspAccountId, account.id))
        .orderBy(asc(tenants.createdAt), asc(tenants.id))
    : [];

  const covered = coveredIds(
    attached.map((r) => r.tenant.id),
    quantity,
  );
  const ownedIds = new Set(owned.map((r) => r.tenant.id));
  // Attached workspaces the caller no longer owns stay listed, so a slot they
  // still pay for can always be released.
  const rows = [
    ...owned,
    ...attached.filter((r) => !ownedIds.has(r.tenant.id)),
  ];

  return {
    account,
    state: running ? granted.state : "free",
    source: running ? record.source : null,
    currentPeriodEnd: running ? record.currentPeriodEnd : null,
    quantity,
    attachedCount: attached.length,
    coveredCount: covered.size,
    workspaces: rows.map(({ tenant }) => {
      const isAttached = account !== null && tenant.mspAccountId === account.id;
      return {
        id: tenant.id,
        name: workspaceLabel(tenant),
        owned: ownedIds.has(tenant.id),
        isDemo: tenant.isDemo,
        attached: isAttached,
        attachedElsewhere: tenant.mspAccountId !== null && !isAttached,
        covered: covered.has(tenant.id),
      };
    }),
  };
}

/**
 * Attaches a workspace to the caller's MSP account. The owner role is checked
 * against memberships inside the update itself, never against ctx.workspaces
 * or anything the client sent.
 */
export async function attachWorkspace(
  ctx: AccessContext,
  tenantId: string,
): Promise<AttachResult> {
  if (ctx.user.isDemo) return { ok: false, reason: "demoUser" };
  const who = identityOf(ctx);
  const account = await findAccount(who);
  if (!account) return { ok: false, reason: "noAccount" };

  if (await attachIfAllowed(who, account.id, tenantId)) return { ok: true };

  // Refused: read back why. A workspace the caller cannot own looks the same
  // as one that does not exist, so ids cannot be probed.
  const [row] = await db
    .select({
      isDemo: tenants.isDemo,
      mspAccountId: tenants.mspAccountId,
    })
    .from(tenants)
    .where(and(eq(tenants.id, tenantId), callerOwnsTenant(who)))
    .limit(1);
  if (!row) {
    const [member] = await db
      .select({ id: memberships.id })
      .from(memberships)
      .where(and(eq(memberships.tenantId, tenantId), membershipOf(who)))
      .limit(1);
    return { ok: false, reason: member ? "notOwner" : "notFound" };
  }
  if (row.isDemo) return { ok: false, reason: "demoWorkspace" };
  return { ok: false, reason: "attachedElsewhere" };
}

/**
 * Releases a workspace from the caller's MSP account. Only the account owner
 * can, and only for a workspace that account holds. The workspace, its data
 * and its members stay exactly as they are; it falls back to its own plan.
 */
export async function detachWorkspace(
  ctx: AccessContext,
  tenantId: string,
): Promise<DetachResult> {
  if (ctx.user.isDemo) return { ok: false, reason: "noAccount" };
  const account = await findAccount(identityOf(ctx));
  if (!account) return { ok: false, reason: "noAccount" };

  const updated = await db
    .update(tenants)
    .set({ mspAccountId: null })
    .where(and(eq(tenants.id, tenantId), eq(tenants.mspAccountId, account.id)))
    .returning({ id: tenants.id });
  return updated.length > 0
    ? { ok: true }
    : { ok: false, reason: "notAttached" };
}
