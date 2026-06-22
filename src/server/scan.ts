import { and, eq } from "drizzle-orm";

import { db } from "~/server/db";
import { memberships, tenants } from "~/server/db/schema";
import { DelegatedGraphClient } from "~/server/graph/msGraph";
import { runSync } from "~/server/sync/runSync";

/**
 * Delegated instant scan: a signed-in admin runs the regular sync pipeline
 * once with their OWN delegated Graph token instead of the connector's
 * standing application permissions. The workspace it produces is a trial
 * workspace (tenants.consentedAt stays null) exactly like the CSV trial:
 * when the tenant later completes real admin consent, the first app-only
 * sync's upsert-and-prune storage replaces the scan data automatically.
 */

/** Guard-matrix outcomes; error codes map to ERROR_TEXT on /app/connect. */
export type ScanTenantResult =
  | { ok: true; tenantId: string }
  | {
      ok: false;
      error:
        | "scan_demo"
        | "scan_already_synced"
        | "scan_already_synced_invite"
        | "scan_trial_invite"
        | "scan_trial_role";
    };

/**
 * The Microsoft identity the scan token proves (from the delegated id_token's
 * claims) and the LicenseMeter actor to bind as owner. The actor is the WorkOS
 * user (workos sign-in) or the Entra object id (entra opt-out) — decoupled from
 * the Microsoft tenant being scanned, since under WorkOS the person signs in
 * with any method and only proves Microsoft access here.
 */
export type ScanIdentity = {
  ms: { tid: string; upn: string; name?: string | null; email?: string | null };
  actor: { workosUserId?: string; oid?: string };
  isDemo: boolean;
};

/**
 * Resolves (or creates) the workspace an instant scan may write to. Same
 * matrix as the CSV trial (connect/csv/actions.ts): demo never; a consented
 * tenant already syncs nightly; an existing trial workspace is only
 * re-scannable by its admins and owners; otherwise a fresh trial tenant is
 * created with the caller as owner, conflict-safe against a colleague racing.
 */
export const resolveScanTenant = async (
  identity: ScanIdentity,
): Promise<ScanTenantResult> => {
  if (identity.isDemo) return { ok: false, error: "scan_demo" };
  const { ms, actor } = identity;
  const tid = ms.tid;

  // The actor owns the membership by whichever identity the session carries.
  const matchActor = actor.workosUserId
    ? eq(memberships.workosUserId, actor.workosUserId)
    : eq(memberships.oid, actor.oid!);

  const existing = await db.query.tenants.findFirst({
    where: eq(tenants.tid, tid),
  });

  if (existing) {
    if (existing.isDemo) return { ok: false, error: "scan_demo" };
    const membership = await db.query.memberships.findFirst({
      where: and(eq(memberships.tenantId, existing.id), matchActor),
    });
    if (existing.consentedAt) {
      return {
        ok: false,
        error: membership ? "scan_already_synced" : "scan_already_synced_invite",
      };
    }
    if (!membership) return { ok: false, error: "scan_trial_invite" };
    // Replacing the stored data is destructive, so viewers may not re-scan.
    if (membership.role !== "owner" && membership.role !== "admin") {
      return { ok: false, error: "scan_trial_role" };
    }
    // Trial workspace admin/owner: re-scan allowed. The sync's
    // upsert-and-prune storage replaces the previous scan or CSV upload
    // exactly.
    return { ok: true, tenantId: existing.id };
  }

  // The tenant and its owner membership are created together: a crash between
  // them would leave a tid-bound workspace with no member, which the guard
  // matrix above would then reject as "ask for an invite" — locking the creator
  // out of their own workspace. onConflictDoNothing: two colleagues scanning at
  // the same moment race on the tid unique index; the loser gets a message.
  return db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(tenants)
      .values({
        tid,
        // Placeholder until the scan reads the real name from /organization.
        name: ms.upn.split("@")[1] ?? null,
        consentedAt: null,
        // Trial clock starts the moment the workspace is created.
        trialStartedAt: new Date(),
        concealedNames: false,
        hasP1: false,
        activitySignal: "none",
        copilotSignal: "none",
      })
      .onConflictDoNothing()
      .returning({ id: tenants.id });
    if (!inserted) return { ok: false, error: "scan_trial_invite" } as const;

    await tx
      .insert(memberships)
      .values({
        tenantId: inserted.id,
        oid: actor.oid ?? null,
        workosUserId: actor.workosUserId ?? null,
        email: ms.email ?? ms.upn,
        name: ms.name ?? null,
        role: "owner",
      })
      .onConflictDoUpdate({
        target: [memberships.tenantId, memberships.email],
        set: actor.workosUserId
          ? { workosUserId: actor.workosUserId, role: "owner" }
          : { oid: actor.oid, role: "owner" },
      });

    return { ok: true, tenantId: inserted.id } as const;
  });
};

/**
 * Runs the one-shot scan: the full sync pipeline (steps, syncRuns rows,
 * snapshot, findings diff) over a DelegatedGraphClient bound to the user's
 * access token. The token lives only in this call's memory. Nothing is
 * persisted, so there is no re-run without the admin coming back.
 */
export const runDelegatedScan = async (
  tenantId: string,
  accessToken: string,
): Promise<void> => {
  await runSync(tenantId, { client: new DelegatedGraphClient(accessToken) });
};
