import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "~/server/db/schema";
import type { SaasProvider, WasteRuleId } from "~/server/types";

/**
 * Disconnecting a connector leaves nothing of it behind, even when a sync or
 * an analysis that read the connector before the disconnect writes its
 * results afterwards: purgeDisconnectedSources runs after those writes and
 * removes them again. Sources the run did not start with (a CSV import) and
 * sources that are still connected keep their data.
 */

let currentDb: ReturnType<typeof makeDb>;

vi.mock("~/env", () => ({
  env: { NODE_ENV: "test", AUTH_SECRET: "test-secret-test-secret" },
}));
vi.mock("~/server/db", () => ({
  db: new Proxy(
    {},
    {
      get: (_t, prop) =>
        (currentDb as unknown as Record<string | symbol, unknown>)[prop],
    },
  ),
  schema,
}));

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

const {
  connectedSources,
  purgeAdobeSource,
  purgeDisconnectedSources,
  purgeMicrosoftSource,
  purgeSaasSource,
} = await import("~/server/connectorPurge");

let tenantId: string;

const finding = (
  rule: WasteRuleId,
  dedupeKey: string,
  detail: Record<string, unknown> = {},
) => ({ tenantId, rule, dedupeKey, title: rule, detail });

/** What an in-flight run writes for every source after reading it. */
async function writeEverySource() {
  await currentDb
    .insert(schema.tenantUsers)
    .values({ tenantId, graphId: "g1", upn: "ann@example.com" })
    .onConflictDoNothing();
  await currentDb
    .insert(schema.tenantSkus)
    .values({ tenantId, skuId: "sku-1", skuPartNumber: "E3" })
    .onConflictDoNothing();
  await currentDb
    .insert(schema.snapshots)
    .values({
      tenantId,
      day: "2026-11-12",
      totalMonthlySpendCents: 100,
      totalMonthlyWasteCents: 10,
      bySku: {},
    })
    .onConflictDoNothing();
  await currentDb
    .insert(schema.adobeUsers)
    .values({ tenantId, email: "ann@example.com" })
    .onConflictDoNothing();
  await currentDb
    .insert(schema.saasSeats)
    .values([
      { tenantId, provider: "zoom", email: "ann@example.com" },
      { tenantId, provider: "chatgpt", email: "ann@example.com" },
    ])
    .onConflictDoNothing();
  await currentDb
    .insert(schema.aiSpendDaily)
    .values({
      tenantId,
      provider: "openai",
      day: "2026-11-12",
      category: "api",
      amountCents: 5,
    })
    .onConflictDoNothing();
  await currentDb
    .insert(schema.findings)
    .values([
      finding("never_active", "never_active|g1|sku-1"),
      finding("adobe_orphaned", "adobe_orphaned|ann@example.com|-"),
      finding("saas_orphaned", "saas_orphaned|zoom:ann@example.com|-", {
        provider: "zoom",
      }),
      finding("saas_inactive", "saas_inactive|chatgpt:ann@example.com|-", {
        provider: "chatgpt",
      }),
    ])
    .onConflictDoNothing();
}

const count = async (
  table:
    | typeof schema.tenantUsers
    | typeof schema.tenantSkus
    | typeof schema.snapshots
    | typeof schema.adobeUsers
    | typeof schema.aiSpendDaily,
) =>
  (await currentDb.select().from(table).where(eq(table.tenantId, tenantId)))
    .length;

const rules = async () =>
  (
    await currentDb
      .select({ rule: schema.findings.rule })
      .from(schema.findings)
      .where(eq(schema.findings.tenantId, tenantId))
  )
    .map((r) => r.rule)
    .sort();

const seatProviders = async () =>
  (
    await currentDb
      .select({ provider: schema.saasSeats.provider })
      .from(schema.saasSeats)
      .where(eq(schema.saasSeats.tenantId, tenantId))
  )
    .map((r) => r.provider)
    .sort();

beforeEach(async () => {
  const client = new PGlite();
  for (const stmt of await schemaDdl()) await client.exec(stmt);
  currentDb = makeDb(client);
  const [tenant] = await currentDb
    .insert(schema.tenants)
    .values({ tid: "tid-1", name: "Example Ltd" })
    .returning({ id: schema.tenants.id });
  tenantId = tenant!.id;
  await currentDb.insert(schema.adobeConnections).values({
    tenantId,
    orgId: "org",
    clientId: "client",
    clientSecretEnc: "enc",
  });
  await currentDb.insert(schema.saasConnections).values([
    { tenantId, provider: "zoom", orgRef: "acct", secretEnc: "enc" },
    { tenantId, provider: "openai", orgRef: "org", secretEnc: "enc" },
  ]);
  await currentDb
    .insert(schema.priceBook)
    .values({ tenantId, skuId: "sku-1", monthlyPriceCents: 3000 });
  await writeEverySource();
});

