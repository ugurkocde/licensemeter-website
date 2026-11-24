import { eq } from "drizzle-orm";

import type { Db } from "~/server/db";
import { tenants } from "~/server/db/schema";

/** Serialize sync registration, stored-data analysis, and maintenance by tenant. */
export async function lockTenant(tx: Db, tenantId: string, skipLocked = false) {
  const [tenant] = await tx
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .for("no key update", skipLocked ? { skipLocked: true } : undefined);
  return Boolean(tenant);
}
