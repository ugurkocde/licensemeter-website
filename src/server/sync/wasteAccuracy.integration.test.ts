import { and, eq, sql } from "drizzle-orm";
import type * as NextNavigation from "next/navigation";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { entitlementOf } from "~/server/entitlement";
import * as schema from "~/server/db/schema";
import {
  GraphHttpError,
  type GraphClient,
  type GraphSubscribedSku,
  type GraphSubscription,
  type GraphUser,
} from "~/server/graph/types";
import {
  freshDb,
  seedTenant,
  tenantId,
  type TestDb,
} from "~/server/mcp/testHarness";
import { isShelfwareExempt, monthlyBilledSpendOf } from "~/server/waste/engine";

/**
 * Sync accuracy against a real PGlite database: catalog price refresh, trial
 * seats and renewal dates from /directory/subscriptions, zero-width part
 * numbers, step durations and admin exclusions. Graph is a fake client; email
 * and ops notifications are stubbed.
 */

let currentDb: TestDb;

vi.mock("server-only", () => ({}));

const testEnv = vi.hoisted(() => ({
  NODE_ENV: "test",
  AUTH_SECRET: "test-secret-test-secret-test-secret",
}));

vi.mock("~/env", () => ({
  env: testEnv,
  byoConnectorEnabled: () => true,
  siteUrl: () => "http://localhost:3000",
  appBaseUrl: () => "http://localhost:3000",
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

let uiPaid = false;
vi.mock("~/server/access", () => ({
  apiAccess: async () => ({
    tenant: await currentDb.query.tenants.findFirst({
      where: eq(schema.tenants.id, TENANT),
    }),
  }),
  requireAccess: async () => ({
    tenant: await currentDb.query.tenants.findFirst({
      where: eq(schema.tenants.id, TENANT),
    }),
    entitlement: entitlementOf({
      tenant: { isDemo: false },
      record: null,
      covered: true,
      billingEnabled: !uiPaid,
      now: new Date(),
    }),
    user: { isDemo: false },
    membership: {},
  }),
  hasRole: () => false,
}));
vi.mock("~/server/audit", () => ({ audit: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", async (load) => ({
  ...(await load<typeof NextNavigation>()),
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("~/server/ops", () => ({ notifyOps: vi.fn(() => Promise.resolve()) }));
vi.mock("~/server/email", () => ({
  emailEnabled: () => false,
  sendEmail: vi.fn(() => Promise.resolve()),
}));
vi.mock("~/server/workspaceEmail", () => ({
  workspaceAdminEmails: vi.fn(() => Promise.resolve([])),
}));
vi.mock("~/server/graph/msConnection", () => ({
  msGraphClientForTenant: () => {
    throw new Error("tests inject a fake Graph client");
  },
}));

const { runAnalysis, runSync } = await import("~/server/sync/runSync");
const { renderWasteReportPdf } = await import("~/server/report/renderReport");

const E3 = "05e9a617-0261-4cee-bb44-138d3ef5d965"; // 36.70 EUR in the catalog
const INTUNE_SUITE = "a929cd4d-8672-47c9-8664-159c1f322ba8"; // 9.40 EUR
const TEAMS_PREMIUM = "6432c818-bcef-43b6-9290-aec052964950"; // 9.40 EUR
const COPILOT = "639dec6b-bb19-468b-871c-c5c441c4b0cb";
const W365 = "e2aebe6c-897d-480f-9d62-fff1381581f7";

const sku = (
  skuId: string,
  skuPartNumber: string,
  prepaid: number,
  consumed: number,
): GraphSubscribedSku => ({
  skuId,
  skuPartNumber,
  capabilityStatus: "Enabled",
  consumedUnits: consumed,
  prepaidUnits: { enabled: prepaid, suspended: 0, warning: 0 },
});

const subscription = (
  overrides: Partial<GraphSubscription> & { skuId: string },
): GraphSubscription => ({
  skuPartNumber: "X",
  status: "Enabled",
  isTrial: false,
  totalLicenses: 0,
  nextLifecycleDateTime: null,
  ...overrides,
});

const graphUser = (
  id: string,
  upn: string,
  overrides: Partial<GraphUser> = {},
): GraphUser => ({
  id,
  displayName: upn.split("@")[0]!,
  userPrincipalName: upn,
  accountEnabled: true,
  userType: "Member",
  createdDateTime: "2024-01-01T00:00:00Z",
  assignedLicenses: [{ skuId: E3, disabledPlans: [] }],
  licenseAssignmentStates: null,
  signInActivity: {
    lastSignInDateTime: new Date().toISOString(),
    lastNonInteractiveSignInDateTime: null,
  },
  ...overrides,
});

const client = (
  skus: GraphSubscribedSku[],
  extra: Partial<GraphClient> = {},
  users: GraphUser[] = [graphUser("u-1", "alex@contoso.com")],
): GraphClient => ({
  getOrganizationName: () => Promise.resolve(null),
  getSubscribedSkus: () => Promise.resolve(skus),
  getReportConcealment: () => Promise.resolve(false),
  listUsers: () => Promise.resolve(users),
  getActiveUserDetail: () =>
    Promise.resolve({
      rows: users.map((user) => ({
        userPrincipalName: user.userPrincipalName,
        exchangeLastActivityDate: null,
        oneDriveLastActivityDate: null,
        sharePointLastActivityDate: null,
        teamsLastActivityDate: null,
      })),
      hasHeader: true,
      dataRowCount: users.length,
      reportRefreshDate: null,
    }),
  getCopilotUsage: () => Promise.resolve([]),
  ...extra,
});

let TENANT: string;

const skuRow = (skuId: string) =>
  currentDb.query.tenantSkus.findFirst({
    where: and(
      eq(schema.tenantSkus.tenantId, TENANT),
      eq(schema.tenantSkus.skuId, skuId),
    ),
  });

const openFindings = async () =>
  (
    await currentDb.query.findings.findMany({
      where: eq(schema.findings.tenantId, TENANT),
    })
  ).filter((f) => f.status !== "resolved");

beforeEach(async () => {
  currentDb = await freshDb();
  TENANT = (await seedTenant(currentDb, 1, { tid: tenantId(9) })).id;
});

afterEach(async () => {
  await currentDb.$client.close();
});

describe("catalog price refresh", () => {
  it("moves untouched 0 defaults to new catalog prices and never touches edited prices", async () => {
    await currentDb.insert(schema.priceBook).values([
      // Prefilled before the catalog knew these SKUs.
      { tenantId: TENANT, skuId: INTUNE_SUITE, monthlyPriceCents: 0 },
      // The customer entered 0 on purpose, and their own price elsewhere.
      {
        tenantId: TENANT,
        skuId: TEAMS_PREMIUM,
        monthlyPriceCents: 0,
        source: "custom",
      },
      {
        tenantId: TENANT,
        skuId: E3,
        monthlyPriceCents: 1234,
        source: "custom",
      },
      // A default with a value is left alone too.
      { tenantId: TENANT, skuId: COPILOT, monthlyPriceCents: 2500 },
    ]);

    const result = await runSync(TENANT, {
      client: client([
        sku(INTUNE_SUITE, "Microsoft_Intune_Suite", 10, 5),
        sku(TEAMS_PREMIUM, "M365_TEAMS_PREMIUM", 10, 5),
        sku(E3, "SPE_E3", 10, 10),
        sku(COPILOT, "Microsoft_365_Copilot", 5, 5),
      ]),
    });
    expect(result.status).toBe("success");

    const prices = Object.fromEntries(
      (
        await currentDb.query.priceBook.findMany({
          where: eq(schema.priceBook.tenantId, TENANT),
        })
      ).map((p) => [p.skuId, [p.monthlyPriceCents, p.source]]),
    );
    expect(prices).toEqual({
      [INTUNE_SUITE]: [940, "default"],
      [TEAMS_PREMIUM]: [0, "custom"],
      [E3]: [1234, "custom"],
      [COPILOT]: [2500, "default"],
    });
  });
});

describe("trial seats and renewal dates", () => {
  it("stores trial seats and the paid renewal date, and keeps trial seats out of waste", async () => {
    const result = await runSync(TENANT, {
      client: client(
        [
          sku(E3, "SPE_E3", 125, 90),
          sku(COPILOT, "Microsoft_365_Copilot", 25, 0),
        ],
        {
          getSubscriptions: () =>
            Promise.resolve([
              subscription({
                skuId: E3,
                totalLicenses: 100,
                nextLifecycleDateTime: "2027-03-01T00:00:00Z",
              }),
              subscription({
                skuId: E3,
                isTrial: true,
                totalLicenses: 25,
                nextLifecycleDateTime: "2026-12-01T00:00:00Z",
              }),
              subscription({
                skuId: COPILOT,
                isTrial: true,
                totalLicenses: 25,
                nextLifecycleDateTime: "2026-11-30T00:00:00Z",
              }),
              // Expired subscriptions do not count.
              subscription({
                skuId: E3,
                status: "Deleted",
                isTrial: true,
                totalLicenses: 50,
              }),
            ]),
        },
      ),
    });
    expect(result.status).toBe("success");
    expect(result.steps.find((s) => s.step === "subscriptions")).toMatchObject({
      status: "ok",
      count: 4,
    });

    expect(await skuRow(E3)).toMatchObject({
      trialUnits: 25,
      nextLifecycleAt: new Date("2027-03-01T00:00:00Z"),
    });
    // Only on trial: the date is when the trial ends.
    expect(await skuRow(COPILOT)).toMatchObject({
      trialUnits: 25,
      nextLifecycleAt: new Date("2026-11-30T00:00:00Z"),
    });

    const shelfware = (await openFindings()).filter(
      (f) => f.rule === "shelfware",
    );
    expect(shelfware.map((f) => [f.skuId, f.monthlyImpactCents])).toEqual([
      [E3, 10 * 3670],
    ]);
    const [snapshot] = await currentDb.query.snapshots.findMany({
      where: eq(schema.snapshots.tenantId, TENANT),
    });
    expect(snapshot).toMatchObject({
      purchasedSeats: 100,
      totalMonthlySpendCents: 100 * 3670,
    });
  });

  it("skips the step on 403 and counts every prepaid seat as before", async () => {
    const result = await runSync(TENANT, {
      client: client([sku(E3, "SPE_E3", 125, 90)], {
        getSubscriptions: () =>
          Promise.reject(
            new GraphHttpError(403, "Authorization_RequestDenied", "denied"),
          ),
      }),
    });
    expect(result.status).toBe("success");
    const step = result.steps.find((s) => s.step === "subscriptions");
    expect(step).toMatchObject({ status: "skipped" });
    expect(step!.message).not.toMatch(/Organization\.Read/);
    expect(await skuRow(E3)).toMatchObject({
      trialUnits: 0,
      nextLifecycleAt: null,
    });
    const [shelfware] = await openFindings();
    expect(shelfware).toMatchObject({
      rule: "shelfware",
      monthlyImpactCents: 35 * 3670,
    });
  });

  it("keeps the stored trial seats when the read fails transiently", async () => {
    const seats = [sku(E3, "SPE_E3", 125, 90)];
    await runSync(TENANT, {
      client: client(seats, {
        getSubscriptions: () =>
          Promise.resolve([
            subscription({ skuId: E3, isTrial: true, totalLicenses: 25 }),
          ]),
      }),
    });
    const result = await runSync(TENANT, {
      client: client(seats, {
        getSubscriptions: () =>
          Promise.reject(new GraphHttpError(503, "throttled", "busy")),
      }),
    });
    expect(result.status).toBe("success");
    expect(result.steps.find((s) => s.step === "subscriptions")).toMatchObject({
      status: "warning",
    });
    expect((await skuRow(E3))!.trialUnits).toBe(25);
    expect((await openFindings())[0]!.monthlyImpactCents).toBe(10 * 3670);
  });

  it("records the step as skipped for clients that cannot read subscriptions", async () => {
    const result = await runSync(TENANT, {
      client: client([sku(E3, "SPE_E3", 10, 10)]),
    });
    expect(result.steps.find((s) => s.step === "subscriptions")).toMatchObject({
      status: "skipped",
    });
  });
});

describe("ingest hygiene", () => {
  it("strips zero-width characters from stored part numbers", async () => {
    await currentDb.insert(schema.tenantSkus).values({
      tenantId: TENANT,
      skuId: W365,
      skuPartNumber: "CPC_E_2C_8GB_128GB​",
    });
    await runSync(TENANT, {
      client: client([sku(W365, "CPC_E_2C_8GB_128GB​", 5, 5)], {
        getSubscriptions: () =>
          Promise.resolve([
            subscription({
              skuId: W365,
              skuPartNumber: "CPC_E_2C_8GB_128GB​",
              totalLicenses: 5,
            }),
          ]),
      }),
    });
    expect(await skuRow(W365)).toMatchObject({
      skuPartNumber: "CPC_E_2C_8GB_128GB",
      displayName: "Windows 365 Enterprise 2 vCPU 8 GB 128 GB",
    });
  });

  it("records a duration on every step", async () => {
    const result = await runSync(TENANT, {
      client: client([sku(E3, "SPE_E3", 10, 10)]),
    });
    expect(result.steps.length).toBeGreaterThan(5);
    for (const step of result.steps) {
      expect(step.durationMs).toEqual(expect.any(Number));
      expect(step.durationMs).toBeGreaterThanOrEqual(0);
    }
    expect(result.runId).not.toBeNull();
    const run = await currentDb.query.syncRuns.findFirst({
      where: eq(schema.syncRuns.id, result.runId!),
    });
    expect(run!.steps.every((s) => typeof s.durationMs === "number")).toBe(
      true,
    );
  });
});

describe("admin exclusions", () => {
  it("resolves the findings of newly excluded accounts on the next analysis", async () => {
    const users = [
      graphUser("u-1", "svc-backup@contoso.com", { accountEnabled: false }),
      graphUser("u-2", "alex@contoso.com", { accountEnabled: false }),
    ];
    await runSync(TENANT, {
      client: client([sku(E3, "SPE_E3", 2, 2)], {}, users),
    });
    expect((await openFindings()).map((f) => f.graphUserId).sort()).toEqual([
      "u-1",
      "u-2",
    ]);

    await currentDb
      .update(schema.tenants)
      .set({ findingExclusions: ["SVC-*"] })
      .where(eq(schema.tenants.id, TENANT));
    await runAnalysis(TENANT);

    expect((await openFindings()).map((f) => f.graphUserId)).toEqual(["u-2"]);
    const resolved = await currentDb.query.findings.findFirst({
      where: eq(schema.findings.graphUserId, "u-1"),
    });
    expect(resolved).toMatchObject({ status: "resolved" });
    expect(resolved!.resolvedAt).not.toBeNull();
  });
});

describe("subscriptions budget", () => {
  it("reads subscriptions after the users pull with a short deadline of its own", async () => {
    let received: number | undefined;
    const startedAt = Date.now();
    const result = await runSync(TENANT, {
      deadline: startedAt + 250_000,
      client: client([sku(E3, "SPE_E3", 10, 10)], {
        getSubscriptions: (deadline) => {
          received = deadline;
          return Promise.resolve([]);
        },
      }),
    });
    const order = result.steps.map((s) => s.step);
    expect(order.indexOf("subscriptions")).toBeGreaterThan(
      order.indexOf("users"),
    );
    expect(received).toBeGreaterThan(startedAt);
    expect(received! - startedAt).toBeLessThanOrEqual(21_000);
  });

  it("skips the read and keeps stored trial data when too little time is left", async () => {
    const seats = [sku(E3, "SPE_E3", 125, 90)];
    await runSync(TENANT, {
      client: client(seats, {
        getSubscriptions: () =>
          Promise.resolve([
            subscription({ skuId: E3, isTrial: true, totalLicenses: 25 }),
          ]),
      }),
    });
    const getSubscriptions = vi.fn(() => Promise.resolve([]));
    const result = await runSync(TENANT, {
      deadline: Date.now() + 61_000,
      client: client(seats, { getSubscriptions }),
    });
    expect(getSubscriptions).not.toHaveBeenCalled();
    expect(result.status).toBe("success");
    expect(result.steps.find((s) => s.step === "subscriptions")).toMatchObject({
      status: "skipped",
    });
    expect((await skuRow(E3))!.trialUnits).toBe(25);
  });

  it("never fails the sync when the read runs out of time", async () => {
    const result = await runSync(TENANT, {
      client: client([sku(E3, "SPE_E3", 10, 10)], {
        getSubscriptions: () =>
          Promise.reject(
            new GraphHttpError(504, "deadline_exceeded", "deadline reached"),
          ),
      }),
    });
    expect(result.status).toBe("success");
    expect(result.steps.find((s) => s.step === "subscriptions")).toMatchObject({
      status: "warning",
    });
    expect(result.steps.find((s) => s.step === "users")).toMatchObject({
      status: "ok",
    });
  });
});

describe("assigned trial licenses during sync", () => {
  it("prices a disabled user holding only a trial-only license at 0", async () => {
    await runSync(TENANT, {
      client: client(
        [sku(COPILOT, "Microsoft_365_Copilot", 25, 1)],
        {
          getSubscriptions: () =>
            Promise.resolve([
              subscription({
                skuId: COPILOT,
                isTrial: true,
                totalLicenses: 25,
              }),
            ]),
        },
        [
          graphUser("u-1", "alex@contoso.com", {
            accountEnabled: false,
            assignedLicenses: [{ skuId: COPILOT, disabledPlans: [] }],
          }),
        ],
      ),
    });
    const findings = await openFindings();
    expect(findings.map((f) => [f.rule, f.monthlyImpactCents])).toEqual([
      ["disabled_account_with_license", 0],
    ]);
    const [snapshot] = await currentDb.query.snapshots.findMany({
      where: eq(schema.snapshots.tenantId, TENANT),
    });
    expect(snapshot!.totalMonthlySpendCents).toBe(0);
  });
});

describe("same-day snapshots", () => {
  const snapshot = async () =>
    (
      await currentDb.query.snapshots.findMany({
        where: eq(schema.snapshots.tenantId, TENANT),
      })
    )[0]!;

  it("recalculates billed spend and comparable seat totals on sync and reanalysis", async () => {
    const seats = [
      sku(E3, "SPE_E3", 125, 90),
      sku("sku-flow-free", "FLOW_FREE", 200, 117),
      sku("sku-capacity", "WINDOWS_STORE", 1_000_000, 3),
    ];
    await currentDb.insert(schema.priceBook).values(
      seats.slice(1).map(({ skuId }) => ({
        tenantId: TENANT,
        skuId,
        monthlyPriceCents: 500,
        source: "custom" as const,
      })),
    );
    await runSync(TENANT, { client: client(seats) });
    expect(await snapshot()).toMatchObject({
      purchasedSeats: 125,
      assignedSeats: 90,
      totalMonthlySpendCents: 125 * 3670,
    });
    expect((await snapshot()).bySku).toEqual({
      [E3]: { purchased: 125, assigned: 90 },
    });

    await runSync(TENANT, {
      client: client(seats, {
        getSubscriptions: () =>
          Promise.resolve([
            subscription({ skuId: E3, isTrial: true, totalLicenses: 25 }),
          ]),
      }),
    });
    expect(await snapshot()).toMatchObject({
      purchasedSeats: 100,
      assignedSeats: 90,
      totalMonthlySpendCents: 100 * 3670,
    });
    expect((await snapshot()).bySku).toEqual({
      [E3]: { purchased: 100, assigned: 90 },
    });

    await currentDb
      .update(schema.tenantSkus)
      .set({ trialUnits: 50 })
      .where(
        and(
          eq(schema.tenantSkus.tenantId, TENANT),
          eq(schema.tenantSkus.skuId, E3),
        ),
      );
    await runAnalysis(TENANT);
    expect(await snapshot()).toMatchObject({
      purchasedSeats: 75,
      assignedSeats: 90,
      totalMonthlySpendCents: 75 * 3670,
    });
    expect((await snapshot()).bySku).toEqual({
      [E3]: { purchased: 75, assigned: 90 },
    });

    const skus = await currentDb.query.tenantSkus.findMany({
      where: eq(schema.tenantSkus.tenantId, TENANT),
    });
    const prices = await currentDb.query.priceBook.findMany({
      where: eq(schema.priceBook.tenantId, TENANT),
    });
    const priceBySku = new Map(
      prices.map((p) => [p.skuId, p.monthlyPriceCents]),
    );
    expect(priceBySku.get("sku-flow-free")).toBe(500);
    expect(priceBySku.get("sku-capacity")).toBe(500);
    // Overview and Licenses pass the filtered inventory to the same helper.
    const visibleSkus = skus.filter(
      (s) => !isShelfwareExempt(s.skuPartNumber, s.skuId),
    );
    const inventorySpend = monthlyBilledSpendOf(
      visibleSkus,
      (skuId) => priceBySku.get(skuId) ?? 0,
    );
    const pdf = await renderWasteReportPdf(TENANT);
    expect(pdf.buffer.subarray(0, 4).toString()).toBe("%PDF");
    expect(pdf.monthlySpendCents).toBe(inventorySpend);
    expect((await snapshot()).totalMonthlySpendCents).toBe(inventorySpend);
  });
});

describe("admin exclusions across connectors", () => {
  const seedSeats = async () => {
    for (const email of ["svc-backup@contoso.com", "alex@contoso.com"]) {
      await currentDb.insert(schema.adobeUsers).values({
        tenantId: TENANT,
        email,
        products: ["Acrobat Pro"],
      });
      await currentDb.insert(schema.saasSeats).values({
        tenantId: TENANT,
        provider: "chatgpt",
        email,
        products: ["Business"],
      });
    }
  };
  const users = [
    graphUser("u-svc", "svc-backup@contoso.com", { accountEnabled: false }),
    graphUser("u-alex", "alex@contoso.com", { accountEnabled: false }),
  ];
  const open = async () =>
    (await openFindings()).map((f) => `${f.rule}:${f.graphUserId}`).sort();

  it("drops Microsoft, Adobe and SaaS findings of excluded accounts without inventing orphans", async () => {
    await seedSeats();
    const msClient = client([sku(E3, "SPE_E3", 2, 2)], {}, users);
    await runSync(TENANT, { client: msClient });
    await runAnalysis(TENANT); // stored Adobe seats join the analysis here
    expect(await open()).toEqual([
      "adobe_disabled_in_entra:u-alex",
      "adobe_disabled_in_entra:u-svc",
      "disabled_account_with_license:u-alex",
      "disabled_account_with_license:u-svc",
      "saas_disabled_in_entra:u-alex",
      "saas_disabled_in_entra:u-svc",
    ]);

    await currentDb
      .update(schema.tenants)
      .set({ findingExclusions: ["SVC-*"] })
      .where(eq(schema.tenants.id, TENANT));
    await runAnalysis(TENANT);
    const expected = [
      "adobe_disabled_in_entra:u-alex",
      "disabled_account_with_license:u-alex",
      "saas_disabled_in_entra:u-alex",
    ];
    expect(await open()).toEqual(expected);
    const svc = await currentDb.query.findings.findMany({
      where: eq(schema.findings.tenantId, TENANT),
    });
    expect(
      svc
        .filter((f) => f.dedupeKey.includes("svc-backup"))
        .every((f) => f.status === "resolved"),
    ).toBe(true);

    // The sync path applies the same exclusions to connector seats.
    await runSync(TENANT, { client: msClient });
    expect((await open()).filter((f) => !f.startsWith("adobe"))).toEqual(
      expected.filter((f) => !f.startsWith("adobe")),
    );
    expect((await open()).some((f) => f.includes("orphaned"))).toBe(false);
  });
});

describe("connector seats on mail aliases", () => {
  const svc = graphUser("u-svc", "svc-backup@contoso.com", {
    accountEnabled: false,
    mail: "backup@contoso.com",
    proxyAddresses: ["SMTP:backup@contoso.com", "smtp:svc@contoso.com"],
  });
  const seedAliasSeats = async () => {
    await currentDb.insert(schema.adobeUsers).values({
      tenantId: TENANT,
      email: "backup@contoso.com",
      products: ["Acrobat Pro"],
    });
    await currentDb.insert(schema.saasSeats).values([
      {
        tenantId: TENANT,
        provider: "chatgpt",
        email: "svc@contoso.com",
        products: ["Business"],
      },
      // A seat whose vendor name imitates an excluded service account but
      // has no directory user behind it: it must stay an orphan.
      {
        tenantId: TENANT,
        provider: "chatgpt",
        email: "leaked@fabrikam.com",
        displayName: "svc-backup",
        products: ["Business"],
      },
    ]);
  };
  const connectorRules = async () =>
    (await openFindings())
      .filter((f) => !f.rule.startsWith("disabled_account"))
      .map((f) => `${f.rule}:${f.graphUserId ?? f.dedupeKey}`)
      .sort();

  it("stores the aliases and keeps alias seats correlated on reanalysis", async () => {
    await seedAliasSeats();
    await runSync(TENANT, {
      client: client([sku(E3, "SPE_E3", 1, 1)], {}, [svc]),
    });
    const stored = await currentDb.query.tenantUsers.findFirst({
      where: eq(schema.tenantUsers.graphId, "u-svc"),
    });
    expect(stored!.mailAliases).toEqual([
      "backup@contoso.com",
      "svc@contoso.com",
    ]);

    await runAnalysis(TENANT);
    expect(await connectorRules()).toEqual([
      "adobe_disabled_in_entra:u-svc",
      "saas_disabled_in_entra:u-svc",
      "saas_orphaned:saas_orphaned|chatgpt:leaked@fabrikam.com|-",
    ]);
  });

  it("excludes alias seats of excluded users after saving, and never hides an orphan", async () => {
    await seedAliasSeats();
    await runSync(TENANT, {
      client: client([sku(E3, "SPE_E3", 1, 1)], {}, [svc]),
    });
    await currentDb
      .update(schema.tenants)
      .set({ findingExclusions: ["svc-*"] })
      .where(eq(schema.tenants.id, TENANT));
    await runAnalysis(TENANT);

    expect(await connectorRules()).toEqual([
      "saas_orphaned:saas_orphaned|chatgpt:leaked@fabrikam.com|-",
    ]);
    expect(
      (await openFindings()).some((f) => f.rule === "adobe_orphaned"),
    ).toBe(false);
  });
});

describe("addresses shared by several directory users", () => {
  // A is excluded and lists B's UPN as an alias; B is disabled and is not.
  const a = graphUser("u-a", "svc-a@contoso.com", {
    mail: "svc-a@contoso.com",
    proxyAddresses: ["smtp:b@contoso.com"],
  });
  const b = graphUser("u-b", "b@contoso.com", { accountEnabled: false });

  it.each([
    ["A first", [a, b]],
    ["B first", [b, a]],
  ])(
    "reports B's seat with %s, in sync and reanalysis",
    async (_order, users) => {
      await currentDb
        .update(schema.tenants)
        .set({ findingExclusions: ["svc-*"] })
        .where(eq(schema.tenants.id, TENANT));
      await currentDb.insert(schema.saasSeats).values({
        tenantId: TENANT,
        provider: "chatgpt",
        email: "b@contoso.com",
        products: ["Business"],
      });
      const rules = async () =>
        (await openFindings())
          .filter((f) => f.rule.startsWith("saas"))
          .map((f) => `${f.rule}:${f.graphUserId}`);
      await runSync(TENANT, {
        client: client([sku(E3, "SPE_E3", 2, 2)], {}, users),
      });
      expect(await rules()).toEqual(["saas_disabled_in_entra:u-b"]);
      await runAnalysis(TENANT);
      expect(await rules()).toEqual(["saas_disabled_in_entra:u-b"]);
    },
  );
});

const entriesFor = () => currentDb.select().from(schema.savingsLedger);
const activeEntries = async () =>
  (await entriesFor()).filter((entry) => entry.reversedAt === null);

it.each(["same sync", "sequential syncs"])(
  "credits exactly three seats for a four-to-one purchase cut in %s",
  async (sequence) => {
    const { loadRecentSavings, loadSavingsLedger } =
      await import("~/server/savings/ledger");
    const active = graphUser("active", "active@example.test");
    const disabled = graphUser("disabled", "disabled@example.test", {
      accountEnabled: false,
    });
    const before = client([sku(E3, "SPE_E3", 4, 2)], {}, [active, disabled]);
    const after = client([sku(E3, "SPE_E3", 1, 1)], {}, [active]);
    await runSync(TENANT, { client: before });
    if (sequence === "sequential syncs") {
      await runSync(TENANT, {
        client: client([sku(E3, "SPE_E3", 4, 1)], {}, [active]),
      });
      const initialCredit = await activeEntries();
      expect(initialCredit).toEqual([
        expect.objectContaining({
          reason: "license_removed",
          seats: 1,
          skuId: E3,
          monthlyCents: 3670,
        }),
      ]);
      expect(initialCredit[0]?.subjectKey).toMatch(
        /^[0-9a-f]{16}:[0-9a-f]{64}$/,
      );
    }
    await runSync(TENANT, { client: after });
    await runSync(TENANT, { client: after });
    expect(await activeEntries()).toEqual([
      expect.objectContaining({
        reason: "seats_reduced",
        seats: 3,
        skuId: E3,
        monthlyCents: 11010,
      }),
    ]);
    if (sequence === "sequential syncs") {
      expect(
        (await entriesFor()).find((entry) => entry.reason === "license_removed")
          ?.reversedAt,
      ).toBeInstanceOf(Date);
    }
    expect(await loadRecentSavings(TENANT, "EUR")).toEqual({
      cents: 11010,
      reclaimed: 1,
      noLongerFlagged: sequence === "same sync" ? 1 : 0,
      reasonNotRecorded: 0,
    });
    expect((await loadSavingsLedger(TENANT, "EUR")).runRate).toBe(11010);

    await runSync(TENANT, { client: before });
    expect(await activeEntries()).toEqual([]);
  },
);

it("reverses a removal when a different rule opens for the same person and SKU", async () => {
  const old = graphUser("member", "member@example.test", {
    accountEnabled: false,
  });
  await runSync(TENANT, {
    client: client([sku(E3, "SPE_E3", 4, 1)], {}, [old]),
  });
  await runSync(TENANT, {
    client: client([sku(E3, "SPE_E3", 4, 0)], {}, [
      { ...old, assignedLicenses: [] },
    ]),
  });
  expect(await activeEntries()).toEqual([
    expect.objectContaining({ reason: "license_removed", seats: 1 }),
  ]);

  const inactive = {
    ...old,
    accountEnabled: true,
    signInActivity: {
      lastSignInDateTime: "2024-02-01T00:00:00Z",
      lastNonInteractiveSignInDateTime: null,
    },
  };
  await runSync(TENANT, {
    client: client([sku(E3, "SPE_E3", 4, 1)], {}, [inactive]),
  });
  expect(
    (await openFindings()).some((row) => row.rule === "inactive_90d"),
  ).toBe(true);
  expect(await activeEntries()).toEqual([]);
});

it("keeps the 24-month series and list bounded while accruing old savings", async () => {
  const { loadSavingsLedger } = await import("~/server/savings/ledger");
  await currentDb.insert(schema.savingsLedger).values([
    {
      tenantId: TENANT,
      rule: "shelfware",
      vendor: "Microsoft",
      skuId: E3,
      seats: 1,
      reason: "seats_reduced",
      monthlyCents: 1000,
      currency: "EUR",
      realizedAt: new Date("2023-01-16T12:00:00Z"),
      reversedAt: new Date("2023-02-15T00:00:00Z"),
    },
    {
      tenantId: TENANT,
      rule: "shelfware",
      vendor: "Microsoft",
      skuId: E3,
      seats: 1,
      reason: "seats_reduced",
      monthlyCents: 2000,
      currency: "EUR",
      realizedAt: new Date("2026-01-16T12:00:00Z"),
    },
  ]);
  const ledger = await loadSavingsLedger(
    TENANT,
    "EUR",
    new Date("2026-02-15T00:00:00Z"),
  );
  expect(ledger.entries).toEqual([
    expect.objectContaining({ monthlyCents: 2000 }),
  ]);
  expect(ledger.series).toHaveLength(24);
  expect(ledger.series.at(-2)).toEqual({ month: "2026-01", cents: 2000 });
  expect(ledger.cumulative).toBe(3000);
  expect(ledger.runRate).toBe(2000);
});

it("caps report waste at comparable purchased spend", async () => {
  const { renderWasteReportPdf } = await import("~/server/report/renderReport");
  const report = vi.spyOn(
    await import("~/server/report/WasteReport"),
    "WasteReport",
  );
  await runSync(TENANT, { client: client([sku(E3, "SPE_E3", 1, 0)]) });
  await currentDb
    .update(schema.findings)
    .set({ monthlyImpactCents: 100000 })
    .where(eq(schema.findings.tenantId, TENANT));
  try {
    const pdf = await renderWasteReportPdf(TENANT);
    expect(pdf).toMatchObject({
      monthlySpendCents: 3670,
      monthlyWasteCents: 3670,
    });
    const { fmtMoney } = await import("~/lib/format");
    expect(report.mock.lastCall?.[0].data.capAdjustment).toBe(
      `${fmtMoney(3670 - 100000, "EUR")}/mo`,
    );
    await currentDb.update(schema.findings).set({ monthlyImpactCents: 1000 });
    await renderWasteReportPdf(TENANT);
    expect(report.mock.lastCall?.[0].data.capAdjustment).toBeUndefined();
  } finally {
    report.mockRestore();
  }
});

it("does not credit an unchanged Adobe product after an email domain change", async () => {
  const before = graphUser("member", "member@old.example.test", {
    accountEnabled: false,
  });
  await runSync(TENANT, {
    client: client([sku(E3, "SPE_E3", 1, 1)], {}, [before]),
  });
  const originalSeat = {
    tenantId: TENANT,
    email: before.userPrincipalName,
    products: ["Product"],
    status: "active",
  };
  await currentDb.insert(schema.adobeUsers).values(originalSeat);
  await currentDb.insert(schema.priceBook).values({
    tenantId: TENANT,
    skuId: "adobe:Product",
    monthlyPriceCents: 2500,
  });
  await runAnalysis(TENANT);
  const original = (await openFindings()).find(
    (row) => row.rule === "adobe_disabled_in_entra",
  )!;
  expect(original.monthlyImpactCents).toBe(2500);
  await currentDb.update(schema.tenantUsers).set({
    upn: "member@new.example.test",
    mailAliases: ["alias@new.example.test"],
    accountEnabled: true,
  });
  await currentDb
    .update(schema.adobeUsers)
    .set({ email: "alias@new.example.test" });
  await runAnalysis(TENANT, { verifiedSources: new Set(["adobe"]) });
  expect(
    (
      await currentDb.query.findings.findFirst({
        where: eq(schema.findings.id, original.id),
      })
    )?.resolutionReason,
  ).toBe("activity_resumed");
  expect(await entriesFor()).toEqual([]);
});

it("does not credit a product-label rename on CSV re-import", async () => {
  const { importSeats } = await import("~/server/actions");
  const person = graphUser("member", "member@example.test", {
    accountEnabled: false,
  });
  await runSync(TENANT, {
    client: client([sku(E3, "SPE_E3", 1, 1)], {}, [person]),
  });
  await currentDb.insert(schema.priceBook).values({
    tenantId: TENANT,
    skuId: "chatgpt:Original",
    monthlyPriceCents: 2500,
  });
  const importProduct = async (product: string) => {
    const form = new FormData();
    form.set("provider", "chatgpt");
    form.set("csv", `Email,Plan\n${person.userPrincipalName},${product}`);
    expect(await importSeats(form)).toMatchObject({ ok: true, imported: 1 });
  };
  await importProduct("Original");
  const original = (await openFindings()).find(
    (row) => row.rule === "saas_disabled_in_entra",
  )!;
  expect(original.monthlyImpactCents).toBe(2500);
  await currentDb.update(schema.tenantUsers).set({ accountEnabled: true });
  await importProduct("Renamed");
  expect(
    (
      await currentDb.query.findings.findFirst({
        where: eq(schema.findings.id, original.id),
      })
    )?.resolutionReason,
  ).toBe("activity_resumed");
  expect(await entriesFor()).toEqual([]);
});

it.each(["Microsoft", "Adobe", "Zoom", "ChatGPT"])(
  "reverses only %s ledger entries when its source disconnects",
  async (vendor) => {
    const {
      clearImportedSeats,
      disconnectAdobe,
      disconnectMicrosoft,
      disconnectSaasConnector,
    } = await import("~/server/actions");
    const [finding] = await currentDb
      .insert(schema.findings)
      .values({
        tenantId: TENANT,
        rule: "shelfware",
        dedupeKey: "shelfware-test",
        title: "Idle seats",
        status: "resolved",
      })
      .returning();
    const sourceEntries = [
      {
        vendor: "Microsoft",
        rule: "shelfware",
        findingId: finding!.id,
        skuId: E3,
      },
      { vendor: "Adobe", rule: "adobe_disabled_in_entra" },
      { vendor: "Zoom", rule: "saas_disabled_in_entra" },
      { vendor: "ChatGPT", rule: "saas_disabled_in_entra" },
    ] as const;
    await currentDb.insert(schema.savingsLedger).values(
      sourceEntries.map((entry) => ({
        ...entry,
        tenantId: TENANT,
        seats: 1,
        monthlyCents: 1000,
        currency: "EUR",
        reason: "license_removed" as const,
        realizedAt: new Date("2026-01-01T00:00:00Z"),
      })),
    );
    const disconnect = {
      Microsoft: disconnectMicrosoft,
      Adobe: disconnectAdobe,
      Zoom: () => disconnectSaasConnector("zoom"),
      ChatGPT: () => clearImportedSeats("chatgpt"),
    };
    expect(await disconnect[vendor as keyof typeof disconnect]()).toEqual({
      ok: true,
    });
    const entries = await entriesFor();
    expect(entries).toHaveLength(4);
    expect(
      entries.find((entry) => entry.vendor === vendor)?.reversedAt,
    ).toBeInstanceOf(Date);
    expect(
      entries
        .filter((entry) => entry.reversedAt === null)
        .map((entry) => entry.vendor)
        .sort(),
    ).toEqual(
      sourceEntries
        .map((entry) => entry.vendor)
        .filter((source) => source !== vendor)
        .sort(),
    );
    if (vendor === "Microsoft")
      expect(
        entries.find((entry) => entry.vendor === vendor)?.findingId,
      ).toBeNull();
  },
);

it("renders Free overview and savings without Pro confidence or ledger rows, and caps overview waste", async () => {
  const { default: OverviewPage } = await import("~/app/app/(dash)/page");
  const { default: SavingsPage } =
    await import("~/app/app/(dash)/savings/page");
  const ledgerModule = await import("~/server/savings/ledger");
  const ledgerSpy = vi.spyOn(ledgerModule, "loadSavingsLedger");
  const cardSpy = vi.spyOn(
    await import("~/components/workspace/MetricCards"),
    "MetricCards",
  );
  try {
    await runSync(TENANT, { client: client([sku(E3, "SPE_E3", 1, 0)]) });
    await currentDb
      .update(schema.findings)
      .set({ monthlyImpactCents: 100000 })
      .where(eq(schema.findings.tenantId, TENANT));
    await currentDb.insert(schema.savingsLedger).values({
      tenantId: TENANT,
      rule: "shelfware",
      vendor: "Fixture vendor",
      seats: 1,
      monthlyCents: 1000,
      currency: "EUR",
      reason: "seats_reduced",
      realizedAt: new Date(),
    });
    const overview = renderToStaticMarkup(
      await OverviewPage({ searchParams: Promise.resolve({}) }),
    );
    const savings = renderToStaticMarkup(await SavingsPage());
    for (const html of [overview, savings]) {
      expect(html).toContain("Start 30-day trial");
      expect(html).not.toMatch(
        /from your prices|List estimates|Fixture vendor|Ledger entries/,
      );
    }
    expect(ledgerSpy).not.toHaveBeenCalled();
    expect(overview).toContain("Price accuracy");
    expect(overview).toContain("More than recorded spend");
    const { fmtMoney } = await import("~/lib/format");
    const cards = cardSpy.mock.lastCall?.[0].cards;
    for (const [key, period] of [
      ["waste", 1],
      ["annual", 12],
    ] as const) {
      expect(
        cards?.find((card) => card.key === key)?.detail?.rows.at(-1),
      ).toMatchObject({
        label: "Capped at comparable spend",
        value: fmtMoney((3670 - 100000) * period, "EUR"),
      });
    }

    await currentDb.update(schema.findings).set({ monthlyImpactCents: 1000 });
    uiPaid = true;
    const proOverview = renderToStaticMarkup(
      await OverviewPage({ searchParams: Promise.resolve({}) }),
    );
    const proSavings = renderToStaticMarkup(await SavingsPage());
    expect(proOverview).toContain("Price accuracy");
    expect(proOverview).toContain("from your prices");
    for (const key of ["waste", "annual"]) {
      const card = cardSpy.mock.lastCall?.[0].cards.find(
        (card) => card.key === key,
      );
      expect(card?.detail?.rows.map((row) => row.label)).not.toContain(
        "Capped at comparable spend",
      );
    }
    expect(proSavings).toContain("Fixture vendor");
  } finally {
    uiPaid = false;
    cardSpy.mockRestore();
    ledgerSpy.mockRestore();
  }
});

it("commits a partially invalid paste without awarding a removal credit", async () => {
  const { importSeats } = await import("~/server/actions");
  const person = graphUser("member", "member@example.test", {
    accountEnabled: false,
  });
  await runSync(TENANT, {
    client: client([sku(E3, "SPE_E3", 1, 1)], {}, [person]),
  });
  await currentDb.insert(schema.priceBook).values({
    tenantId: TENANT,
    skuId: "chatgpt:Plan",
    monthlyPriceCents: 2500,
  });

  const form = new FormData();
  form.set("provider", "chatgpt");
  form.set("csv", "Email,Plan\nmember@example.test,Plan");
  expect(await importSeats(form)).toMatchObject({
    ok: true,
    imported: 1,
    invalid: 0,
  });
  expect(
    (await openFindings()).some((row) => row.rule === "saas_disabled_in_entra"),
  ).toBe(true);

  form.set(
    "csv",
    "Email,Plan\nmember.example.test,Plan\nreplacement@example.test,Plan",
  );
  expect(await importSeats(form)).toMatchObject({
    ok: true,
    imported: 1,
    invalid: 1,
  });
  expect(await currentDb.query.saasSeats.findMany()).toEqual([
    expect.objectContaining({ email: "replacement@example.test" }),
  ]);
  expect(await entriesFor()).toEqual([]);
});

it.each([
  "oversized paste",
  "unclosed quote",
  "currency change",
  "ledger failure",
])(
  "preserves the roster and savings when a replacement import hits a %s",
  async (failure) => {
    const { importSeats } = await import("~/server/actions");
    await currentDb.insert(schema.priceBook).values({
      tenantId: TENANT,
      skuId: "chatgpt:Plan",
      monthlyPriceCents: 2500,
    });
    const form = new FormData();
    form.set("provider", "chatgpt");
    form.set(
      "csv",
      "Email,Plan,Last active\nmember@example.test,Plan,2024-01-01",
    );
    expect(await importSeats(form)).toMatchObject({ ok: true, imported: 1 });
    const original = await currentDb.query.saasSeats.findMany();
    expect(await openFindings()).toEqual([
      expect.objectContaining({ rule: "saas_inactive" }),
    ]);

    const replacement = "Email,Plan\nreplacement@example.test,Other";
    form.set("csv", replacement);
    if (failure === "oversized paste") {
      form.set("csv", replacement + "x".repeat(1_000_000));
      expect(await importSeats(form)).toMatchObject({
        ok: false,
        error:
          "The paste is too large. Import the complete member export in one paste.",
      });
    } else if (failure === "unclosed quote") {
      form.set(
        "csv",
        'Email,Plan\nreplacement@example.test,"Other\nmember@example.test,Plan',
      );
      expect(await importSeats(form)).toMatchObject({
        ok: false,
        error:
          "The member export contains an unclosed quote. Paste the complete export again.",
      });
    } else if (failure === "currency change") {
      const realTransaction = currentDb.transaction.bind(currentDb);
      const transaction = vi
        .spyOn(currentDb, "transaction")
        .mockImplementationOnce(async (fn, config) => {
          await currentDb.update(schema.tenants).set({ currency: "USD" });
          return realTransaction(fn, config);
        });
      try {
        expect(await importSeats(form)).toMatchObject({
          ok: false,
          error: "The workspace currency changed. Retry the import.",
        });
      } finally {
        transaction.mockRestore();
      }
    } else {
      await currentDb.execute(
        sql`alter table savings_ledger add constraint fixture_reject_credit check (false)`,
      );
      await expect(importSeats(form)).rejects.toThrow("insert into");
      await currentDb.execute(
        sql`alter table savings_ledger drop constraint fixture_reject_credit`,
      );
    }

    expect(await currentDb.query.saasSeats.findMany()).toEqual(original);
    expect(await openFindings()).toEqual([
      expect.objectContaining({ rule: "saas_inactive" }),
    ]);
    expect(await currentDb.query.priceBook.findMany()).toEqual([
      expect.objectContaining({ skuId: "chatgpt:Plan" }),
    ]);
    expect(await entriesFor()).toEqual([]);

    form.set("csv", replacement);
    expect(await importSeats(form)).toMatchObject({ ok: true, imported: 1 });
    expect(await importSeats(form)).toMatchObject({ ok: true, imported: 1 });
    expect(await currentDb.query.saasSeats.findMany()).toEqual([
      expect.objectContaining({ email: "replacement@example.test" }),
    ]);
    expect(await activeEntries()).toEqual([
      expect.objectContaining({
        currency: failure === "currency change" ? "USD" : "EUR",
        product: "plan",
        reason: "license_removed",
        seats: 1,
        monthlyCents: 2500,
      }),
    ]);
  },
);

it("reverses only the returned SKU when a multi-license finding reopens", async () => {
  const disabled = graphUser("member", "member@example.test", {
    accountEnabled: false,
    assignedLicenses: [
      { skuId: E3, disabledPlans: [] },
      { skuId: INTUNE_SUITE, disabledPlans: [] },
    ],
  });
  const run = async (e3Assigned: boolean, intuneAssigned: boolean) =>
    runSync(TENANT, {
      client: client(
        [
          sku(E3, "SPE_E3", 2, Number(e3Assigned)),
          sku(
            INTUNE_SUITE,
            "Microsoft_Intune_Suite",
            2,
            Number(intuneAssigned),
          ),
        ],
        {},
        [
          {
            ...disabled,
            assignedLicenses: disabled.assignedLicenses.filter(({ skuId }) =>
              skuId === E3 ? e3Assigned : intuneAssigned,
            ),
          },
        ],
      ),
    });
  await run(true, true);
  const finding = (await openFindings()).find(
    ({ rule }) => rule === "disabled_account_with_license",
  )!;
  await run(false, false);
  expect(await activeEntries()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ findingId: finding.id, skuId: E3 }),
      expect.objectContaining({ findingId: finding.id, skuId: INTUNE_SUITE }),
    ]),
  );
  await run(true, false);
  expect(await openFindings()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: finding.id, status: "open" }),
    ]),
  );
  expect(await activeEntries()).toEqual([
    expect.objectContaining({ findingId: finding.id, skuId: INTUNE_SUITE }),
  ]);
  expect(
    (await entriesFor()).find(({ skuId }) => skuId === E3)?.reversedAt,
  ).toBeInstanceOf(Date);
});

