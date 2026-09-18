import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "~/server/db/schema";
import type {
  GraphClient,
  GraphSubscribedSku,
  GraphUser,
} from "~/server/graph/types";
import type { SaasSeat } from "~/server/types";

/**
 * Integration test for the sync lifecycle racing tenant teardown.
 *
 * The DB is a real
 * Drizzle/PGlite instance (fresh in-memory database per test, schema generated
 * straight from the Drizzle definitions), so the sync_runs_one_running_idx
 * partial unique index, the FK cascade rules and the diffFindings transaction
 * all execute with genuine Postgres semantics. Everything that leaves the
 * process is stubbed: Graph (injected fake client), MSAL,
 * WorkOS teardown, email and ops notifications, and the Next.js request
 * surface (apiAccess, headers, revalidate, redirect, after).
 *
 * Covered contracts:
 *  - one-running-sync lock: a concurrent runSync gets the in-flight run back
 *  - stale-run reaper: a dead "running" row is force-failed, the new run wins
 *  - runSync for a deleted tenant id: clean rejection, no rows written
 *  - tenant deleted mid-flight: the run resolves "failed" (no unhandled
 *    rejection) and the cascade leaves zero orphaned rows
 *  - disconnectMicrosoft during a running sync: dataset and Microsoft-rule
 *    findings purged, the running sync_runs row is left in place (tenant
 *    survives)
 *  - a workspace without any Microsoft credential but with a SaaS connection
 *    syncs: Microsoft steps skipped, seats persisted, run not failed
 *  - the same workspace with a CSV-imported directory: the leak rules use the
 *    stored users and the findings stay stable across repeated syncs
 *  - disconnectTenant during a running sync: the delete SUCCEEDS and the
 *    running run cascades away regardless of historical payment state
 */

// --- mutable test state, captured by the vi.mock factories below ------------

let currentDb: ReturnType<typeof makeDb>;

/** Minimal AccessContext shape; apiAccess is mocked to return this. */
type TestCtx = {
  user: {
    oid: string;
    tid: string;
    upn: string;
    name: string;
    isDemo: boolean;
  };
  tenant: typeof schema.tenants.$inferSelect;
  membership: {
    id: string;
    tenantId: string;
    oid: string | null;
    workosUserId: string | null;
    email: string;
    name: string | null;
    role: "viewer" | "admin" | "owner";
    createdAt: Date;
  };
  workspaces: never[];
  entitlement: Record<string, unknown>;
};
let currentCtx: TestCtx | null = null;

const notifyOpsMock = vi.fn(() => Promise.resolve());
const sendWorkspaceDeletedMock = vi.fn(() => Promise.resolve());
const workspaceAdminEmailsMock = vi.fn(() => Promise.resolve([] as string[]));
const teardownWorkosMock = vi.fn(() => Promise.resolve());
const revalidatePathMock = vi.fn();
// Deferred callbacks are captured, never executed: the disconnect paths under
// test do not depend on them (email is disabled via the ~/server/email mock).
const afterMock = vi.fn();
// Next's redirect throws by design; the sentinel lets tests assert on it.
const redirectMock = vi.fn((url: string): never => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});

vi.mock("~/env", () => ({
  env: { NODE_ENV: "test", AUTH_SECRET: "test-secret-test-secret-test-secret" },
  byoConnectorEnabled: () => true,
  authProvider: () => "entra",
  siteUrl: () => "http://localhost:3000",
  appBaseUrl: () => "http://localhost:3000",
}));

// Stable proxy so every module's `import { db }` binding always hits currentDb.
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

vi.mock("~/server/access", () => ({
  apiAccess: vi.fn(() => Promise.resolve(currentCtx)),
  WORKSPACE_COOKIE: "lm_ws",
  workspaceCookieOptions: () => ({}),
}));

vi.mock("~/server/ops", () => ({
  notifyOps: (...args: unknown[]) => notifyOpsMock(...(args as [])),
}));

