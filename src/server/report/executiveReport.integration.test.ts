import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AccessContext, FeatureAccess } from "~/server/access";
import * as schema from "~/server/db/schema";
import { entitlementOf, type Plan } from "~/server/entitlement";
import { freshDb, seedTenant, type TestDb } from "~/server/mcp/testHarness";
import { pdfPages, pdfText } from "./pdfText.test-helper";

/**
 * The executive report end to end on a real database: the loader's queries,
 * the Free teaser, the PDF route's 402 gate and its audit entry, and that the
 * findings' names, UPNs and emails never reach the summary or the PDF.
 */

let currentDb: TestDb;
let tenant: schema.TenantRow;
let plan: Plan;

vi.mock("server-only", () => ({}));
vi.mock("~/env", () => ({
  env: { NODE_ENV: "test", AUTH_SECRET: "test-secret-test-secret-test-secret" },
  byoConnectorEnabled: () => true,
  siteUrl: () => "https://licensemeter.test",
}));
vi.mock("~/server/db", async () => {
  const { createTenantDb } = await import("~/server/db/tenant");
  return {
    db: createTenantDb(
      new Proxy(
        {},
        {
          get: (_t, prop) =>
            (currentDb as unknown as Record<string | symbol, unknown>)[prop],
        },
      ),
    ),
    schema,
  };
});

const entitlement = () =>
  entitlementOf({
    tenant: { isDemo: false },
    record:
      plan === "free"
        ? null
        : {
            plan,
            source: "polar",
            status: "active",
            trialEnd: null,
            currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
            cancelAtPeriodEnd: false,
          },
    covered: true,
    billingEnabled: true,
    now: new Date(),
  });

const context = (): AccessContext =>
  ({
    user: { oid: "user_1", tid: "", upn: "a@a.example", name: "A" },
    tenant,
    membership: { id: "m1", role: "viewer", email: "a@a.example" },
    entitlement: entitlement(),
    workspaces: [],
  }) as unknown as AccessContext;

vi.mock("~/server/access", () => ({
  apiFeatureAccess: async (feature: "execReport"): Promise<FeatureAccess> =>
    entitlement().features[feature]
      ? { ctx: context(), denied: null }
      : { ctx: null, denied: "featureRequired", feature, plan: "pro" },
}));

const { loadExecutiveSummary } = await import("./executiveData");
const { GET } = await import("~/app/api/reports/executive/pdf/route");

const E3 = "05e9a617-0261-4cee-bb44-138d3ef5d965";
const inDays = (days: number) => new Date(Date.now() + days * 86_400_000);
const PII = [
  "Alice Wonderland",
  "alice.wonderland@contoso.example",
  "Bob Builder",
  "bob.builder@contoso.example",
  "aaaaaaaa-1111-4222-8333-444444444444",
] as const;

const seed = async () => {
  await currentDb.insert(schema.tenantSkus).values({
    tenantId: tenant.id,
    skuId: E3,
    skuPartNumber: "SPE_E3",
    displayName: "Microsoft 365 E3",
    prepaidEnabled: 100,
    consumedUnits: 90,
    nextLifecycleAt: inDays(40),
  });
  await currentDb
    .insert(schema.priceBook)
    .values({ tenantId: tenant.id, skuId: E3, monthlyPriceCents: 3_600 });
  const licenses = [
    { skuId: E3, name: "Microsoft 365 E3", monthlyPriceCents: 3_600 },
  ];
  await currentDb.insert(schema.findings).values([
    {
      tenantId: tenant.id,
      dedupeKey: "inactive|a",
      rule: "inactive_90d",
      graphUserId: PII[4],
      title: `Inactive for 120 days: ${PII[0]}`,
      monthlyImpactCents: 3_600,
      detail: { upn: PII[1], displayName: PII[0], licenses },
    },
    {
      tenantId: tenant.id,
      dedupeKey: "disabled|b",
      rule: "disabled_account_with_license",
      graphUserId: "user-b",
      title: `Disabled account still licensed: ${PII[2]}`,
      status: "acknowledged",
      monthlyImpactCents: 3_600,
      detail: { upn: PII[3], displayName: PII[2], licenses },
    },
  ]);
  await currentDb.insert(schema.snapshots).values({
    tenantId: tenant.id,
    day: new Date().toISOString().slice(0, 10),
    totalMonthlySpendCents: 360_000,
    totalMonthlyWasteCents: 7_200,
  });
};

const expectNoPii = (text: string) => {
  for (const value of PII) expect(text).not.toContain(value);
  expect(text).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.-]+/);
};

afterEach(async () => {
  await currentDb.$client.close();
});

beforeEach(async () => {
  currentDb = await freshDb();
  tenant = await seedTenant(currentDb, 1, {
    name: "Contoso GmbH",
    activitySignal: "full",
  });
  plan = "pro";
  await seed();
});

describe("loadExecutiveSummary", () => {
  it("combines spend, open waste and the renewal plan without user PII", async () => {
    const summary = await loadExecutiveSummary(tenant, entitlement());
    expect(summary.workspace).toBe("Contoso GmbH");
    expect(summary.spend.monthlyCents).toBe(360_000);
    expect(summary.waste.openFindings).toBe(2);
    expect(summary.waste.monthlyCents).toBe(7_200);
    expect(summary.savings).not.toBeNull();
    expect(summary.renewals.actions[0]?.label).toBe("Microsoft 365 E3");
    expect(summary.trend.at(-1)?.wasteCents).toBe(7_200);
    expectNoPii(JSON.stringify(summary));
  });

  it("gives Free the teaser without the ledger or renewal names", async () => {
    plan = "free";
    const summary = await loadExecutiveSummary(tenant, entitlement());
    expect(summary.savings).toBeNull();
    expect(summary.renewals.actions).toEqual([]);
    expect(summary.renewals.count).toBe(1);
    expect(summary.waste.byRule).toEqual([]);
  });
});

describe("GET /api/reports/executive/pdf", () => {
  it("answers 402 on Free", async () => {
    plan = "free";
    const res = await GET();
    expect(res.status).toBe(402);
    expect(await res.json()).toMatchObject({ feature: "execReport" });
  });

  it("returns a one-page PDF without user PII and audits the export", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toMatch(
      /filename="licensemeter-executive-report-contoso-gmbh-\d{4}-\d{2}\.pdf"/,
    );
    const pdf = Buffer.from(await res.arrayBuffer());
    expect(pdfPages(pdf)).toHaveLength(1);
    const text = pdfText(pdf);
    expect(text).toContain("Contoso GmbH");
    expectNoPii(text);
    const entries = await currentDb.query.auditLog.findMany({
      where: eq(schema.auditLog.tenantId, tenant.id),
    });
    expect(entries.map((e) => e.action)).toContain("export_executive_report");
  });
});