it.each([8, 10])(
  "credits flagged removals from a fully assigned 10-seat SKU only if paid seats drop to %i",
  async (paid) => {
    const retained = Array.from({ length: 8 }, (_, i) =>
      graphUser(`retained-${i}`, `retained-${i}@example.test`),
    );
    const disabled = Array.from({ length: 2 }, (_, i) =>
      graphUser(`disabled-${i}`, `disabled-${i}@example.test`, {
        accountEnabled: false,
      }),
    );
    await runSync(TENANT, {
      client: client([sku(E3, "SPE_E3", 10, 10)], {}, [
        ...retained,
        ...disabled,
      ]),
    });
    expect((await openFindings()).map(({ rule }) => rule)).toEqual([
      "disabled_account_with_license",
      "disabled_account_with_license",
    ]);

    const replacements =
      paid === 10
        ? [
            graphUser("replacement-1", "replacement-1@example.test"),
            graphUser("replacement-2", "replacement-2@example.test"),
          ]
        : [];
    const after = client([sku(E3, "SPE_E3", paid, paid)], {}, [
      ...retained,
      ...replacements,
    ]);
    await runSync(TENANT, { client: after });
    await runSync(TENANT, { client: after });
    const entries = await activeEntries();
    expect(entries).toHaveLength(10 - paid);
    for (const entry of entries) {
      expect(entry).toMatchObject({
        skuId: E3,
        seats: 1,
        reason: "seats_reduced",
        monthlyCents: 3670,
      });
    }
    expect(await entriesFor()).toHaveLength(10 - paid);
  },
);

