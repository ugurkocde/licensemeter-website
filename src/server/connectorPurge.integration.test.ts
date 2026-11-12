import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "~/server/db/schema";
import type { WasteRuleId } from "~/server/types";

/**
 * Disconnecting a connector leaves nothing of it behind: the purges remove a
 * source's rows and findings, and every later write of that source's data is
 * checked under the workspace's source lock against the identity the run read
 * it with, so a sync or analysis that read before the disconnect cannot write
 * it back. Imported sources and sources that are still connected keep their
 * data.
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
  currentFindingFilter,
  microsoftToken,
  purgeAdobeSource,
  purgeMicrosoftSource,
  purgeSaasSource,
  readSourceTokens,
  withSourceLock,
} = await import("~/server/connectorPurge");
const { diffFindings, runAnalysis } = await import("~/server/sync/runSync");

const tokens = () =>
  withSourceLock(tenantId, (tx) => readSourceTokens(tx, tenantId));

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

describe("source tokens", () => {
  it("name each connected source, not imported ones", async () => {
    const read = await tokens();
    expect(read.microsoft).toBe("managed:tid-1");
    expect(read.adobe).toBe("org:client");
    expect(read.saas).toEqual({ zoom: "acct", openai: "org" });
  });

  it("change when a source is disconnected or reconnected elsewhere", async () => {
    await purgeAdobeSource(tenantId);
    expect((await tokens()).adobe).toBeNull();
    await currentDb.insert(schema.adobeConnections).values({
      tenantId,
      orgId: "other-org",
      clientId: "client",
      clientSecretEnc: "enc",
    });
    expect((await tokens()).adobe).toBe("other-org:client");
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

  it("removes the Microsoft data and signals and keeps the price book", async () => {
    await currentDb
      .update(schema.tenants)
      .set({
        activitySignal: "none",
        usageAggregate: { inactiveCount: 7, totalCount: 100 },
      })
      .where(eq(schema.tenants.id, tenantId));
    await purgeMicrosoftSource(tenantId);
    expect(await count(schema.tenantUsers)).toBe(0);
    expect(await count(schema.tenantSkus)).toBe(0);
    expect(await count(schema.snapshots)).toBe(0);
    expect(await rules()).not.toContain("never_active");
    const tenant = await currentDb.query.tenants.findFirst({
      where: eq(schema.tenants.id, tenantId),
    });
    expect(tenant?.tid).toBeNull();
    expect(tenant?.usageAggregate).toBeNull();
    expect(tenant?.activitySignal).toBeNull();
    expect(
      await currentDb
        .select()
        .from(schema.priceBook)
        .where(eq(schema.priceBook.tenantId, tenantId)),
    ).toHaveLength(1);
  });

  it("leaves no Microsoft finding behind for the follow-up analysis", async () => {
    await currentDb
      .update(schema.tenants)
      .set({
        activitySignal: "none",
        usageAggregate: { inactiveCount: 7, totalCount: 100 },
      })
      .where(eq(schema.tenants.id, tenantId));
    await runAnalysis(tenantId);
    expect(await rules()).toContain("inactive_90d");

    // The disconnect action purges, then analyses what is left (a SaaS seat).
    await purgeMicrosoftSource(tenantId);
    await runAnalysis(tenantId);
    const left = await rules();
    expect(
      left.some((r) => !r.startsWith("saas_") && !r.startsWith("adobe_")),
    ).toBe(false);
  });
});

describe("writes of a run that read before a disconnect", () => {
  it("drop the findings of every source disconnected since", async () => {
    const readWith = await tokens();
    await purgeMicrosoftSource(tenantId);
    await purgeAdobeSource(tenantId);
    await purgeSaasSource(tenantId, "zoom");

    // The run now writes the findings it computed from its earlier read.
    await diffFindings(
      tenantId,
      [
        {
          dedupeKey: "never_active|g1|sku-1",
          rule: "never_active",
          graphUserId: "g1",
          skuId: "sku-1",
          title: "t",
          detail: {},
          monthlyImpactCents: 0,
        },
        {
          dedupeKey: "adobe_orphaned|ann@example.com|-",
          rule: "adobe_orphaned",
          graphUserId: null,
          skuId: null,
          title: "t",
          detail: {},
          monthlyImpactCents: 0,
        },
        {
          dedupeKey: "saas_orphaned|zoom:ann@example.com|-",
          rule: "saas_orphaned",
          graphUserId: null,
          skuId: null,
          title: "t",
          detail: { provider: "zoom" },
          monthlyImpactCents: 0,
        },
        {
          dedupeKey: "saas_inactive|chatgpt:ann@example.com|-",
          rule: "saas_inactive",
          graphUserId: null,
          skuId: null,
          title: "t",
          detail: { provider: "chatgpt" },
          monthlyImpactCents: 0,
        },
      ],
      new Date(),
      { keep: (tx) => currentFindingFilter(tx, tenantId, readWith) },
    );

    // Only the imported ChatGPT finding, whose seats still exist, is written.
    expect(await rules()).toEqual(["saas_inactive"]);
  });

  it("treat a run that loaded the tenant before a Microsoft disconnect as stale", async () => {
    // runSync derives the token from the tenant row it builds the client
    // from; that row still had the tid when the disconnect landed.
    const stale = microsoftToken("tid-1", undefined);
    await purgeMicrosoftSource(tenantId);
    expect(stale).not.toBeNull();
    expect((await tokens()).microsoft).toBeNull();
    const keep = await withSourceLock(tenantId, (tx) =>
      currentFindingFilter(tx, tenantId, {
        microsoft: stale,
        adobe: "org:client",
        saas: { zoom: "acct", openai: "org" },
      }),
    );
    expect(keep({ rule: "never_active", detail: {} })).toBe(false);
  });

  it("keep the findings of sources that are still connected", async () => {
    const readWith = await tokens();
    const keep = await withSourceLock(tenantId, (tx) =>
      currentFindingFilter(tx, tenantId, readWith),
    );
    expect(keep({ rule: "never_active", detail: {} })).toBe(true);
    expect(keep({ rule: "adobe_orphaned", detail: {} })).toBe(true);
    expect(keep({ rule: "saas_orphaned", detail: { provider: "zoom" } })).toBe(
      true,
    );
  });

  it("drop an imported source's findings once its seats are cleared", async () => {
    const readWith = await tokens();
    await currentDb
      .delete(schema.saasSeats)
      .where(eq(schema.saasSeats.provider, "chatgpt"));
    const keep = await withSourceLock(tenantId, (tx) =>
      currentFindingFilter(tx, tenantId, readWith),
    );
    expect(
      keep({ rule: "saas_inactive", detail: { provider: "chatgpt" } }),
    ).toBe(false);
  });
});