vi.mock("~/server/email", () => ({
  emailEnabled: () => false,
  sendEmail: vi.fn(() => Promise.resolve()),
  leakAlertHtml: () => "",
  inviteHtml: () => "",
}));

vi.mock("~/server/workspaceEmail", () => ({
  sendWorkspaceDeleted: (...args: unknown[]) =>
    sendWorkspaceDeletedMock(...(args as [])),
  workspaceAdminEmails: (...args: unknown[]) =>
    workspaceAdminEmailsMock(...(args as [])),
}));

vi.mock("~/server/welcome", () => ({
  maybeSendWelcome: vi.fn(() => Promise.resolve()),
}));

vi.mock("~/server/auth/workos", () => ({
  teardownTenantWorkosOrg: (...args: unknown[]) =>
    teardownWorkosMock(...(args as [])),
}));

// actions.ts is imported for disconnect coverage; currency conversion itself
// is outside this suite and its server-only ECB client must not be evaluated.
vi.mock("~/server/exchangeRates", () => ({
  fetchEcbReferenceRates: vi.fn(() =>
    Promise.resolve({ asOf: "2026-07-09", perEur: { EUR: 1 } }),
  ),
}));

// Every test injects a fake GraphClient; the MSAL-backed factory must never run.
const msGraphClientForTenantMock = vi.fn(() => {
  throw new Error("msGraphClientForTenant must not be called in tests");
});
vi.mock("~/server/graph/msConnection", () => ({
  msGraphClientForTenant: () => msGraphClientForTenantMock(),
}));

// SaaS connectors are stubbed per test; the registry's other exports are real.
const buildSaasClientMock =
  vi.fn<() => Promise<{ getSeats: () => Promise<SaasSeat[]> }>>();
vi.mock("~/server/saas/registry", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  buildSaasClient: () => buildSaasClientMock(),
}));

// Connector secrets are stored encrypted; the fake client never needs them.
vi.mock("~/server/crypto", () => ({
  decryptSecret: () => "secret",
  encryptSecret: () => "enc",
  secretAad: () => "aad",
}));

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("next/headers", () => ({
  cookies: vi.fn(() =>
    Promise.resolve({ get: () => undefined, set: () => undefined }),
  ),
  headers: vi.fn(() => Promise.resolve(new Headers())),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirectMock(url),
}));
vi.mock("next/server", () => ({
  after: (...args: unknown[]) => {
    afterMock(...(args as []));
  },
}));

// --- DB harness --------------------------------------------------------------

/** DDL generated from the Drizzle schema, applied to fresh PGlite per test. */
let cachedDdl: string[] | null = null;
async function schemaDdl(): Promise<string[]> {
  cachedDdl ??= await generateMigration(
    generateDrizzleJson({}),
    generateDrizzleJson(schema),
  );
  return cachedDdl;
}

async function seedSchema(client: PGlite): Promise<void> {
  for (const stmt of await schemaDdl()) await client.exec(stmt);
}

function makeDb(client: PGlite) {
  return drizzle(client, { schema });
}

// --- fixtures ----------------------------------------------------------------

const TENANT_ID = "11111111-1111-1111-1111-111111111111";
const UNKNOWN_TENANT_ID = "99999999-9999-9999-9999-999999999999";
const TID = "eeeeeeee-0000-0000-0000-000000000001";

const SKU: GraphSubscribedSku = {
  skuId: "sku-e3",
  skuPartNumber: "ENTERPRISEPACK",
  capabilityStatus: "Enabled",
  consumedUnits: 1,
  prepaidUnits: { enabled: 5, suspended: 0, warning: 0 },
};

const GRAPH_USER: GraphUser = {
  id: "graph-user-1",
  displayName: "Test User",
  userPrincipalName: "user1@contoso.test",
  accountEnabled: true,
  userType: "Member",
  createdDateTime: "2024-01-01T00:00:00Z",
  assignedLicenses: [{ skuId: "sku-e3", disabledPlans: [] }],
  licenseAssignmentStates: null,
  signInActivity: {
    lastSignInDateTime: new Date().toISOString(),
    lastNonInteractiveSignInDateTime: null,
  },
};