it("counts a same-sync reassignment under No seat released using a read-only ledger snapshot", async () => {
  const { loadRecentSavings, loadSavingsLedger, RESOLUTION_LABELS } =
    await import("~/server/savings/ledger");
  const disabled = graphUser("disabled", "disabled@example.test", {
    accountEnabled: false,
  });
  await runSync(TENANT, {
    client: client([sku(E3, "SPE_E3", 1, 1)], {}, [disabled]),
  });
  await runSync(TENANT, { client: client([sku(E3, "SPE_E3", 1, 1)], {}, []) });
  await runSync(TENANT, {
    client: client([sku(E3, "SPE_E3", 1, 1)], {}, [
      graphUser("other", "other@example.test"),
    ]),
  });
  expect(await entriesFor()).toEqual([]);
  expect(
    await currentDb.query.findings.findFirst({
      where: eq(schema.findings.rule, "disabled_account_with_license"),
    }),
  ).toMatchObject({ status: "resolved", resolutionReason: "license_removed" });

  const tx = vi.spyOn(currentDb, "transaction");
  try {
    const ledger = await loadSavingsLedger(TENANT, "EUR");
    expect(tx).toHaveBeenCalledExactlyOnceWith(expect.any(Function), {
      isolationLevel: "repeatable read",
      accessMode: "read only",
    });
    expect(ledger.noLongerFlagged).toEqual([
      { reason: "no_seat_released", count: 1 },
    ]);
    expect(RESOLUTION_LABELS.no_seat_released).toBe("No seat released");
    expect(ledger).toMatchObject({ entries: [], runRate: 0, cumulative: 0 });
    expect(await loadRecentSavings(TENANT, "EUR")).toMatchObject({
      noLongerFlagged: 1,
      cents: 0,
    });
  } finally {
    tx.mockRestore();
  }
});

