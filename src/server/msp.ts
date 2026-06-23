"use server";

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { mspEnabled } from "~/env";
import { workspaceLabel } from "~/lib/format";
import { MSP_LARGE_TENANT_SEATS } from "~/lib/plans";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import {
  findings,
  memberships,
  mspAccounts,
  snapshots,
  subscriptions,
  tenants,
} from "~/server/db/schema";
import { notifyOps } from "~/server/ops";
import { knownSeats, stripe } from "~/server/stripe";
import type { SubscriptionStatus } from "~/server/types";

/**
 * MSP account lifecycle (module M2). A signed-in user creates and owns ONE MSP
 * account; they attach client workspaces they OWN to it; billing is a single
 * Stripe quantity subscription on the account (quantity = attached tenant
 * count). Attached tenants inherit entitlement from the account (wired in
 * access.ts via mspEntitlementOf).
 *
 * These functions operate ACROSS the user's workspaces + the MSP account, not a
 * single workspace ctx, so they gate on owner-identity match (the account's
 * ownerWorkosUserId/ownerOid against the session identity), not a workspace
 * role. Per-tenant mutations additionally require an OWNER membership of the
 * tenant being (de)attached.
 *
 * MSP-level events are not tied to a tenant ctx, and audit() needs one, so they
 * are signalled via notifyOps. TODO(phase-2): an MSP-scoped audit() variant
 * (e.g. auditLog keyed by mspAccountId) once the durable per-account activity
 * log is added.
 */

export type ActionResult = { ok: boolean; error?: string };

const fail = (error: string): ActionResult => ({ ok: false, error });
const ok = (): ActionResult => ({ ok: true });

const revalidateApp = () => revalidatePath("/app", "layout");

type Identity = { workosUserId: string | null; oid: string | null };

/**
 * Resolve the signed-in non-demo actor identity from the session, the same auth
 * path apiAccess uses. Returns the dual identity (exactly one of workosUserId /
 * oid populated, mirroring how memberships/mspAccounts store the owner). Null
 * for a signed-out OR demo session — the demo sample never owns an MSP account.
 */
const currentIdentity = async (): Promise<Identity | null> => {
  const session = await auth();
  const user = session?.user;
  if (!user || user.isDemo) return null;
  if (user.workosUserId) return { workosUserId: user.workosUserId, oid: null };
  if (user.oid) return { workosUserId: null, oid: user.oid };
  return null;
};

/** WHERE clause matching an MSP account owned by this identity. */
const ownedBy = (id: Identity) =>
  id.workosUserId
    ? eq(mspAccounts.ownerWorkosUserId, id.workosUserId)
    : eq(mspAccounts.ownerOid, id.oid!);

/** WHERE clause matching memberships for this identity (used for OWNER checks). */
const membershipOf = (id: Identity) =>
  id.workosUserId
    ? eq(memberships.workosUserId, id.workosUserId)
    : eq(memberships.oid, id.oid!);

/**
 * The MSP account owned by the current signed-in user (matched by either
 * identity), or null. Demo / signed-out -> null.
 */
export const currentMspAccount = async (): Promise<
  typeof mspAccounts.$inferSelect | null
> => {
  const id = await currentIdentity();
  if (!id) return null;
  const [account] = await db
    .select()
    .from(mspAccounts)
    .where(ownedBy(id))
    .limit(1);
  return account ?? null;
};

export type CreateMspResult = ActionResult & { id?: string };

/**
 * Create the caller's MSP account. One account per owner: if one already exists
 * it is returned (idempotent), never duplicated. Requires a signed-in non-demo
 * user. The MSP event is signalled via notifyOps (no tenant ctx for audit()).
 */
