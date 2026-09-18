import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "~/server/db/schema";
import { FEATURES, PLAN_FEATURES } from "~/server/entitlement";

/**
 * Integration test for loadEntitlement against a real Drizzle/PGlite instance
 * (fresh in-memory database per test, schema generated straight from the
 * Drizzle definitions), so the single-owner check, the partial unique indexes
 * and the row-wise (created_at, id) comparison run with genuine Postgres
 * semantics.
 */

let currentDb: ReturnType<typeof makeDb>;
let billing = true;
/** Queries started by the code under test through the shared db binding. */
let dbQueries = 0;
/**
 * Every way a Drizzle instance starts a statement. The builders also read
 * internals (session, dialect) off the same binding; those are not queries.
 */
const QUERY_ENTRY_POINTS = new Set<string | symbol>([
  "select",
  "selectDistinct",
  "selectDistinctOn",
  "insert",
  "update",
  "delete",
  "execute",
  "transaction",
  "query",
  "$count",
  "with",
]);

vi.mock("~/env", () => ({
  env: { NODE_ENV: "test" },
  billingEnabled: () => billing,
}));

// Stable proxy so the module's `import { db }` binding always hits currentDb.
// Fixtures write through currentDb directly and are never counted.
vi.mock("~/server/db", () => {
  const proxy = new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (QUERY_ENTRY_POINTS.has(prop)) dbQueries += 1;
        return (currentDb as unknown as Record<string | symbol, unknown>)[prop];
      },
    },
  );
  return { db: proxy, schema };
});

const { loadEntitlement } = await import("./entitlementStore");

// --- DB harness --------------------------------------------------------------

let cachedDdl: string[] | null = null;
async function schemaDdl(): Promise<string[]> {
  cachedDdl ??= await generateMigration(
    generateDrizzleJson({}),
    generateDrizzleJson(schema),
  );
  return cachedDdl;
}

function makeDb(client: PGlite) {
  return drizzle(client, { schema });
}

// --- fixtures ----------------------------------------------------------------

const NOW = new Date("2026-09-18T12:00:00Z");
const PAST = new Date("2026-09-01T00:00:00Z");
const FUTURE = new Date("2026-10-01T00:00:00Z");
const MSP_ID = "aaaaaaaa-0000-0000-0000-000000000001";

const tenantId = (n: number) =>
  `11111111-1111-1111-1111-${String(n).padStart(12, "0")}`;

async function seedTenant(
  n: number,
  overrides: Partial<typeof schema.tenants.$inferInsert> = {},
): Promise<schema.TenantRow> {
  const [row] = await currentDb
    .insert(schema.tenants)
    .values({ id: tenantId(n), name: `Workspace ${n}`, ...overrides })
    .returning();
  return row!;
}

async function seedMspAccount(): Promise<void> {
  await currentDb
    .insert(schema.mspAccounts)
    .values({ id: MSP_ID, name: "Partner" });
}

async function seedEntitlement(
  values: Partial<typeof schema.entitlements.$inferInsert> &
    Pick<typeof schema.entitlements.$inferInsert, "plan">,
): Promise<void> {
  await currentDb.insert(schema.entitlements).values({
    source: "polar",
    status: "active",
    currentPeriodEnd: FUTURE,
    ...values,
  });
}

const enabledFeatures = (e: { features: Record<string, boolean> }) =>
  FEATURES.filter((f) => e.features[f]);

beforeEach(async () => {
  const client = new PGlite();
  for (const stmt of await schemaDdl()) await client.exec(stmt);
  currentDb = makeDb(client);
  billing = true;
  dbQueries = 0;
});

