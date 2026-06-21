import { and, eq } from "drizzle-orm";

import type { SessionUser } from "~/server/auth";
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
 * Resolves (or creates) the workspace an instant scan may write to. Same
 * matrix as the CSV trial (connect/csv/actions.ts): demo never; a consented
 * tenant already syncs nightly; an existing trial workspace is only
 * re-scannable by its admins and owners; otherwise a fresh trial tenant is
 * created with the caller as owner, conflict-safe against a colleague racing.
 */
export const resolveScanTenant = async (
  user: SessionUser,
): Promise<ScanTenantResult> => {
  if (user.isDemo) return { ok: false, error: "scan_demo" };
  const { oid, tid, upn, name, email } = user;

  const existing = await db.query.tenants.findFirst({
    where: eq(tenants.tid, tid),
  });

  if (existing) {
    if (existing.isDemo) return { ok: false, error: "scan_demo" };
    const membership = await db.query.memberships.findFirst({
      where: and(
        eq(memberships.tenantId, existing.id),
        eq(memberships.oid, oid),
      ),
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

  // onConflictDoNothing: two colleagues scanning at the same moment race on
  // the tid unique index: the loser gets a message, not a 500.
  const [inserted] = await db
    .insert(tenants)
    .values({
      tid,
      // Placeholder until the scan reads the real name from /organization.
      name: upn.split("@")[1] ?? null,
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
  if (!inserted) return { ok: false, error: "scan_trial_invite" };

  await db
    .insert(memberships)
    .values({
      tenantId: inserted.id,
      oid,
      email: email ?? upn,
      name: name || null,
      role: "owner",
    })
    .onConflictDoUpdate({
      target: [memberships.tenantId, memberships.email],
      set: { oid, role: "owner" },
    });

  return { ok: true, tenantId: inserted.id };
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
