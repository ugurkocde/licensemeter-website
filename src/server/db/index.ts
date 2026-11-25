import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import { PGlite } from "@electric-sql/pglite";

import { env } from "~/env";
import * as schema from "./schema";
import { enforceDatabaseTls, resolvePostgresSsl } from "./ssl";
import { createTenantDb } from "./tenant";

export type Db = PostgresJsDatabase<typeof schema>;

/**
 * Real Postgres when DATABASE_URL is set; embedded PGlite otherwise (dev/demo).
 * Both drivers expose the same Drizzle query API for everything this app uses,
 * so the PGlite instance is intentionally typed as the postgres-js database.
 */
const createDb = (): Db => {
  if (env.DATABASE_URL) {
    // Hosted production refuses a plaintext connection: the URL's TLS setting
    // is validated (a weak, empty, unknown or repeated one fails at startup)
    // and passed as the explicit ssl option, which overrides the URL. Outside
    // hosted production the key is omitted, not set to undefined, so the URL
    // keeps deciding.
    const ssl = resolvePostgresSsl(env.DATABASE_URL, {
      enforce: enforceDatabaseTls(env.NODE_ENV, env.SELF_HOSTED),
    });
    const client = postgres(env.DATABASE_URL, {
      // Hosted production uses the Supabase session pooler (port 5432), not
      // the transaction pooler: postgres.js pipelines queries once every
      // connection is busy, which Supavisor transaction mode does not support
      // (hung queries or mismatched rows). Keep max small so concurrent
      // instances stay inside the pooler's pool size.
      prepare: false,
      max: 3,
      idle_timeout: 20,
      connect_timeout: 10,
      ...(ssl ? { ssl } : {}),
    });
    return drizzlePostgres(client, { schema });
  }
  // The embedded database is for local development and demos only: a
  // production deployment without DATABASE_URL would silently write to
  // ephemeral instance storage. (Docker validates this in its entrypoint;
  // this guards other hosts.) `next build` evaluates this module while
  // collecting page data with NODE_ENV=production and no database; only the
  // running server is gated.
  if (
    process.env.NODE_ENV === "production" &&
    process.env.NEXT_PHASE !== "phase-production-build"
  ) {
    throw new Error(
      "DATABASE_URL is not set. Production requires a Postgres connection string.",
    );
  }
  const client = new PGlite("./.pglite/data");
  return drizzlePglite(client, { schema }) as unknown as Db;
};

/**
 * Cache the connection in dev so Next.js HMR doesn't open a new one per
 * reload, and always share the embedded database across route bundles:
 * separate PGlite instances on one data directory can read stale values after
 * a server action saves, even inside one production process.
 */
const globalForDb = globalThis as unknown as { db?: Db };

const base: Db = globalForDb.db ?? createDb();

if (env.NODE_ENV !== "production" || !env.DATABASE_URL) globalForDb.db = base;

/**
 * The shared database handle. It routes to the active tenant session when one
 * is set by withTenant(), and to the base connection otherwise, so wiring it
 * in is behavior-preserving until a caller opts into a tenant context.
 */
export const db: Db = createTenantDb(base);

/** Close the standalone script's pool or embedded store after its last query. */
export const closeDatabase = async (): Promise<void> => {
  const { $client } = base as Db & { $client: PGlite | Sql };
  if ($client instanceof PGlite) await $client.close();
  else await $client.end();
};

export { schema };