export const createMspAccount = async (
  input: FormData | string,
): Promise<CreateMspResult> => {
  if (!mspEnabled()) return fail("MSP billing is not available");
  const id = await currentIdentity();
  if (!id) return fail("Sign in with your own account to create an MSP account");

  const raw =
    typeof input === "string" ? input : (input.get("name") ?? "");
  const name = typeof raw === "string" ? raw.trim() : "";
  if (name.length > 120) return fail("Name is too long");

  // One account per owner. A concurrent double-submit is collapsed below via the
  // re-read after onConflict; this fast path handles the common already-exists.
  const existing = await currentMspAccount();
  if (existing) return { ok: true, id: existing.id };

  const [created] = await db
    .insert(mspAccounts)
    .values({
      name: name === "" ? null : name,
      ownerWorkosUserId: id.workosUserId,
      ownerOid: id.oid,
    })
    // DB backstop for the one-account-per-owner invariant: a concurrent create
    // that loses the race hits the partial-unique owner index and returns no
    // row, falling through to the re-read below.
    .onConflictDoNothing()
    .returning({ id: mspAccounts.id });

  if (!created) {
    // Lost a race with a concurrent create: re-read the owner's account.
    const again = await currentMspAccount();
    if (again) return { ok: true, id: again.id };
    return fail("Could not create the MSP account");
  }

  void notifyOps(
    `msp account created: ${created.id} "${name || "(unnamed)"}" by ${id.workosUserId ?? id.oid}`,
  );
  revalidateApp();
  return { ok: true, id: created.id };
};

export type PortfolioWorkspace = {
  tenantId: string;
  name: string;
  /** Attached to the caller's MSP account. */
  attached: boolean;
  /** Purchased seats from the latest snapshot (0 when no sync yet). */
  seats: number;
  /** Whether a sync has ever produced a snapshot (distinguishes 0 from "no data"). */
  hasSync: boolean;
  currency: string;
  /** Lightweight QBR summary, present only for attached workspaces. */
  summary: {
    spendCents: number;
    wasteCents: number;
    openFindings: number;
  } | null;
};

/**
 * The caller's MSP portfolio: every workspace they OWN (an owner membership),
 * each annotated with whether it is attached to their MSP account, its
 * purchased seats, and — for attached ones — a spend/waste/open-findings
 * summary (latest snapshot + open/acknowledged finding count, the same metrics
 * the dashboard portfolio page surfaces). Empty when the caller has no MSP
 * account. Three set-based queries (tenants, snapshots, finding counts), no
 * per-workspace N+1.
 */