it("preserves trial-only increases and accrues a partial restock without counting overlapping time", async () => {
  const { loadSavingsLedger } = await import("~/server/savings/ledger");
  const run = (prepaid: number, assigned: number, trials = 0) =>
    runSync(TENANT, {
      client: client([sku(E3, "SPE_E3", prepaid, assigned)], {
        getSubscriptions: async () => [
          subscription({ skuId: E3, isTrial: true, totalLicenses: trials }),
        ],
      }),
    });
  vi.useFakeTimers({ toFake: ["Date"] });
  try {
    vi.setSystemTime(new Date("2026-01-02T00:00:00Z"));
    await run(10, 6);
    vi.setSystemTime(new Date("2026-02-01T00:00:00Z"));
    await run(6, 6);
    const [original] = await activeEntries();
    expect(original).toMatchObject({ seats: 4, monthlyCents: 14680 });

    vi.setSystemTime(new Date("2026-02-15T00:00:00Z"));
    await run(7, 6, 1);
    expect(await activeEntries()).toEqual([original]);

    vi.setSystemTime(new Date("2026-03-01T00:00:00Z"));
    await run(8, 7, 1);
    const [successor] = await activeEntries();
    expect(successor).toMatchObject({
      replacesEntryId: original!.id,
      realizedAt: original!.realizedAt,
      createdAt: new Date(),
      seats: 3,
      monthlyCents: 11010,
    });
    expect(await loadSavingsLedger(TENANT, "EUR")).toMatchObject({
      cumulative: 14680,
      runRate: 11010,
      realizedThisMonth: 0,
    });
    expect(
      (await entriesFor()).find((row) => row.id === original!.id)?.reversedAt,
    ).toEqual(new Date());

    vi.setSystemTime(new Date("2026-04-01T00:00:00Z"));
    await run(11, 10, 1);
    expect(await activeEntries()).toEqual([]);
    expect(await loadSavingsLedger(TENANT, "EUR")).toMatchObject({
      cumulative: 25690,
      runRate: 0,
      realizedThisMonth: 0,
    });
  } finally {
    vi.useRealTimers();
  }
});

