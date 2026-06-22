import { and, eq, isNull, lt, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { after, type NextRequest } from "next/server";

import {
  apiAccess,
  WORKSPACE_COOKIE,
  workspaceCookieOptions,
} from "~/server/access";
import { db } from "~/server/db";
import {
  consentStates,
  memberships,
  msConnections,
  tenants,
} from "~/server/db/schema";
import { notifyOps } from "~/server/ops";
import { runSync } from "~/server/sync/runSync";

// The first sync after admin consent runs in after() below and shares this
// route's budget, so give it the same 300s every other sync path has.
export const maxDuration = 300;

const STATE_TTL_MS = 15 * 60 * 1000;

const fail = (code: string): never => redirect(`/app/connect?error=${code}`);

/**
 * Admin-consent return leg. Validates the state nonce, requires the granted
 * tenant to be the initiator's own sign-in tenant (one workspace per tenant),
 * binds the initiator as workspace owner, and starts the first sync.
 */
export const GET = async (req: NextRequest) => {
  const params = req.nextUrl.searchParams;
  const state = params.get("state");
  const grantedTid = params.get("tenant");
  const adminConsent = params.get("admin_consent");
  const error = params.get("error");

  if (!state) fail("missing_state");

  // Single-use, time-limited state row bound to the initiating user.
  const stateRow = await db.query.consentStates.findFirst({
    where: and(eq(consentStates.state, state!), isNull(consentStates.usedAt)),
  });
  if (!stateRow) fail("invalid_state");
  if (Date.now() - stateRow!.createdAt.getTime() > STATE_TTL_MS) {
    fail("expired_state");
  }

  // Opportunistic cleanup of stale nonces.
  after(async () => {
    await db
      .delete(consentStates)
      .where(lt(consentStates.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000)));
  });

  // Validate the consent result BEFORE consuming the nonce, so a declined or
  // incomplete dialog does not burn the state and the user can simply retry.
  // The granted tenant may differ from the initiator's home tenant (MSP /
  // consultant flow): the customer's Global Admin completing the Microsoft
  // dialog IS the authorization; the initiator becomes the workspace owner.
  if (error) fail("consent_declined");
  if (adminConsent !== "True" || !grantedTid) fail("consent_incomplete");

  // Atomically consume the single-use nonce: a concurrent duplicate callback
  // (double-submit / proxy retry) loses the race here instead of both binding
  // ownership and starting two first syncs. Declined/expired consent returned
  // above, so a retriable failure never burns the nonce.
  const consumed = await db
    .update(consentStates)
    .set({ usedAt: new Date() })
    .where(and(eq(consentStates.state, state!), isNull(consentStates.usedAt)))
    .returning({ state: consentStates.state });
  if (consumed.length === 0) fail("invalid_state");

  // Managed connector reset applied on every (re)connect: clears any BYO
  // credential columns so the sync uses the central env app.
  const managedConnection = {
    mode: "managed" as const,
    tid: grantedTid!,
    appClientId: null,
    credType: null,
    secretEnc: null,
    certThumbprint: null,
    secretExpiresAt: null,
    lastVerifiedAt: new Date(),
    lastVerifyError: null,
  };

  const isWorkos = !!stateRow!.workosUserId;
  let tenantId: string;

  if (isWorkos) {
    // Workspace-first model: the user already has a workspace (auto-provisioned
    // on sign-in). Microsoft attaches to THAT workspace as a connector instead
    // of spawning a duplicate. The initiator must be an admin/owner of it.
    const ctx = await apiAccess("admin");
    if (!ctx) return fail("not_allowed");
    if (ctx.membership.workosUserId !== stateRow!.workosUserId) {
      return fail("not_allowed");
    }
    const target = ctx.tenant;
    // One workspace per Microsoft tenant: refuse to steal a tid bound elsewhere.
    const owner = await db.query.tenants.findFirst({
      where: eq(tenants.tid, grantedTid!),
    });
    if (owner && owner.id !== target.id) return fail("tenant_taken");
    // Refuse to silently repoint a workspace already bound to another tenant.
    if (target.tid && target.tid !== grantedTid) return fail("already_connected");

    await db.transaction(async (tx) => {
      await tx
        .update(tenants)
        .set({
          tid: grantedTid!,
          consentedAt: new Date(),
          // Trial starts on first connect; coalesce never resets it on reconnect.
          trialStartedAt: sql`coalesce(${tenants.trialStartedAt}, now())`,
        })
        .where(eq(tenants.id, target.id));
      await tx
        .insert(msConnections)
        .values({ tenantId: target.id, ...managedConnection })
        .onConflictDoUpdate({
          target: msConnections.tenantId,
          set: managedConnection,
        });
    });
    tenantId = target.id;
  } else {
    // Entra mode: the login IS the Microsoft tenant, so the workspace is keyed
    // by the granted tid (created on first consent) and the initiator is bound
    // as its owner — all in one transaction so a partial write can't leave a
    // consented tenant with no connection or owner. trialStartedAt is written
    // once on insert and never on the reconnect update.
    tenantId = await db.transaction(async (tx) => {
      const existing = await tx.query.tenants.findFirst({
        where: eq(tenants.tid, grantedTid!),
      });
      let id: string;
      if (existing) {
        id = existing.id;
        await tx
          .update(tenants)
          .set({
            consentedAt: new Date(),
            trialStartedAt: sql`coalesce(${tenants.trialStartedAt}, now())`,
          })
          .where(eq(tenants.id, id));
      } else {
        const [inserted] = await tx
          .insert(tenants)
          .values({
            tid: grantedTid!,
            consentedAt: new Date(),
            trialStartedAt: new Date(),
          })
          .returning({ id: tenants.id });
        id = inserted!.id;
      }
      await tx
        .insert(msConnections)
        .values({ tenantId: id, ...managedConnection })
        .onConflictDoUpdate({
          target: msConnections.tenantId,
          set: managedConnection,
        });
      await tx
        .insert(memberships)
        .values({
          tenantId: id,
          oid: stateRow!.oid,
          workosUserId: stateRow!.workosUserId,
          email: stateRow!.email,
          name: stateRow!.name,
          role: "owner",
        })
        .onConflictDoUpdate({
          target: [memberships.tenantId, memberships.email],
          set: { oid: stateRow!.oid, role: "owner" },
        });
      return id;
    });
  }

  // Make the connected workspace active so the user lands on it, not the empty
  // one they may have started from.
  (await cookies()).set(WORKSPACE_COOKIE, tenantId, workspaceCookieOptions());

  // The single most important founder signal there is.
  void notifyOps(
    `tenant connected: ${grantedTid} by ${stateRow!.email}, first sync starting`,
  );

  // First sync runs after the redirect is sent; the connect page polls status.
  after(async () => {
    await runSync(tenantId);
  });

  redirect("/app/connect?status=syncing");
};