describe("loadEntitlement", () => {
  it("returns every feature without querying when billing is disabled", async () => {
    billing = false;
    const tenant = await seedTenant(1);
    // A row that would resolve to Free if it were read.
    await seedEntitlement({
      tenantId: tenant.id,
      plan: "pro",
      status: "suspended",
    });

    const e = await loadEntitlement(tenant, NOW);

    expect(dbQueries).toBe(0);
    expect(e.state).toBe("selfHosted");
    expect(enabledFeatures(e)).toEqual([...FEATURES]);
  });

  it("returns every feature without querying for the demo workspace", async () => {
    const tenant = await seedTenant(1, { isDemo: true });

    const e = await loadEntitlement(tenant, NOW);

    expect(dbQueries).toBe(0);
    expect(e.state).toBe("demo");
    expect(enabledFeatures(e)).toEqual([...FEATURES]);
  });

  it("resolves a workspace with no rows to Free", async () => {
    await seedMspAccount();
    const solo = await seedTenant(1);
    const client = await seedTenant(2, { mspAccountId: MSP_ID });

    for (const tenant of [solo, client]) {
      const e = await loadEntitlement(tenant, NOW);
      expect(e.plan).toBe("free");
      expect(e.state).toBe("free");
      expect(enabledFeatures(e)).toEqual([]);
    }
  });

  it("resolves an own Pro row to Pro in a single query", async () => {
    const tenant = await seedTenant(1);
    await seedTenant(2);
    await seedEntitlement({ tenantId: tenant.id, plan: "pro" });

    const e = await loadEntitlement(tenant, NOW);

    expect(dbQueries).toBe(1);
    expect(e.plan).toBe("pro");
    expect(e.state).toBe("active");
    expect(e.source).toBe("polar");
    expect(e.currentPeriodEnd).toEqual(FUTURE);
    expect(enabledFeatures(e)).toEqual([...PLAN_FEATURES.pro]);
    // Another workspace never sees this row.
    expect((await loadEntitlement(await seedTenant(3), NOW)).plan).toBe("free");
  });

  it("falls through an expired own row to a valid MSP row", async () => {
    await seedMspAccount();
    const tenant = await seedTenant(1, { mspAccountId: MSP_ID });
    await seedEntitlement({
      tenantId: tenant.id,
      plan: "pro",
      status: "canceled",
      currentPeriodEnd: PAST,
    });
    await seedEntitlement({
      mspAccountId: MSP_ID,
      plan: "msp",
      source: "marketplace",
      quantity: 5,
    });

    const e = await loadEntitlement(tenant, NOW);

    expect(e.plan).toBe("msp");
    expect(e.state).toBe("active");
    expect(e.source).toBe("marketplace");
    expect(enabledFeatures(e)).toEqual([...FEATURES]);
  });

  it("keeps an own paid row ahead of the MSP row", async () => {
    await seedMspAccount();
    const tenant = await seedTenant(1, { mspAccountId: MSP_ID });
    await seedEntitlement({ tenantId: tenant.id, plan: "pro" });
    await seedEntitlement({ mspAccountId: MSP_ID, plan: "msp", quantity: 5 });

    expect((await loadEntitlement(tenant, NOW)).plan).toBe("pro");
  });

  it("covers exactly the first N workspaces by createdAt, then id", async () => {
    await seedMspAccount();
    const at = (minute: number) =>
      new Date(`2026-01-01T00:${String(minute).padStart(2, "0")}:00Z`);
    // Ids run against creation order, and 2 and 1 share a timestamp, so the
    // expected order is 4, 1, 2, 3.
    const third = await seedTenant(2, {
      mspAccountId: MSP_ID,
      createdAt: at(5),
    });
    const second = await seedTenant(1, {
      mspAccountId: MSP_ID,
      createdAt: at(5),
    });
    const fourth = await seedTenant(3, {
      mspAccountId: MSP_ID,
      createdAt: at(9),
    });
    const first = await seedTenant(4, {
      mspAccountId: MSP_ID,
      createdAt: at(1),
    });
    // Older workspaces outside the account do not take up a slot.
    await seedTenant(5, { createdAt: at(0) });
    await seedEntitlement({ mspAccountId: MSP_ID, plan: "msp", quantity: 3 });

    for (const tenant of [first, second, third]) {
      const e = await loadEntitlement(tenant, NOW);
      expect(e.plan).toBe("msp");
      expect(e.state).toBe("active");
    }
    const over = await loadEntitlement(fourth, NOW);
    expect(over.plan).toBe("free");
    expect(over.state).toBe("overQuantity");
    expect(enabledFeatures(over)).toEqual([]);

    // Raising the quantity covers the next workspace.
    await currentDb.update(schema.entitlements).set({ quantity: 4 });
    expect((await loadEntitlement(fourth, NOW)).plan).toBe("msp");
  });

  it("reports a lapsed MSP row as Free without counting workspaces", async () => {
    await seedMspAccount();
    const tenant = await seedTenant(1, { mspAccountId: MSP_ID });
    await seedEntitlement({
      mspAccountId: MSP_ID,
      plan: "msp",
      status: "suspended",
    });

    const e = await loadEntitlement(tenant, NOW);

    expect(dbQueries).toBe(1);
    expect(e.plan).toBe("free");
    expect(e.state).toBe("free");
  });

  it("lets a comped own row win over everything a provider reports", async () => {
    await seedMspAccount();
    const tenant = await seedTenant(9, {
      mspAccountId: MSP_ID,
      createdAt: new Date("2026-06-01T00:00:00Z"),
    });
    await seedTenant(1, {
      mspAccountId: MSP_ID,
      createdAt: new Date("2026-01-01T00:00:00Z"),
    });
    await seedEntitlement({
      tenantId: tenant.id,
      plan: "pro",
      source: "comped",
      status: "suspended",
      currentPeriodEnd: PAST,
    });
    // The MSP row alone would leave this workspace over quantity.
    await seedEntitlement({ mspAccountId: MSP_ID, plan: "msp", quantity: 1 });

    const e = await loadEntitlement(tenant, NOW);

    expect(e.plan).toBe("pro");
    expect(e.state).toBe("comped");
    expect(e.source).toBe("comped");
  });

  it("propagates database errors", async () => {
    const tenant = await seedTenant(1);
    await currentDb.execute("drop table entitlements");

    await expect(loadEntitlement(tenant, NOW)).rejects.toThrow();
  });
});