it("replaces an earlier removal credit with a purchase credit while shelfware stays open", async () => {
  const active = graphUser("active", "active@example.test");
  const disabled = graphUser("disabled", "disabled@example.test", {
    accountEnabled: false,
  });
  await runSync(TENANT, {
    client: client([sku(E3, "SPE_E3", 10, 8)], {}, [active, disabled]),
  });
  await runSync(TENANT, {
    client: client([sku(E3, "SPE_E3", 10, 7)], {}, [active]),
  });
  expect(await activeEntries()).toEqual([
    expect.objectContaining({ reason: "license_removed", seats: 1 }),
  ]);
  const [shelfware] = (await openFindings()).filter(
    (row) => row.rule === "shelfware",
  );
  await runSync(TENANT, {
    client: client([sku(E3, "SPE_E3", 9, 7)], {}, [active]),
  });
  expect(await activeEntries()).toEqual([
    expect.objectContaining({
      reason: "seats_reduced",
      seats: 1,
      findingId: shelfware!.id,
    }),
  ]);
  expect(
    (await openFindings()).find((row) => row.id === shelfware!.id)?.detail,
  ).toMatchObject({ unassigned: 2 });
});

it("rolls back inventory with a failed ledger write and credits the retry exactly once", async () => {
  await runSync(TENANT, { client: client([sku(E3, "SPE_E3", 10, 8)]) });
  await currentDb.execute(
    sql`alter table savings_ledger add constraint fixture_reject_credit check (false)`,
  );
  const after = client([sku(E3, "SPE_E3", 8, 8)]);
  expect((await runSync(TENANT, { client: after })).status).toBe("failed");
  expect(await skuRow(E3)).toMatchObject({ prepaidEnabled: 10 });
  expect((await openFindings()).some((row) => row.rule === "shelfware")).toBe(
    true,
  );
  expect(await entriesFor()).toEqual([]);

  await currentDb.execute(
    sql`alter table savings_ledger drop constraint fixture_reject_credit`,
  );
  expect((await runSync(TENANT, { client: after })).status).toBe("success");
  expect((await runSync(TENANT, { client: after })).status).toBe("success");
  expect(await skuRow(E3)).toMatchObject({ prepaidEnabled: 8 });
  expect(await entriesFor()).toEqual([
    expect.objectContaining({
      reason: "seats_reduced",
      seats: 2,
      monthlyCents: 7340,
    }),
  ]);
});