export const mspPortfolio = async (): Promise<PortfolioWorkspace[]> => {
  const account = await currentMspAccount();
  if (!account) return [];
  const id = (await currentIdentity())!;

  // Workspaces the caller owns: an OWNER membership. Demo workspaces are never
  // billable under an MSP account, so they are excluded from the portfolio.
  const owned = await db
    .select({ tenant: tenants })
    .from(memberships)
    .innerJoin(tenants, eq(memberships.tenantId, tenants.id))
    .where(
      and(
        membershipOf(id),
        eq(memberships.role, "owner"),
        eq(tenants.isDemo, false),
      ),
    );
  if (owned.length === 0) return [];

  const ids = owned.map((r) => r.tenant.id);
  const attachedIds = new Set(
    owned
      .filter((r) => r.tenant.mspAccountId === account.id)
      .map((r) => r.tenant.id),
  );

  // Summaries only for attached workspaces (the QBR numbers the table shows for
  // billed clients). Latest snapshot per tenant + open/acknowledged finding
  // counts, both set-based.
  const attachedList = [...attachedIds];
  const [snaps, findingCounts] =
    attachedList.length > 0
      ? await Promise.all([
          // Latest snapshot per attached tenant: distinct-on the most recent day.
          db
            .selectDistinctOn([snapshots.tenantId], {
              tenantId: snapshots.tenantId,
              spendCents: snapshots.totalMonthlySpendCents,
              wasteCents: snapshots.totalMonthlyWasteCents,
              purchasedSeats: snapshots.purchasedSeats,
            })
            .from(snapshots)
            .where(inArray(snapshots.tenantId, attachedList))
            .orderBy(snapshots.tenantId, desc(snapshots.day)),
          db
            .select({
              tenantId: findings.tenantId,
              n: sql<number>`count(*)::int`,
            })
            .from(findings)
            .where(
              and(
                inArray(findings.tenantId, attachedList),
                inArray(findings.status, ["open", "acknowledged"]),
              ),
            )
            .groupBy(findings.tenantId),
        ])
      : [[], []];

  const snapByTenant = new Map(snaps.map((s) => [s.tenantId, s]));
  const findingsByTenant = new Map(findingCounts.map((c) => [c.tenantId, c.n]));

  // Purchased seats for the full set (attached + unattached) from the latest
  // snapshot, so the attach guardrail and the table both read the same number
  // without an extra per-row query.
  const seatSnaps = await db
    .selectDistinctOn([snapshots.tenantId], {
      tenantId: snapshots.tenantId,
      purchasedSeats: snapshots.purchasedSeats,
    })
    .from(snapshots)
    .where(inArray(snapshots.tenantId, ids))
    .orderBy(snapshots.tenantId, desc(snapshots.day));
  const seatByTenant = new Map(
    seatSnaps.map((s) => [s.tenantId, s.purchasedSeats]),
  );

  return owned
    .map((r) => {
      const t = r.tenant;
      const attached = attachedIds.has(t.id);
      const hasSync = seatByTenant.has(t.id);
      const snap = snapByTenant.get(t.id);
      return {
        tenantId: t.id,
        name: workspaceLabel(t),
        attached,
        seats: seatByTenant.get(t.id) ?? 0,
        hasSync,
        currency: t.currency,
        summary:
          attached && snap
            ? {
                spendCents: snap.spendCents,
                wasteCents: snap.wasteCents,
                openFindings: findingsByTenant.get(t.id) ?? 0,
              }
            : attached
              ? { spendCents: 0, wasteCents: 0, openFindings: findingsByTenant.get(t.id) ?? 0 }
              : null,
      };
    })
    .sort((a, b) => (b.summary?.wasteCents ?? -1) - (a.summary?.wasteCents ?? -1));
};

/** Stripe statuses we treat as a tenant's own LIVE subscription to cancel on attach. */
const LIVE_TENANT_SUB: ReadonlySet<SubscriptionStatus> = new Set([
  "active",
  "trialing",
  "past_due",
]);

/**
 * Verify the caller owns the MSP account AND is an OWNER of the target tenant,
 * and that the tenant is not demo. Returns the loaded account + tenant on
 * success, or an ActionResult fail. Shared by attach/detach.
 */
const gateOwnerOfTenant = async (
  tenantId: string,
): Promise<
  | { ok: true; account: typeof mspAccounts.$inferSelect; tenant: typeof tenants.$inferSelect }
  | { ok: false; result: ActionResult }
> => {
  // Guard the whole attach/detach pathway when MSP billing is unconfigured: the
  // attach path cancels the tenant's own subscription, which must never run
  // without a working MSP subscription to move that billing onto.
  if (!mspEnabled()) {
    return { ok: false, result: fail("MSP billing is not available") };
  }
  const id = await currentIdentity();
  if (!id) return { ok: false, result: fail("Not allowed") };

  const account = await currentMspAccount();
  if (!account) return { ok: false, result: fail("You don't have an MSP account") };

  const [membership] = await db
    .select({ tenant: tenants })
    .from(memberships)
    .innerJoin(tenants, eq(memberships.tenantId, tenants.id))
    .where(
      and(
        membershipOf(id),
        eq(memberships.tenantId, tenantId),
        eq(memberships.role, "owner"),
      ),
    )
    .limit(1);
  if (!membership) {
    return { ok: false, result: fail("You must own this workspace") };
  }
  if (membership.tenant.isDemo) {
    return { ok: false, result: fail("The demo workspace cannot be attached") };
  }
  return { ok: true, account, tenant: membership.tenant };
};

