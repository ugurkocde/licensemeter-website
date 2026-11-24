import { eq, sql } from "drizzle-orm";

import type { Db } from "~/server/db";
import { tenants } from "~/server/db/schema";
import { sqlState } from "~/server/db/sqlState";

export class WorkspaceUpdateInProgressError extends Error {
  constructor(cause: unknown) {
    super("Wait for the current workspace update to finish, then retry", {
      cause,
    });
  }
}

/** Serialize sync registration, stored-data analysis, and maintenance by tenant. */
export async function lockTenant(tx: Db, tenantId: string, skipLocked = false) {
  const [tenant] = await tx
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .for("no key update", skipLocked ? { skipLocked: true } : undefined);
  return Boolean(tenant);
}

export async function lockTenantForWorkspaceUpdate(tx: Db, tenantId: string) {
  await tx.execute(sql`set local lock_timeout = '5s'`);
  const locked = await lockTenant(tx, tenantId).catch((error: unknown) => {
    if (sqlState(error) === "55P03")
      throw new WorkspaceUpdateInProgressError(error);
    throw error;
  });
  if (!locked) throw new Error(`Unknown tenant ${tenantId}`);
  await tx.execute(sql`set local lock_timeout = '0'`);
}
