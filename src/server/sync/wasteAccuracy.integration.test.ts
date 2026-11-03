import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

/**
 * Sync accuracy against a real PGlite database: catalog price refresh, trial
 * seats and renewal dates from /directory/subscriptions, zero-width part
 * numbers, step durations and admin exclusions. Graph is a fake client; email
 * and ops notifications are stubbed.
 */

let currentDb: TestDb;

vi.mock("~/env", () => ({
  env: { NODE_ENV: "test", AUTH_SECRET: "test-secret-test-secret-test-secret" },
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
  getActiveUserDetail: () => Promise.resolve([]),
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
    expect(snapshot!.purchasedSeats).toBe(100);
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
    const run = await currentDb.query.syncRuns.findFirst({
      where: eq(schema.syncRuns.id, result.runId),
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