/**
 * Attach a client workspace to the caller's MSP account.
 *
 * Gates: caller owns the MSP account AND is an OWNER membership of the tenant;
 * tenant not demo.
 *
 * Guardrail: a tenant whose latest sync reports more than MSP_LARGE_TENANT_SEATS
 * purchased seats is a rare enterprise outlier priced separately — refuse the
 * attach (the flat per-tenant MSP price would underprice it).
 *
 * Existing paid sub: if the tenant has its OWN active/trialing/past_due Stripe
 * subscription, cancel JUST that subscription (keep its Stripe customer — never
 * delete it) and clear the local subscriptions row + the cached
 * tenant.subscriptionStatus/paidUntil. The local stamp (mspAccountId, cleared
 * billing fields) happens only AFTER the Stripe cancel succeeds, inside one
 * transaction, so a Stripe failure leaves the tenant fully standalone (no
 * half-attached state) and the card keeps its own sub rather than being
 * silently double-state. Then sync the MSP quantity.
 */
export const attachWorkspace = async (
  tenantId: string,
): Promise<ActionResult> => {
  const gate = await gateOwnerOfTenant(tenantId);
  if (!gate.ok) return gate.result;
  const { account, tenant } = gate;

  if (tenant.mspAccountId === account.id) return ok(); // already attached
  if (tenant.mspAccountId) {
    return fail("This workspace is attached to another MSP account");
  }

  // Guardrail: large tenants are priced separately. hasSync gates this so a
  // never-synced tenant (no seat data) is not blocked on a phantom 0.
  const seats = await knownSeats(tenantId);
  if (seats.hasSync && seats.seats > MSP_LARGE_TENANT_SEATS) {
    return fail(
      `This tenant is over ${MSP_LARGE_TENANT_SEATS} seats; large tenants are priced separately - contact us.`,
    );
  }

  // Cancel the tenant's OWN live subscription FIRST (while the ids still live),
  // before any local mutation. A failed cancel is a billing-continuation risk:
  // abort with a clean error and leave the tenant fully standalone rather than
  // attach a workspace that is still being charged on its own card.
  const own = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.tenantId, tenantId),
    columns: { stripeSubscriptionId: true, status: true, stripeCustomerId: true },
  });
  if (own && LIVE_TENANT_SUB.has(own.status)) {
    // Defense against a corrupt local row: never cancel a subscription that
    // isn't bound to THIS tenant's Stripe customer (a mismatched id would mean
    // cancelling someone else's subscription). Refuse and alert instead.
    if (
      !tenant.stripeCustomerId ||
      own.stripeCustomerId !== tenant.stripeCustomerId
    ) {
      void notifyOps(
        `msp attach: subscription/customer mismatch for tenant ${tenantId} (sub cust ${own.stripeCustomerId}, tenant cust ${tenant.stripeCustomerId})`,
        { key: `msp-attach-mismatch:${tenantId}`, cooldownMs: 3_600_000 },
      );
      return fail(
        "This workspace's billing record looks inconsistent — it was NOT attached. Please contact support.",
      );
    }
    try {
      // Keep the customer; cancel only the subscription.
      await stripe().subscriptions.cancel(own.stripeSubscriptionId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`msp attach: cancel failed for tenant ${tenantId}: ${msg}`);
      void notifyOps(
        `msp attach: tenant subscription cancel failed for ${tenantId}: ${msg}`,
        { key: `msp-attach-cancel:${tenantId}`, cooldownMs: 3_600_000 },
      );
      return fail(
        "We couldn't cancel this workspace's existing subscription right now — it was NOT attached. Please try again in a minute.",
      );
    }
  }

  // Local stamp only after the cancel succeeded: clear the tenant's billing
  // fields + subscriptions row and bind it to the MSP account, atomically.
  await db.transaction(async (tx) => {
    if (own) {
      await tx
        .delete(subscriptions)
        .where(eq(subscriptions.tenantId, tenantId));
    }
    await tx
      .update(tenants)
      .set({
        mspAccountId: account.id,
        subscriptionStatus: null,
        paidUntil: null,
      })
      .where(eq(tenants.id, tenantId));
  });

  await syncMspQuantity(account);
  void notifyOps(
    `msp workspace attached: tenant ${tenantId} -> account ${account.id}`,
  );
  revalidateApp();
  return ok();
};