/** A healthy fake Graph client; overrides let a test hook individual calls. */
function makeGraphClient(overrides: Partial<GraphClient> = {}): GraphClient {
  return {
    getOrganizationName: vi.fn(() => Promise.resolve<string | null>("Contoso")),
    getSubscribedSkus: vi.fn(() => Promise.resolve([SKU])),
    getReportConcealment: vi.fn(() => Promise.resolve<boolean | null>(false)),
    listUsers: vi.fn(() => Promise.resolve([GRAPH_USER])),
    getActiveUserDetail: vi.fn(() => Promise.resolve([])),
    getCopilotUsage: vi.fn(() => Promise.resolve([])),
    ...overrides,
  };
}

/** Insert a tenant and return the full row; overrides patch the defaults. */
async function seedTenant(
  overrides: Partial<typeof schema.tenants.$inferInsert> = {},
): Promise<typeof schema.tenants.$inferSelect> {
  const [row] = await currentDb
    .insert(schema.tenants)
    .values({ id: TENANT_ID, name: "Acme", ...overrides })
    .returning();
  return row!;
}

/** Insert a syncRuns row in status "running" and return its id. */
async function seedRunningRun(startedAt = new Date()): Promise<string> {
  const [row] = await currentDb
    .insert(schema.syncRuns)
    .values({ tenantId: TENANT_ID, status: "running", startedAt })
    .returning({ id: schema.syncRuns.id });
  return row!.id;
}

/** Seed the full Microsoft dataset a connected tenant carries. */
async function seedMicrosoftData(): Promise<void> {
  await currentDb.insert(schema.msConnections).values({
    tenantId: TENANT_ID,
    mode: "managed",
    tid: TID,
  });
  await currentDb.insert(schema.tenantUsers).values({
    tenantId: TENANT_ID,
    graphId: "graph-user-1",
    upn: "user1@contoso.test",
  });
  await currentDb.insert(schema.tenantSkus).values({
    tenantId: TENANT_ID,
    skuId: "sku-e3",
    skuPartNumber: "ENTERPRISEPACK",
  });
  await currentDb.insert(schema.snapshots).values({
    tenantId: TENANT_ID,
    day: "2026-07-01",
  });
  await currentDb.insert(schema.findings).values({
    tenantId: TENANT_ID,
    dedupeKey: "inactive_90d|graph-user-1|sku-e3",
    rule: "inactive_90d",
    title: "Inactive user holds a license",
  });
}

function makeCtx(
  tenant: typeof schema.tenants.$inferSelect,
  role: "admin" | "owner",
): TestCtx {
  return {
    user: {
      oid: "oid-1",
      tid: TID,
      upn: "admin@contoso.test",
      name: "Admin",
      isDemo: false,
    },
    tenant,
    membership: {
      id: "22222222-2222-2222-2222-222222222222",
      tenantId: tenant.id,
      oid: "oid-1",
      workosUserId: null,
      email: "admin@contoso.test",
      name: "Admin",
      role,
      createdAt: new Date(),
    },
    workspaces: [],
    entitlement: {},
  };
}

// Imported after the mocks are registered (top-level vi.mock is hoisted).
const { runSync } = await import("~/server/sync/runSync");
const { disconnectMicrosoft, disconnectTenant } =
  await import("~/server/actions");

// --- helpers to read state ---------------------------------------------------

const countRows = async (table: PgTable): Promise<number> =>
  (await currentDb.select().from(table)).length;

const getRuns = () => currentDb.select().from(schema.syncRuns);

// --- per-test setup ----------------------------------------------------------

beforeEach(async () => {
  currentCtx = null;
  const client = new PGlite();
  await seedSchema(client);
  currentDb = makeDb(client);

  notifyOpsMock.mockClear();
  sendWorkspaceDeletedMock.mockClear();
  workspaceAdminEmailsMock.mockClear();
  teardownWorkosMock.mockClear();
  revalidatePathMock.mockClear();
  afterMock.mockClear();
  redirectMock.mockClear();
  msGraphClientForTenantMock.mockClear();
  buildSaasClientMock.mockReset();
});

