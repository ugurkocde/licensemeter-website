import { AsyncLocalStorage } from "node:async_hooks";
import { sql } from "drizzle-orm";

import { env } from "~/env";
import type { Db } from "./index";

/**
 * Request-scoped tenant context for database-level isolation.
 *
 * Tenant isolation today is application-level: every query filters by
 * tenant_id, against a runtime role that can read every row. This module adds
 * the foundation for the stronger guarantee: a Postgres session setting
 * (`app.tenant_id`) that Row Level Security policies can enforce, set on a
 * transaction and routed to by the exported `db`.
 *
 * Rollout: `withTenant(tenantId, fn)` is opt-in per entry point. A query only
 * gets the tenant setting when its caller wrapped it. The tenant RLS policies
 * in `scripts/db-tenant-rls.sql` are applied only once every tenant-table
 * access is wrapped, because an unset setting denies all rows for that role.
 */

const storage = new AsyncLocalStorage<Db>();

/** The tenant-scoped session for the current async context, if any. */
export const tenantSession = (): Db | undefined => storage.getStore();

/**
 * Runs `fn` pinned to a tenant: sets `app.tenant_id` on the transaction's
 * connection and routes `db` to it for the duration, so queries inside run
 * under RLS as that tenant. A null/undefined tenant runs `fn` unwrapped (for
 * global work: sign-in resolution before a workspace is chosen, cron fan-out).
 */
export const withTenant = async <T>(
  base: Db,
  tenantId: string | null | undefined,
  fn: () => Promise<T>,
): Promise<T> => {
  if (!tenantId) return fn();
  return base.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.tenant_id', ${tenantId}, true)`,
    );
    // Enforcement is opt-in: the app keeps its own role until TENANT_DB_ROLE
    // is configured (and scripts/db-tenant-rls.sql applied). The role name is
    // schema-validated as a bare identifier.
    const role = env.TENANT_DB_ROLE;
    if (role) {
      await tx.execute(sql.raw(`set local role "${role}"`));
    }
    return storage.run(tx, fn);
  });
};

/**
 * Wraps a drizzle instance so every query follows the active tenant context.
 * Outside `withTenant` it behaves exactly like the base instance (the proxy
 * has no session to route to), so wiring it in cannot change existing
 * behavior until a caller opts in.
 */
export const createTenantDb = <T extends object>(base: T): T =>
  new Proxy(base, {
    get(target, prop) {
      const session: object = storage.getStore() ?? target;
      const value: unknown = Reflect.get(session, prop);
      return typeof value === "function"
        ? (value as (...args: unknown[]) => unknown).bind(session)
        : value;
    },
  });