/**
 * Detach a client workspace from the caller's MSP account. Gates as attach. The
 * tenant reverts to its own standalone entitlement (mspAccountId cleared; it has
 * no Stripe sub of its own anymore, so entitlementOf falls back to trial/expired
 * exactly as a fresh workspace would). Syncs the MSP quantity down.
 */
export const detachWorkspace = async (
  tenantId: string,
): Promise<ActionResult> => {
  const gate = await gateOwnerOfTenant(tenantId);
  if (!gate.ok) return gate.result;
  const { account, tenant } = gate;

  if (tenant.mspAccountId !== account.id) {
    return fail("This workspace is not attached to your MSP account");
  }

  await db
    .update(tenants)
    .set({ mspAccountId: null })
    .where(eq(tenants.id, tenantId));

  await syncMspQuantity(account);
  void notifyOps(
    `msp workspace detached: tenant ${tenantId} from account ${account.id}`,
  );
  revalidateApp();
  return ok();
};

/**
 * Reconcile the MSP quantity subscription to the count of attached tenants.
 * Counts tenants where mspAccountId === account.id, updates the local
 * mspAccounts.quantity to that count, and — when the account has a live Stripe
 * subscription — updates its single subscription item quantity to
 * max(count, 1) (a quantity of 0 is rejected by Stripe; the local count stays
 * the true value). Default proration. When no Stripe sub exists yet (not checked
 * out), only the local quantity is updated. A Stripe failure is reported (clean
 * error + notifyOps) and does NOT roll back the local count (the webhook /
 * reconcile path heals the cached fields; the count is the source of truth for
 * the next checkout).
 */
export const syncMspQuantity = async (
  account: typeof mspAccounts.$inferSelect,
): Promise<ActionResult> => {
  const [counted] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(tenants)
    .where(eq(tenants.mspAccountId, account.id));
  const count = counted?.n ?? 0;

  // Local quantity always tracks the true attached count, even pre-checkout.
  await db
    .update(mspAccounts)
    .set({ quantity: count })
    .where(eq(mspAccounts.id, account.id));

  // Re-read the account: the passed-in snapshot may predate a concurrent
  // checkout webhook that just set stripeSubscriptionId, so resolve it fresh
  // before deciding whether there's a live Stripe sub to update.
  const fresh = await db.query.mspAccounts.findFirst({
    where: eq(mspAccounts.id, account.id),
    columns: { stripeSubscriptionId: true },
  });
  if (!fresh?.stripeSubscriptionId) return ok();

  try {
    const sub = await stripe().subscriptions.retrieve(
      fresh.stripeSubscriptionId,
    );
    const item = sub.items.data[0];
    if (!item) {
      void notifyOps(
        `msp quantity sync: subscription ${fresh.stripeSubscriptionId} has no items (account ${account.id})`,
        { key: `msp-qty-noitem:${account.id}`, cooldownMs: 3_600_000 },
      );
      return fail("Could not update the MSP subscription quantity");
    }
    await stripe().subscriptions.update(fresh.stripeSubscriptionId, {
      items: [{ id: item.id, quantity: Math.max(count, 1) }],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`msp quantity sync failed for account ${account.id}: ${msg}`);
    void notifyOps(
      `msp quantity sync failed for account ${account.id}: ${msg}`,
      { key: `msp-qty-sync:${account.id}`, cooldownMs: 3_600_000 },
    );
    return fail(
      "We updated your portfolio, but couldn't sync the billing quantity to Stripe right now. It will reconcile shortly.",
    );
  }

  return ok();
};