describe("runSync concurrency lock (sync_runs_one_running_idx)", () => {
  it("a second sync while one is running returns the in-flight run instead of starting another", async () => {
    await seedTenant();
    const inFlightId = await seedRunningRun();
    const getOrganizationName = vi.fn(() =>
      Promise.resolve<string | null>("Contoso"),
    );
    const client = makeGraphClient({ getOrganizationName });

    const result = await runSync(TENANT_ID, { client });

    expect(result.status).toBe("running");
    expect(result.runId).toBe(inFlightId);
    expect(result.steps).toEqual([]);
    // The partial unique index rejected the second insert: still exactly one
    // run, still running, and the second caller never pulled from Graph.
    const runs = await getRuns();
    expect(runs).toHaveLength(1);
    expect(runs[0]!.status).toBe("running");
    expect(getOrganizationName).not.toHaveBeenCalled();
  });

  it("a stale running run is force-failed and the new sync proceeds", async () => {
    await seedTenant();
    // Older than the 20-minute STALE_RUN_MS threshold in runSync.
    const staleId = await seedRunningRun(new Date(Date.now() - 25 * 60 * 1000));

    const result = await runSync(TENANT_ID, { client: makeGraphClient() });

    expect(result.status).toBe("success");
    const runs = await getRuns();
    expect(runs).toHaveLength(2);
    const stale = runs.find((r) => r.id === staleId);
    expect(stale?.status).toBe("failed");
    expect(stale?.error).toBe("stale run");
    expect(stale?.finishedAt).not.toBeNull();
    const fresh = runs.find((r) => r.id === result.runId);
    expect(fresh?.status).toBe("success");
    // The new run's writes actually landed.
    expect(await countRows(schema.tenantUsers)).toBe(1);
    expect(await countRows(schema.tenantSkus)).toBe(1);
    expect(await countRows(schema.snapshots)).toBe(1);
  });
});

describe("runSync against a deleted tenant", () => {
  it("an unknown tenant id rejects with a clean error and writes nothing", async () => {
    await expect(runSync(UNKNOWN_TENANT_ID)).rejects.toThrow(/Unknown tenant/);
    expect(await countRows(schema.syncRuns)).toBe(0);
  });

  it("tenant deleted mid-flight: the run resolves failed and the cascade leaves no orphans", async () => {
    await seedTenant();
    // The tenant vanishes during the pull phase (after the running row was
    // inserted), exactly what a concurrent disconnectTenant produces.
    const client = makeGraphClient({
      listUsers: vi.fn(async () => {
        await currentDb
          .delete(schema.tenants)
          .where(eq(schema.tenants.id, TENANT_ID));
        return [GRAPH_USER];
      }),
    });

    // Resolves (status "failed"), never an unhandled rejection: the persist
    // phase hits an FK violation (tenant row gone) that the outer catch
    // converts into a failed-run result.
    const result = await runSync(TENANT_ID, { client });

    expect(result.status).toBe("failed");
    // The running sync_runs row was cascade-deleted with the tenant, and the
    // catch-block finalizer updates zero rows instead of resurrecting it.
    // Nothing the sync wrote survives: zero orphaned rows anywhere.
    for (const table of [
      schema.tenants,
      schema.syncRuns,
      schema.tenantUsers,
      schema.tenantSkus,
      schema.snapshots,
      schema.findings,
    ]) {
      expect(await countRows(table)).toBe(0);
    }
    // The failure was reported to ops.
    expect(notifyOpsMock).toHaveBeenCalled();
  });
});

