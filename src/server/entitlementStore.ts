import { and, eq, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { billingEnabled } from "~/env";
import { db } from "~/server/db";
import { entitlements, tenants, type TenantRow } from "~/server/db/schema";
import { entitlementOf, type Entitlement } from "~/server/entitlement";

/**
 * Whether a workspace is among the first `quantity` workspaces of its MSP
 * account, ordered by createdAt then id. Counts the workspaces ahead of it in
 * SQL, against the stored row, so the ordering never depends on the millisecond
 * precision of a JS Date.
 */
const coveredByMsp = async (
  tenantId: string,
  mspAccountId: string,
  quantity: number,
): Promise<boolean> => {
  const self = alias(tenants, "self");
  const position = db
    .select({ createdAt: self.createdAt, id: self.id })
    .from(self)
    .where(eq(self.id, tenantId));
  const [row] = await db
    .select({ ahead: sql<number>`count(*)::int` })
    .from(tenants)
    .where(
      and(
        eq(tenants.mspAccountId, mspAccountId),
        sql`(${tenants.createdAt}, ${tenants.id}) < (${position})`,
      ),
    );
  return (row?.ahead ?? 0) < quantity;
};

/**
 * Loads what a workspace may use. The workspace's own row wins when it grants a
 * paid plan; otherwise the workspace inherits the row of its MSP account, as
 * long as it is within the covered quantity. Self-hosted installs and the demo
 * workspace never reach the database.
 */
export async function loadEntitlement(
  tenant: TenantRow,
  now: Date = new Date(),
): Promise<Entitlement> {
  const enabled = billingEnabled();
  const resolve = (
    record: Parameters<typeof entitlementOf>[0]["record"],
    covered = true,
  ) => entitlementOf({ tenant, record, covered, billingEnabled: enabled, now });

  if (!enabled || tenant.isDemo) return resolve(null);

  const { mspAccountId } = tenant;
  const rows = await db
    .select()
    .from(entitlements)
    .where(
      mspAccountId
        ? or(
            eq(entitlements.tenantId, tenant.id),
            eq(entitlements.mspAccountId, mspAccountId),
          )
        : eq(entitlements.tenantId, tenant.id),
    );

  const own = resolve(rows.find((r) => r.tenantId === tenant.id) ?? null);
  if (own.plan !== "free") return own;

  const mspRow = mspAccountId
    ? rows.find((r) => r.mspAccountId === mspAccountId)
    : undefined;
  if (!mspRow || !mspAccountId) return own;

  // Only count workspaces when the MSP row grants something right now.
  const inherited = resolve(mspRow);
  if (inherited.plan === "free") return inherited;
  return (await coveredByMsp(tenant.id, mspAccountId, mspRow.quantity))
    ? inherited
    : resolve(mspRow, false);
}