it("snapshots retained SKU inventory and clears the seat counts for a verified empty pull", async () => {
  await runSync(TENANT, { client: client([sku(E3, "SPE_E3", 10, 8)]) });
  await runSync(TENANT, { client: client([]) });
  expect(await currentDb.query.snapshots.findFirst()).toMatchObject({
    purchasedSeats: 10,
    assignedSeats: 8,
    bySku: { [E3]: { purchased: 10, assigned: 8 } },
    totalMonthlySpendCents: 36700,
  });
  const member = graphUser("member", "member@example.test", {
    assignedLicenses: [],
  });
  await runSync(TENANT, { client: client([], {}, [member]) });
  expect(await currentDb.query.snapshots.findFirst()).toMatchObject({
    purchasedSeats: 0,
    assignedSeats: 0,
    bySku: {},
    totalMonthlySpendCents: 0,
  });
});

it("ends the sync as partial if currency changes after pricing and retries in the new currency", async () => {
  await runSync(TENANT, { client: client([sku(E3, "SPE_E3", 10, 8)]) });
  const realTransaction = currentDb.transaction.bind(currentDb);
  const transaction = vi
    .spyOn(currentDb, "transaction")
    .mockImplementationOnce(async (fn, config) => {
      const priced = await realTransaction(fn, config);
      await currentDb
        .update(schema.tenants)
        .set({ currency: "USD", currencyRatePpm: 1_200_000 });
      await currentDb.update(schema.priceBook).set({ monthlyPriceCents: 4404 });
      return priced;
    });
  const after = client([sku(E3, "SPE_E3", 8, 8)]);
  try {
    const result = await runSync(TENANT, { client: after });
    expect(result.status).toBe("partial");
    const step = result.steps.find((step) => step.step === "wasteAnalysis");
    expect(step?.status).toBe("warning");
    expect(step?.message).toContain("currency changed");
    expect(await skuRow(E3)).toMatchObject({ prepaidEnabled: 10 });
    expect(await entriesFor()).toEqual([]);
  } finally {
    transaction.mockRestore();
  }
  expect((await runSync(TENANT, { client: after })).status).toBe("success");
  expect(await activeEntries()).toEqual([
    expect.objectContaining({ seats: 2, currency: "USD", monthlyCents: 8808 }),
  ]);
});