describe("runSync without a Microsoft connection", () => {
  it("skips the Microsoft steps, syncs the SaaS connector and does not fail", async () => {
    // No tid, no ms_connections row: resolveMsCredential would reject.
    await seedTenant({ tid: null, consentedAt: null });
    await currentDb.insert(schema.saasConnections).values({
      tenantId: TENANT_ID,
      provider: "zoom",
      orgRef: "acct-1",
      clientId: "client",
      secretEnc: "enc",
    });
    const getSeats = vi.fn(() =>
      Promise.resolve([
        {
          email: "Zoe@contoso.test",
          displayName: "Zoe",
          status: "active",
          products: ["Licensed"],
          lastActiveAt: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000),
        },
      ]),
    );
    buildSaasClientMock.mockImplementation(() => Promise.resolve({ getSeats }));

    const result = await runSync(TENANT_ID);

    expect(result.status).toBe("success");
    expect(msGraphClientForTenantMock).not.toHaveBeenCalled();
    const byStep = new Map(result.steps.map((s) => [s.step, s]));
    for (const step of [
      "subscribedSkus",
      "reportSettings",
      "users",
      "usageReports",
      "copilotUsage",
    ] as const) {
      expect(byStep.get(step)?.status).toBe("skipped");
    }
    expect(byStep.get("zoomSeats")).toMatchObject({ status: "ok", count: 1 });
    expect(byStep.get("wasteAnalysis")?.status).toBe("ok");
    // The seat landed and the connector was stamped.
    const seats = await currentDb.select().from(schema.saasSeats);
    expect(seats).toHaveLength(1);
    expect(seats[0]!.email).toBe("zoe@contoso.test");
    const [conn] = await currentDb.select().from(schema.saasConnections);
    expect(conn?.lastSyncStatus).toBe("ok");
    // No directory to correlate against: an inactivity finding from the
    // provider's own signal, but no orphan finding for every seat.
    const found = await currentDb.select().from(schema.findings);
    expect(found.map((f) => f.rule)).toEqual(["saas_inactive"]);
    expect(await countRows(schema.snapshots)).toBe(1);
    const [run] = await getRuns();
    expect(run?.status).toBe("success");
    expect(notifyOpsMock).not.toHaveBeenCalled();
  });

  it("correlates connector seats against a CSV-imported directory and keeps the findings stable", async () => {
    await seedTenant({ tid: null, consentedAt: null });
    await currentDb.insert(schema.saasConnections).values({
      tenantId: TENANT_ID,
      provider: "zoom",
      orgRef: "acct-1",
      clientId: "client",
      secretEnc: "enc",
    });
    // A CSV import fills tenant_users without any Microsoft connection.
    await currentDb.insert(schema.tenantUsers).values([
      {
        tenantId: TENANT_ID,
        graphId: "csv-user-1",
        upn: "zoe@contoso.test",
        displayName: "Zoe",
        accountEnabled: true,
      },
      {
        tenantId: TENANT_ID,
        graphId: "csv-user-2",
        upn: "dana@contoso.test",
        displayName: "Dana",
        accountEnabled: false,
      },
    ]);
    // All three seats were active recently, so inactivity never applies and
    // only the leak rules can produce findings.
    const recent = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const getSeats = vi.fn(() =>
      Promise.resolve(
        (
          [
            "Zoe@contoso.test",
            "dana@contoso.test",
            "ghost@contoso.test",
          ] as const
        ).map(
          (email): SaasSeat => ({
            email,
            displayName: null,
            status: "active",
            products: ["Licensed"],
            lastActiveAt: recent,
          }),
        ),
      ),
    );
    buildSaasClientMock.mockImplementation(() => Promise.resolve({ getSeats }));

    const first = await runSync(TENANT_ID);

    expect(first.status).toBe("success");
    const byStep = new Map(first.steps.map((s) => [s.step, s]));
    for (const step of [
      "subscribedSkus",
      "reportSettings",
      "users",
      "usageReports",
      "copilotUsage",
    ] as const) {
      expect(byStep.get(step)?.status).toBe("skipped");
    }
    const afterFirst = await currentDb.select().from(schema.findings);
    expect(
      afterFirst.map((f) => [f.rule, f.dedupeKey, f.status]).sort(),
    ).toEqual([
      [
        "saas_disabled_in_entra",
        "saas_disabled_in_entra|zoom:dana@contoso.test|-",
        "open",
      ],
      ["saas_orphaned", "saas_orphaned|zoom:ghost@contoso.test|-", "open"],
    ]);
    // The enabled, recently active user matched the directory: no finding.
    expect(afterFirst.some((f) => f.graphUserId === "csv-user-1")).toBe(false);

    const second = await runSync(TENANT_ID);

    expect(second.status).toBe("success");
    // No resolve-and-recreate flip-flop: the same two rows, still open.
    const afterSecond = await currentDb.select().from(schema.findings);
    expect(afterSecond.map((f) => f.id).sort()).toEqual(
      afterFirst.map((f) => f.id).sort(),
    );
    expect(afterSecond.every((f) => f.status === "open")).toBe(true);
    expect(afterSecond.every((f) => f.resolvedAt === null)).toBe(true);
  });
});

