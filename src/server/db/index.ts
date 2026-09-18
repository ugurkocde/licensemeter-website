import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { PGlite } from "@electric-sql/pglite";

import { env } from "~/env";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;

/**
 * Real Postgres when DATABASE_URL is set; embedded PGlite otherwise (dev/demo).
 * Both drivers expose the same Drizzle query API for everything this app uses,
 * so the PGlite instance is intentionally typed as the postgres-js database.
 */
const createDb = (): Db => {
  if (env.DATABASE_URL) {
    const client = postgres(env.DATABASE_URL, {
      prepare: false,
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10,
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

/** Cache the connection in dev so Next.js HMR doesn't open a new one per reload. */
const globalForDb = globalThis as unknown as { db?: Db };

export const db: Db = globalForDb.db ?? createDb();

if (env.NODE_ENV !== "production") globalForDb.db = db;

export { schema };
