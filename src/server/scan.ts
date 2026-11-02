import { and, asc, eq, isNull, ne, notExists, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "~/server/db";
import { isUniqueViolation } from "~/server/db/errors";
import {
  memberships,
  tenants,
  tenantSkus,
  tenantUsers,
} from "~/server/db/schema";
import { DelegatedGraphClient } from "~/server/graph/msGraph";
import { runSync } from "~/server/sync/runSync";

/**
 * Delegated instant scan: a signed-in admin runs the regular sync pipeline
 * once with their OWN delegated Graph token instead of the connector's
 * standing application permissions. The workspace it produces is an imported
 * workspace (tenants.consentedAt stays null) exactly like the CSV import:
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
        | "scan_workspace_invite"
        | "scan_workspace_role";
    };

/**
 * The Microsoft identity the scan token proves (from the delegated id_token's
 * claims) and the LicenseMeter actor to bind as owner: the Entra object id of
 * the session, which the callback has matched against the scan token.
 */
export type ScanIdentity = {
  ms: { tid: string; upn: string; name?: string | null; email?: string | null };
  actor: { oid: string };
  isDemo: boolean;
};

/**
 * Resolves (or creates) the workspace an instant scan may write to. Same
 * matrix as the CSV import (connect/csv/actions.ts): demo never; a consented
 * tenant already syncs nightly; an existing imported workspace is only
 * re-scannable by its admins and owners; otherwise the caller's own empty
 * sign-in workspace is bound to the tenant, and only a caller without one gets
 * a fresh imported tenant with them as owner, conflict-safe against a
 * colleague racing.
 */
export const resolveScanTenant = async (
  identity: ScanIdentity,
): Promise<ScanTenantResult> => {
  if (identity.isDemo) return { ok: false, error: "scan_demo" };
  const { ms, actor } = identity;
  const tid = ms.tid;

  const matchActor = eq(memberships.oid, actor.oid);

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
        error: membership
          ? "scan_already_synced"
          : "scan_already_synced_invite",
      };
    }
    if (!membership) return { ok: false, error: "scan_workspace_invite" };
    // Replacing the stored data is destructive, so viewers may not re-scan.
    if (membership.role !== "owner" && membership.role !== "admin") {
      return { ok: false, error: "scan_workspace_role" };
    }
    // Imported workspace admin/owner: re-scan allowed. The sync's
    // upsert-and-prune storage replaces the previous scan or CSV upload
    // exactly.
    return { ok: true, tenantId: existing.id };
  }

  // Workspace-first, like the consent flow and the CSV import: sign-in already
  // gave the caller a workspace, so the scan fills that one instead of
  // creating a duplicate next to it and leaving it empty.
  const own = await bindOwnEmptyWorkspace(tid, actor.oid, ms.upn);
  if (own) return own;

  // The tenant and its owner membership are created together: a crash between
  // them would leave a tid-bound workspace with no member, which the guard
  // matrix above would then reject as "ask for an invite", locking the creator
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

        concealedNames: false,
        hasP1: false,
        activitySignal: "none",
        copilotSignal: "none",
      })
      .onConflictDoNothing()
      .returning({ id: tenants.id });
    if (!inserted)
      return { ok: false, error: "scan_workspace_invite" } as const;

    await tx
      .insert(memberships)
      .values({
        tenantId: inserted.id,
        oid: actor.oid,
        email: ms.email ?? ms.upn,
        name: ms.name ?? null,
        role: "owner",
      })
      .onConflictDoUpdate({
        target: [memberships.tenantId, memberships.email],
        set: { oid: actor.oid, role: "owner" },
      });

    return { ok: true, tenantId: inserted.id } as const;
  });
};

/**
 * Binds the caller's own empty workspace to the scanned tenant: one they own
 * as its only member (no colleague, invitee or pending invite would suddenly
 * see the caller's tenant), not yet tied to any Microsoft tenant, never
 * consented, not the demo, not an MSP client workspace, and holding no user or
 * SKU rows (a CSV import may describe another organization, so imported data
 * is never overwritten by the caller's home tenant). The oldest such
 * workspace wins, like the CSV import. Returns null when there is none, so the
 * caller creates a fresh workspace.
 */
const otherMembers = alias(memberships, "other_members");

const bindOwnEmptyWorkspace = async (
  tid: string,
  oid: string,
  upn: string,
): Promise<ScanTenantResult | null> => {
  const empty = and(
    isNull(tenants.tid),
    isNull(tenants.consentedAt),
    eq(tenants.isDemo, false),
    isNull(tenants.mspAccountId),
    notExists(
      db
        .select({ one: sql`1` })
        .from(otherMembers)
        .where(
          and(
            eq(otherMembers.tenantId, tenants.id),
            or(isNull(otherMembers.oid), ne(otherMembers.oid, oid)),
          ),
        ),
    ),
    notExists(
      db
        .select({ one: sql`1` })
        .from(tenantUsers)
        .where(eq(tenantUsers.tenantId, tenants.id)),
    ),
    notExists(
      db
        .select({ one: sql`1` })
        .from(tenantSkus)
        .where(eq(tenantSkus.tenantId, tenants.id)),
    ),
  );
  const candidate = (
    await db
      .select({ id: tenants.id })
      .from(memberships)
      .innerJoin(tenants, eq(memberships.tenantId, tenants.id))
      .where(
        and(eq(memberships.oid, oid), eq(memberships.role, "owner"), empty),
      )
      .orderBy(asc(tenants.createdAt), asc(tenants.id))
      .limit(1)
  )[0];
  if (!candidate) return null;

  try {
    // The guards are repeated in the update, so a workspace that changed since
    // the read (connected, imported into) is never bound.
    const [bound] = await db
      .update(tenants)
      .set({
        tid,
        // Same placeholder as a fresh scan workspace when sign-in left no name;
        // the scan replaces it with the name from /organization.
        name: sql`coalesce(${tenants.name}, ${upn.split("@")[1] ?? null})`,
        concealedNames: false,
        hasP1: false,
        activitySignal: "none",
        copilotSignal: "none",
      })
      .where(and(eq(tenants.id, candidate.id), empty))
      .returning({ id: tenants.id });
    return bound ? { ok: true, tenantId: bound.id } : null;
  } catch (err) {
    // A colleague bound the tenant to their workspace between our lookup and
    // this update: same answer as losing the insert race below.
    if (isUniqueViolation(err)) {
      return { ok: false, error: "scan_workspace_invite" };
    }
    throw err;
  }
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
  deadline?: number,
): Promise<void> => {
  await runSync(tenantId, {
    client: new DelegatedGraphClient(accessToken, deadline),
    deadline,
  });
};
