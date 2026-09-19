import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "~/server/db/schema";

/**
 * Integration test for the waste history window against a real Drizzle/PGlite
 * instance (fresh in-memory database per test, schema generated straight from
 * the Drizzle definitions), so the date comparison on `snapshots.day` runs
 * with genuine Postgres semantics and the entitlement comes from real rows.
 */

let currentDb: ReturnType<typeof makeDb>;
let billing = true;
/** Queries started by the code under test through the shared db binding. */
let dbQueries = 0;
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
const { loadWasteHistory } = await import("./historyStore");

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
const FUTURE = new Date("2026-10-01T00:00:00Z");
const MONTHS_OF_DATA = 30;

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

/** The 18th of each month, `monthsAgo` calendar months before NOW. */
const monthlyDay = (monthsAgo: number): string =>
  new Date(Date.UTC(2026, 8 - monthsAgo, 18)).toISOString().slice(0, 10);

/**
 * One snapshot per month on the 18th, from NOW back to 30 months ago (31
 * rows), plus the day before each window edge so the boundary is exercised.
 */
async function seedSnapshots(id: string): Promise<string[]> {
  const days = [
    ...Array.from({ length: MONTHS_OF_DATA + 1 }, (_, i) => monthlyDay(i)),
    "2025-09-17",
    "2024-09-17",
  ];
  await currentDb.insert(schema.snapshots).values(
    days.map((day, i) => ({
      tenantId: id,
      day,
      totalMonthlySpendCents: 100_000 + i,
      totalMonthlyWasteCents: 10_000 + i,
    })),
  );
  return days;
}

const storedDays = async (id: string): Promise<number> =>
  currentDb.$count(schema.snapshots, eq(schema.snapshots.tenantId, id));

beforeEach(async () => {
  const client = new PGlite();
  for (const stmt of await schemaDdl()) await client.exec(stmt);
  currentDb = makeDb(client);
  billing = true;
  dbQueries = 0;
});

describe("loadWasteHistory", () => {
  it("reads exactly the last 12 months for a Free workspace and keeps the rest", async () => {
    const tenant = await seedTenant(1);
    const seeded = await seedSnapshots(tenant.id);
    const entitlement = await loadEntitlement(tenant, NOW);
    expect(entitlement.plan).toBe("free");

    const history = await loadWasteHistory(tenant.id, entitlement, {
      now: NOW,
    });

    const days = history.rows.map((r) => r.day);
    // 13 monthly rows: today back to the inclusive edge, 12 months ago.
    expect(days).toHaveLength(13);
    expect(days[0]).toBe("2026-09-18");
    expect(days.at(-1)).toBe("2025-09-18");
    expect(days).not.toContain("2025-09-17");
    expect(history.cutOff).toBe(true);
    expect(await storedDays(tenant.id)).toBe(seeded.length);
  });

  it("reads exactly the last 24 months for a Pro workspace and keeps the rest", async () => {
    const tenant = await seedTenant(1);
    const seeded = await seedSnapshots(tenant.id);
    await currentDb.insert(schema.entitlements).values({
      tenantId: tenant.id,
      plan: "pro",
      source: "polar",
      status: "active",
      currentPeriodEnd: FUTURE,
    });
    const entitlement = await loadEntitlement(tenant, NOW);
    expect(entitlement.plan).toBe("pro");

    const history = await loadWasteHistory(tenant.id, entitlement, {
      now: NOW,
    });

    const days = history.rows.map((r) => r.day);
    // 25 monthly rows plus 2025-09-17, which sits inside the longer window.
    expect(days).toHaveLength(26);
    expect(days[0]).toBe("2026-09-18");
    expect(days.at(-1)).toBe("2024-09-18");
    expect(days).toContain("2025-09-17");
    expect(days).not.toContain("2024-09-17");
    // Older rows exist, but the hint is only for the 12-month window.
    expect(history.cutOff).toBe(false);
    expect(await storedDays(tenant.id)).toBe(seeded.length);
  });

  it("gives self-hosted installs and the demo 24 months without a hint", async () => {
    const demo = await seedTenant(1, { isDemo: true });
    await seedSnapshots(demo.id);
    const demoHistory = await loadWasteHistory(
      demo.id,
      await loadEntitlement(demo, NOW),
      { now: NOW },
    );
    expect(demoHistory.rows).toHaveLength(26);
    expect(demoHistory.cutOff).toBe(false);

    billing = false;
    const selfHosted = await seedTenant(2);
    await seedSnapshots(selfHosted.id);
    const selfHostedHistory = await loadWasteHistory(
      selfHosted.id,
      await loadEntitlement(selfHosted, NOW),
      { now: NOW },
    );
    expect(selfHostedHistory.rows).toHaveLength(26);
    expect(selfHostedHistory.cutOff).toBe(false);
  });

  it("reports no cut-off while a Free workspace has nothing older than the window", async () => {
    const tenant = await seedTenant(1);
    await currentDb.insert(schema.snapshots).values(
      ["2026-09-18", "2026-03-01", "2025-09-18"].map((day) => ({
        tenantId: tenant.id,
        day,
      })),
    );

    const history = await loadWasteHistory(
      tenant.id,
      await loadEntitlement(tenant, NOW),
      { now: NOW },
    );

    expect(history.rows).toHaveLength(3);
    expect(history.cutOff).toBe(false);
  });

  it("ignores another workspace's older snapshots", async () => {
    const tenant = await seedTenant(1);
    const other = await seedTenant(2);
    await currentDb.insert(schema.snapshots).values([
      { tenantId: tenant.id, day: "2026-09-18" },
      { tenantId: other.id, day: "2024-01-01" },
    ]);

    const history = await loadWasteHistory(
      tenant.id,
      await loadEntitlement(tenant, NOW),
      { now: NOW },
    );

    expect(history.rows.map((r) => r.day)).toEqual(["2026-09-18"]);
    expect(history.cutOff).toBe(false);
  });

  it("returns the newest rows under a limit and still reports the cut-off window", async () => {
    const tenant = await seedTenant(1);
    await seedSnapshots(tenant.id);
    const entitlement = await loadEntitlement(tenant, NOW);
    dbQueries = 0;

    const history = await loadWasteHistory(tenant.id, entitlement, {
      now: NOW,
      limit: 5,
    });

    expect(history.rows.map((r) => r.day)).toEqual(
      [0, 1, 2, 3, 4].map(monthlyDay),
    );
    expect(history.cutOff).toBe(true);
    expect(dbQueries).toBe(2);
  });

  it("checks for older rows only when the hint could show", async () => {
    const tenant = await seedTenant(1);
    await seedSnapshots(tenant.id);
    const entitlement = await loadEntitlement(tenant, NOW);

    dbQueries = 0;
    const underLimit = await loadWasteHistory(tenant.id, entitlement, {
      now: NOW,
      limit: 90,
    });
    expect(underLimit.rows).toHaveLength(13);
    expect(underLimit.cutOff).toBe(true);
    expect(dbQueries).toBe(2);

    billing = false;
    const everything = await loadEntitlement(tenant, NOW);
    dbQueries = 0;
    await loadWasteHistory(tenant.id, everything, { now: NOW, limit: 90 });
    expect(dbQueries).toBe(1);
  });
});
