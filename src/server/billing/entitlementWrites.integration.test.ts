import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "~/server/db/schema";

/**
 * Integration test for applyEntitlementEvent against a real Drizzle/PGlite
 * instance (fresh in-memory database per test, schema generated straight from
 * the Drizzle definitions), so the ledger primary key, the row lock, the
 * foreign keys and the transaction rollback run with genuine Postgres
 * semantics.
 */

let currentDb: ReturnType<typeof makeDb>;

// Stable proxy so the module's `import { db }` binding always hits currentDb.
vi.mock("~/server/db", () => {
  const proxy = new Proxy(
    {},
    {
      get: (_t, prop) =>
        (currentDb as unknown as Record<string | symbol, unknown>)[prop],
    },
  );
  return { db: proxy, schema };
});

const { applyEntitlementEvent } = await import("./entitlementWrites");
type EntitlementEvent = Parameters<typeof applyEntitlementEvent>[0];

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

const TENANT_ID = "11111111-1111-1111-1111-000000000001";
const MISSING_TENANT_ID = "11111111-1111-1111-1111-000000000099";
const MSP_ID = "aaaaaaaa-0000-0000-0000-000000000001";
const T1 = new Date("2026-09-18T10:00:00Z");
const T2 = new Date("2026-09-18T11:00:00Z");
const PERIOD_END = new Date("2026-10-18T10:00:00Z");

const event = (
  overrides: Partial<EntitlementEvent> = {},
): EntitlementEvent => ({
  provider: "polar",
  eventId: "evt_1",
  type: "subscription.active",
  occurredAt: T1,
  owner: { tenantId: TENANT_ID },
  plan: "pro",
  status: "active",
  quantity: 1,
  trialEnd: null,
  currentPeriodEnd: PERIOD_END,
  cancelAtPeriodEnd: false,
  providerSubscriptionId: "sub_1",
  providerCustomerId: "cus_1",
  ...overrides,
});

const rows = () => currentDb.select().from(schema.entitlements);
const ledger = () => currentDb.select().from(schema.billingEvents);

beforeEach(async () => {
  const client = new PGlite();
  for (const stmt of await schemaDdl()) await client.exec(stmt);
  currentDb = makeDb(client);
  await currentDb
    .insert(schema.tenants)
    .values({ id: TENANT_ID, name: "Workspace" });
  await currentDb
    .insert(schema.mspAccounts)
    .values({ id: MSP_ID, name: "Partner" });
});

describe("applyEntitlementEvent", () => {
  it("applies a first event for a Pro owner and records it in the ledger", async () => {
    expect(await applyEntitlementEvent(event())).toBe("applied");

    const [row] = await rows();
    expect(row).toMatchObject({
      tenantId: TENANT_ID,
      mspAccountId: null,
      plan: "pro",
      source: "polar",
      status: "active",
      quantity: 1,
      cancelAtPeriodEnd: false,
      providerSubscriptionId: "sub_1",
      providerCustomerId: "cus_1",
    });
    expect(row!.currentPeriodEnd).toEqual(PERIOD_END);
    expect(row!.lastEventAt).toEqual(T1);
    expect(await ledger()).toMatchObject([
      { provider: "polar", eventId: "evt_1", type: "subscription.active" },
    ]);
  });

  it("applies an event for an MSP owner with its quantity", async () => {
    const result = await applyEntitlementEvent(
      event({ owner: { mspAccountId: MSP_ID }, plan: "msp", quantity: 14 }),
    );

    expect(result).toBe("applied");
    expect(await rows()).toMatchObject([
      { tenantId: null, mspAccountId: MSP_ID, plan: "msp", quantity: 14 },
    ]);
  });

  it("updates the owner's single row when a newer event arrives", async () => {
    await applyEntitlementEvent(event());
    const result = await applyEntitlementEvent(
      event({
        eventId: "evt_2",
        type: "subscription.canceled",
        occurredAt: T2,
        cancelAtPeriodEnd: true,
      }),
    );

    expect(result).toBe("applied");
    const all = await rows();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ cancelAtPeriodEnd: true });
    expect(all[0]!.lastEventAt).toEqual(T2);
  });

  it("treats an exact replay as a duplicate and changes nothing", async () => {
    await applyEntitlementEvent(event());
    const [before] = await rows();

    // Same event id, different content: only the id decides.
    const result = await applyEntitlementEvent(
      event({ status: "suspended", occurredAt: T2 }),
    );

    expect(result).toBe("duplicate");
    expect(await rows()).toEqual([before]);
    expect(await ledger()).toHaveLength(1);
  });

  it("answers stale for an older event after a newer one", async () => {
    await applyEntitlementEvent(event({ eventId: "evt_new", occurredAt: T2 }));
    const [before] = await rows();

    const result = await applyEntitlementEvent(
      event({ eventId: "evt_old", occurredAt: T1, status: "past_due" }),
    );

    expect(result).toBe("stale");
    expect(await rows()).toEqual([before]);
    // The stale event stays in the ledger so its redelivery is a duplicate.
    expect(await ledger()).toHaveLength(2);
  });

  it("never overwrites a comped row", async () => {
    await currentDb.insert(schema.entitlements).values({
      tenantId: TENANT_ID,
      plan: "msp",
      source: "comped",
      status: "active",
    });
    const [before] = await rows();

    const result = await applyEntitlementEvent(
      event({ status: "canceled", currentPeriodEnd: T1 }),
    );

    expect(result).toBe("comped");
    expect(await rows()).toEqual([before]);
  });

  it("leaves no ledger row when the transaction fails", async () => {
    // No such workspace: the entitlements insert violates its foreign key
    // after the ledger row was written in the same transaction.
    const orphan = event({ owner: { tenantId: MISSING_TENANT_ID } });

    await expect(applyEntitlementEvent(orphan)).rejects.toThrow();

    expect(await ledger()).toEqual([]);
    expect(await rows()).toEqual([]);

    // The provider's retry is then processed, not swallowed as a duplicate.
    await currentDb
      .insert(schema.tenants)
      .values({ id: MISSING_TENANT_ID, name: "Late workspace" });
    expect(await applyEntitlementEvent(orphan)).toBe("applied");
  });
});