it("reverses unreadable subject keys and preserves unkeyed purchase credits after rotation", async () => {
  const beforeSecret = testEnv.AUTH_SECRET;
  const disabled = graphUser("disabled", "disabled@example.test", {
    accountEnabled: false,
  });
  const removed = client([sku(E3, "SPE_E3", 5, 0)], {}, [
    { ...disabled, assignedLicenses: [] },
  ]);
  await runSync(TENANT, {
    client: client([sku(E3, "SPE_E3", 6, 1)], {}, [disabled]),
  });
  await runSync(TENANT, {
    client: client([sku(E3, "SPE_E3", 5, 1)], {}, [disabled]),
  });
  await runSync(TENANT, { client: removed });
  const credits = await activeEntries();
  const credit = credits.find((row) => row.reason === "license_removed");
  expect(credit?.subjectKey).toMatch(/^[0-9a-f]{16}:[0-9a-f]{64}$/);
  const purchase = credits.find((row) => row.reason === "seats_reduced");
  expect(purchase).toMatchObject({ subjectKey: null });
  try {
    testEnv.AUTH_SECRET = "rotated-fixture-secret-with-test-length";
    await runSync(TENANT, { client: removed });
    expect(await activeEntries()).toEqual([purchase]);
    expect(
      (await entriesFor()).find((row) => row.id === credit!.id)?.reversedAt,
    ).toBeInstanceOf(Date);
    await runSync(TENANT, { client: removed });
    expect(await activeEntries()).toHaveLength(1);
  } finally {
    testEnv.AUTH_SECRET = beforeSecret;
  }
});

it("retires a removal credit if another assignment consumes the freed capacity on a later sync", async () => {
  const active = graphUser("active", "active@example.test");
  const disabled = graphUser("disabled", "disabled@example.test", {
    accountEnabled: false,
  });
  await runSync(TENANT, {
    client: client([sku(E3, "SPE_E3", 4, 2)], {}, [active, disabled]),
  });
  await runSync(TENANT, {
    client: client([sku(E3, "SPE_E3", 4, 1)], {}, [active]),
  });
  const [credit] = await activeEntries();
  expect(credit).toMatchObject({ reason: "license_removed", seats: 1 });
  await runSync(TENANT, {
    client: client([sku(E3, "SPE_E3", 4, 2)], {}, [
      active,
      graphUser("replacement", "replacement@example.test"),
    ]),
  });
  expect(await activeEntries()).toEqual([]);
  expect(
    (await entriesFor()).find((entry) => entry.id === credit!.id)?.reversedAt,
  ).toBeInstanceOf(Date);
});
