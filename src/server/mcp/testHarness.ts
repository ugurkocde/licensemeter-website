import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";

import * as schema from "~/server/db/schema";

/**
 * Test-only helpers for the MCP suites: a fresh in-memory PGlite database with
 * the schema generated straight from the Drizzle definitions, and the fixtures
 * the suites share. Each test file points its own `~/server/db` mock at the
 * instance it gets from freshDb().
 */

export type TestDb = ReturnType<typeof makeDb>;

const makeDb = (client: PGlite) => drizzle(client, { schema });

let cachedDdl: string[] | null = null;

export const freshDb = async (): Promise<TestDb> => {
  cachedDdl ??= await generateMigration(
    generateDrizzleJson({}),
    generateDrizzleJson(schema),
  );
  const client = new PGlite();
  for (const stmt of cachedDdl) await client.exec(stmt);
  return makeDb(client);
};

export const tenantId = (n: number) =>
  `11111111-1111-1111-1111-${String(n).padStart(12, "0")}`;

export const seedTenant = async (
  db: TestDb,
  n: number,
  overrides: Partial<typeof schema.tenants.$inferInsert> = {},
): Promise<schema.TenantRow> => {
  const [row] = await db
    .insert(schema.tenants)
    .values({ id: tenantId(n), name: `Workspace ${n}`, ...overrides })
    .returning();
  return row!;
};

export const seedProPlan = async (db: TestDb, id: string): Promise<void> => {
  await db.insert(schema.entitlements).values({
    tenantId: id,
    plan: "pro",
    source: "polar",
    status: "active",
    currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
  });
};
