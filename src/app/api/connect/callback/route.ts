import { and, eq, isNull, lt } from "drizzle-orm";
import { redirect } from "next/navigation";
import { after, type NextRequest } from "next/server";

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

  // Upsert the tenant, record the managed connection, and bind the initiator as
  // owner in ONE transaction: a partial write could leave a consented tenant
  // with no connection row or no owner membership. trialStartedAt is written
  // once on insert and deliberately NOT on the reconnect UPDATE, so re-running
  // admin consent cannot reset the 14-day trial clock.
  const isWorkos = !!stateRow!.workosUserId;
  let tenantId!: string;
  await db.transaction(async (tx) => {
    const existing = await tx.query.tenants.findFirst({
      where: eq(tenants.tid, grantedTid!),
    });
    let id: string;
    if (existing) {
      id = existing.id;
      await tx
        .update(tenants)
        .set({ consentedAt: new Date() })
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

    // Record the Microsoft connection as a managed connector (mode='managed').
    // Idempotent on reconnect; switching a BYO workspace back to managed clears
    // the per-workspace credential columns so the sync uses the central env app.
    await tx
      .insert(msConnections)
      .values({ tenantId: id, mode: "managed", tid: grantedTid! })
      .onConflictDoUpdate({
        target: msConnections.tenantId,
        set: {
          mode: "managed",
          tid: grantedTid!,
          appClientId: null,
          credType: null,
          secretEnc: null,
          certThumbprint: null,
          secretExpiresAt: null,
          lastVerifiedAt: new Date(),
          lastVerifyError: null,
        },
      });

    // Bind the initiator as owner using whichever identity the nonce carries:
    // workosUserId for WorkOS sign-ins, oid for entra. Only the matching column
    // is updated on conflict, so re-consent never clobbers the other provider's id.
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
        set: isWorkos
          ? { workosUserId: stateRow!.workosUserId, role: "owner" }
          : { oid: stateRow!.oid, role: "owner" },
      });

    tenantId = id;
  });

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
