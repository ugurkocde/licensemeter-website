import { and, eq, isNull, lt } from "drizzle-orm";
import { redirect } from "next/navigation";
import { after, type NextRequest } from "next/server";

import { db } from "~/server/db";
import { consentStates, memberships, tenants } from "~/server/db/schema";
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

  await db
    .update(consentStates)
    .set({ usedAt: new Date() })
    .where(eq(consentStates.state, state!));

  // Upsert the tenant and bind the initiator as owner.
  const existing = await db.query.tenants.findFirst({
    where: eq(tenants.tid, grantedTid!),
  });
  const tenantId =
    existing?.id ??
    (
      await db
        .insert(tenants)
        // trialStartedAt is written once here and deliberately NOT on the
        // reconnect UPDATE below, so re-running admin consent cannot reset the
        // 14-day trial clock.
        .values({
          tid: grantedTid!,
          consentedAt: new Date(),
          trialStartedAt: new Date(),
        })
        .returning({ id: tenants.id })
    )[0]!.id;
  if (existing) {
    await db
      .update(tenants)
      .set({ consentedAt: new Date() })
      .where(eq(tenants.id, tenantId));
  }

  await db
    .insert(memberships)
    .values({
      tenantId,
      oid: stateRow!.oid,
      email: stateRow!.email,
      name: stateRow!.name,
      role: "owner",
    })
    .onConflictDoUpdate({
      target: [memberships.tenantId, memberships.email],
      set: { oid: stateRow!.oid, role: "owner" },
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