describe("disconnectMicrosoft during a running sync", () => {
  it("purges the Microsoft dataset but leaves the running run and findings in place", async () => {
    const tenant = await seedTenant({ tid: TID, consentedAt: new Date() });
    await seedMicrosoftData();
    const runId = await seedRunningRun();
    currentCtx = makeCtx(tenant, "admin");

    const res = await disconnectMicrosoft();

    expect(res.ok).toBe(true);
    // The consent-scoped Graph dataset is gone and the tid binding released.
    expect(await countRows(schema.msConnections)).toBe(0);
    expect(await countRows(schema.tenantUsers)).toBe(0);
    expect(await countRows(schema.tenantSkus)).toBe(0);
    expect(await countRows(schema.snapshots)).toBe(0);
    const after = await currentDb.query.tenants.findFirst({
      where: eq(schema.tenants.id, TENANT_ID),
    });
    expect(after?.tid).toBeNull();
    expect(after?.consentedAt).toBeNull();
    // ACTUAL guarantee: disconnect does NOT cancel or delete the in-flight
    // run. The row stays "running" (not orphaned: the tenant survives) until
    // the run finishes on its own or the stale reaper force-fails it.
    const runs = await getRuns();
    expect(runs).toHaveLength(1);
    expect(runs[0]!.id).toBe(runId);
    expect(runs[0]!.status).toBe("running");
    // Microsoft-rule findings carry directory names and go with the dataset.
    expect(await countRows(schema.findings)).toBe(0);
    // Durable audit row recorded before the analysis re-run.
    const audits = await currentDb.select().from(schema.auditLog);
    expect(audits.some((a) => a.action === "microsoft_disconnected")).toBe(
      true,
    );
  });
});

describe("disconnectTenant during a running sync", () => {
  it("the delete succeeds and cascades away the running run, users and findings", async () => {
    const tenant = await seedTenant({ tid: TID, consentedAt: new Date() });
    await seedMicrosoftData();
    await seedRunningRun();
    currentCtx = makeCtx(tenant, "owner");

    // disconnectTenant ends in redirect("/"), which throws by design.
    await expect(disconnectTenant()).rejects.toThrow("NEXT_REDIRECT:/");

    // The running run does NOT block the delete: everything cascades.
    for (const table of [
      schema.tenants,
      schema.syncRuns,
      schema.tenantUsers,
      schema.tenantSkus,
      schema.snapshots,
      schema.findings,
      schema.msConnections,
    ]) {
      expect(await countRows(table)).toBe(0);
    }
    // Ops receives the durable deletion signal.
    expect(notifyOpsMock).toHaveBeenCalledWith(
      expect.stringContaining("workspace deleted"),
    );
  });

  it("historical payment state cannot block workspace deletion", async () => {
    const tenant = await seedTenant({
      subscriptionStatus: "past_due",
      trialStartedAt: new Date("2020-01-01"),
      paidUntil: new Date("2020-01-15"),
    });
    await seedRunningRun();
    currentCtx = makeCtx(tenant, "owner");
    await expect(disconnectTenant()).rejects.toThrow("NEXT_REDIRECT:/");
    expect(await countRows(schema.tenants)).toBe(0);
    expect(await getRuns()).toHaveLength(0);
  });
});