describe("connectedSources", () => {
  it("lists the connected sources, not imported ones", async () => {
    const sources = await connectedSources({
      id: tenantId,
      tid: "tid-1",
      isDemo: false,
    });
    expect(sources.microsoft).toBe(true);
    expect(sources.adobe).toBe(true);
    expect([...sources.saas].sort()).toEqual(["openai", "zoom"]);
  });

  it("reports nothing for a demo workspace", async () => {
    expect(
      await connectedSources({ id: tenantId, tid: "tid-1", isDemo: true }),
    ).toEqual({ microsoft: false, adobe: false, saas: [] });
  });
});

describe("disconnect purges", () => {
  it("removes Adobe users and Adobe findings", async () => {
    await purgeAdobeSource(tenantId);
    expect(await count(schema.adobeUsers)).toBe(0);
    expect(await rules()).not.toContain("adobe_orphaned");
    expect(await rules()).toContain("never_active");
  });

  it("removes one SaaS provider's seats, spend and findings only", async () => {
    await purgeSaasSource(tenantId, "zoom");
    expect(await seatProviders()).toEqual(["chatgpt"]);
    expect(await rules()).toEqual([
      "adobe_orphaned",
      "never_active",
      "saas_inactive",
    ]);
    await purgeSaasSource(tenantId, "openai");
    expect(await count(schema.aiSpendDaily)).toBe(0);
  });

  it("removes the Microsoft data and keeps the price book", async () => {
    await purgeMicrosoftSource(tenantId);
    expect(await count(schema.tenantUsers)).toBe(0);
    expect(await count(schema.tenantSkus)).toBe(0);
    expect(await count(schema.snapshots)).toBe(0);
    expect(await rules()).not.toContain("never_active");
    const tenant = await currentDb.query.tenants.findFirst({
      where: eq(schema.tenants.id, tenantId),
    });
    expect(tenant?.tid).toBeNull();
    expect(
      await currentDb
        .select()
        .from(schema.priceBook)
        .where(eq(schema.priceBook.tenantId, tenantId)),
    ).toHaveLength(1);
  });
});

describe("purgeDisconnectedSources", () => {
  const started = {
    microsoft: true,
    adobe: true,
    saas: ["zoom", "openai"] as SaasProvider[],
  };

  it("keeps everything while the sources are still connected", async () => {
    await purgeDisconnectedSources(tenantId, started);
    expect(await count(schema.tenantUsers)).toBe(1);
    expect(await count(schema.adobeUsers)).toBe(1);
    expect(await seatProviders()).toEqual(["chatgpt", "zoom"]);
    expect(await rules()).toHaveLength(4);
  });

  it("removes what a run wrote after the sources were disconnected", async () => {
    // Disconnect everything while a run is in flight...
    await purgeMicrosoftSource(tenantId);
    await purgeAdobeSource(tenantId);
    await purgeSaasSource(tenantId, "zoom");
    await purgeSaasSource(tenantId, "openai");
    // ...then the run writes what it read before the disconnect.
    await writeEverySource();
    expect(await count(schema.adobeUsers)).toBe(1);

    await purgeDisconnectedSources(tenantId, started);

    expect(await count(schema.tenantUsers)).toBe(0);
    expect(await count(schema.tenantSkus)).toBe(0);
    expect(await count(schema.snapshots)).toBe(0);
    expect(await count(schema.adobeUsers)).toBe(0);
    expect(await count(schema.aiSpendDaily)).toBe(0);
    // The imported ChatGPT list was never a connected source and stays.
    expect(await seatProviders()).toEqual(["chatgpt"]);
    expect(await rules()).toEqual(["saas_inactive"]);
  });

  it("leaves sources the run did not start with alone", async () => {
    await purgeAdobeSource(tenantId);
    await writeEverySource();
    await purgeDisconnectedSources(tenantId, {
      microsoft: false,
      adobe: false,
      saas: [],
    });
    expect(await count(schema.adobeUsers)).toBe(1);
  });
});
