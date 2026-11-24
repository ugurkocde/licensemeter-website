import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "~/server/db/schema";
import {
  GraphHttpError,
  PremiumLicenseRequiredError,
} from "~/server/graph/types";
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
 * email and ops notifications, and the Next.js request
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

const logQuery = vi.fn<(query: string) => void>();

function makeDb(client: PGlite) {
  return drizzle(client, { schema, logger: { logQuery } });
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

const usageReport = (users: GraphUser[], date: string | null = null) => ({
  rows: users.map((user) => ({
    userPrincipalName: user.userPrincipalName,
    exchangeLastActivityDate: date,
    oneDriveLastActivityDate: null,
    sharePointLastActivityDate: null,
    teamsLastActivityDate: null,
  })),
  hasHeader: true,
  dataRowCount: users.length,
  reportRefreshDate: null,
});

/** A healthy fake Graph client; overrides let a test hook individual calls. */
function makeGraphClient(overrides: Partial<GraphClient> = {}): GraphClient {
  return {
    getOrganizationName: vi.fn(() => Promise.resolve<string | null>("Contoso")),
    getSubscribedSkus: vi.fn(() => Promise.resolve([SKU])),
    getReportConcealment: vi.fn(() => Promise.resolve<boolean | null>(false)),
    listUsers: vi.fn(() => Promise.resolve([GRAPH_USER])),
    getActiveUserDetail: vi.fn(() =>
      Promise.resolve(usageReport([GRAPH_USER])),
    ),
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
const { runAnalysis, runSync } = await import("~/server/sync/runSync");
const { disconnectMicrosoft, disconnectTenant, triggerSync } =
  await import("~/server/actions");

// --- helpers to read state ---------------------------------------------------

const countRows = async (table: PgTable): Promise<number> =>
  (await currentDb.select().from(table)).length;

const getRuns = () => currentDb.select().from(schema.syncRuns);

// --- per-test setup ----------------------------------------------------------

beforeEach(async ({ onTestFinished }) => {
  currentCtx = null;
  const client = new PGlite();
  onTestFinished(() => client.close());
  await seedSchema(client);
  currentDb = makeDb(client);

  notifyOpsMock.mockClear();
  sendWorkspaceDeletedMock.mockClear();
  workspaceAdminEmailsMock.mockClear();
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

    logQuery.mockClear();
    const result = await runSync(TENANT_ID, { client });
    const statements = logQuery.mock.calls.map(([query]) => query);
    const lock = statements.findIndex(
      (query) =>
        query.includes('from "tenants"') && query.endsWith("for no key update"),
    );
    const claim = statements.findIndex((query) =>
      query.startsWith('insert into "sync_runs"'),
    );
    expect(lock).toBeGreaterThanOrEqual(0);
    expect(claim).toBeGreaterThan(lock);

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

  it("returns an in-flight status and a retry message when repair holds the tenant lock", async ({
    onTestFinished,
  }) => {
    const tenant = await seedTenant();
    currentCtx = makeCtx(tenant, "admin");
    const transaction = currentDb.transaction.bind(currentDb);
    // PGlite has one connection. Assert the transaction's timeout and
    // simulate the PostgreSQL error raised by the competing lock.
    const transactionSpy = vi
      .spyOn(currentDb, "transaction")
      .mockImplementation((run, config) =>
        transaction(async (tx) => {
          vi.spyOn(tx, "select").mockImplementationOnce(() => {
            throw Object.assign(
              new Error("canceling statement due to lock timeout"),
              {
                code: "55P03",
              },
            );
          });
          return run(tx);
        }, config),
      );
    onTestFinished(() => {
      transactionSpy.mockRestore();
    });
    const client = makeGraphClient();
    logQuery.mockClear();
    await expect(runSync(TENANT_ID, { client })).resolves.toEqual({
      runId: null,
      status: "running",
      steps: [],
    });
    await expect(runAnalysis(TENANT_ID)).rejects.toThrow("then retry");
    expect(
      logQuery.mock.calls.filter(
        ([query]) => query === "set local lock_timeout = '5s'",
      ),
    ).toHaveLength(2);
    expect(await getRuns()).toEqual([]);
    // Avoid the fake connector's authenticated-client factory in the action.
    await currentDb.update(schema.tenants).set({ tid: null });
    await expect(triggerSync()).resolves.toMatchObject({
      ok: false,
      error: "Wait for the current workspace update to finish, then retry",
    });
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

describe("runSync failure alerts", () => {
  it("never forwards a value that a database error echoes", async () => {
    await seedTenant();
    const client = makeGraphClient({
      listUsers: vi.fn(async () => {
        // Postgres echoes the rejected value in its message.
        await currentDb.execute(sql`select ${"Alex Example"}::integer`);
        return [GRAPH_USER];
      }),
    });

    const result = await runSync(TENANT_ID, { client });

    expect(result.status).toBe("failed");
    const alerts = JSON.stringify(notifyOpsMock.mock.calls);
    expect(alerts).toContain("sync FAILED for workspace");
    expect(alerts).toContain("Database error 22P02");
    expect(alerts).not.toContain("Alex Example");
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
  it("rolls back earlier seat batches when a later batch fails", async () => {
    await seedTenant({ tid: null, consentedAt: null });
    await currentDb.insert(schema.saasConnections).values({
      tenantId: TENANT_ID,
      provider: "zoom",
      orgRef: "acct-1",
      clientId: "client",
      secretEnc: "enc",
    });
    await currentDb.insert(schema.saasSeats).values({
      tenantId: TENANT_ID,
      provider: "zoom",
      email: "existing@contoso.test",
      displayName: "Original",
      status: "active",
      products: ["Licensed"],
    });
    await currentDb.execute(sql`
      create function reject_later_seat() returns trigger language plpgsql as $$
      begin
        if NEW.email = 'seat250@contoso.test' then
          raise exception 'injected later batch failure';
        end if;
        return NEW;
      end $$;
    `);
    await currentDb.execute(sql`
      create trigger reject_later_seat before insert on saas_seats
      for each row execute function reject_later_seat();
    `);
    const seats = Array.from({ length: 251 }, (_, i) => ({
      email: i === 0 ? "existing@contoso.test" : `seat${i}@contoso.test`,
      displayName: "Changed",
      status: "active",
      products: ["Licensed"],
      lastActiveAt: null,
    }));
    buildSaasClientMock.mockImplementation(() =>
      Promise.resolve({
        getSeats: () => Promise.resolve(seats),
      }),
    );
    expect((await runSync(TENANT_ID)).status).toBe("failed");
    const stored = await currentDb.select().from(schema.saasSeats);
    expect(stored).toHaveLength(1);
    expect(stored[0]?.displayName).toBe("Original");
  });

  it("persists thousands of seats and findings without exceeding the bind limit", async () => {
    await seedTenant({ tid: null, consentedAt: null });
    await currentDb.insert(schema.saasConnections).values({
      tenantId: TENANT_ID,
      provider: "zoom",
      orgRef: "acct-1",
      clientId: "client",
      secretEnc: "enc",
    });
    const seats = Array.from({ length: 6500 }, (_, i) => ({
      email: `seat${i}@contoso.test`,
      displayName: `Seat ${i}`,
      status: "active",
      products: ["Licensed"],
      lastActiveAt: new Date(Date.now() - 200 * 86400000),
    }));
    buildSaasClientMock.mockImplementation(() =>
      Promise.resolve({
        getSeats: () => Promise.resolve(seats),
      }),
    );
    expect((await runSync(TENANT_ID)).status).toBe("success");
    expect(await countRows(schema.saasSeats)).toBe(6500);
    expect(await countRows(schema.findings)).toBe(6500);
  }, 30000);

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
        ).map((email): SaasSeat => ({
          email,
          displayName: null,
          status: "active",
          products: ["Licensed"],
          lastActiveAt: recent,
        })),
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

describe("runSync live step progress", () => {
  it("writes the steps so far to the running row before the run finishes", async () => {
    await seedTenant();
    let midRun: (typeof schema.syncRuns.$inferSelect)[] = [];
    // The usage report pull runs after the SKU, settings and user steps: the
    // running row must already carry those steps when it starts.
    const client = makeGraphClient({
      getActiveUserDetail: vi.fn(async () => {
        await vi.waitFor(async () => {
          midRun = await getRuns();
          expect(midRun[0]!.steps.map((s) => s.step)).toContain("users");
        });
        return usageReport([GRAPH_USER]);
      }),
    });

    const result = await runSync(TENANT_ID, { client });

    expect(midRun).toHaveLength(1);
    expect(midRun[0]!.status).toBe("running");
    expect(midRun[0]!.finishedAt).toBeNull();
    const midSteps = midRun[0]!.steps.map((s) => s.step);
    expect(midSteps).toContain("subscribedSkus");
    expect(midSteps).not.toContain("wasteAnalysis");
    // The final write carries the full log and the final status.
    expect(result.status).toBe("success");
    const [final] = await getRuns();
    expect(final!.status).toBe("success");
    expect(final!.steps).toEqual(result.steps);
    expect(final!.steps.map((s) => s.step)).toContain("wasteAnalysis");
  });

  it("a progress write landing after the final write leaves the final row untouched", async () => {
    await seedTenant();
    const result = await runSync(TENANT_ID, { client: makeGraphClient() });
    const { persistRunSteps } = await import("~/server/sync/stepProgress");

    expect(result.runId).not.toBeNull();
    await persistRunSteps(result.runId!, [
      { step: "subscribedSkus", status: "ok" },
    ]);

    const [run] = await getRuns();
    expect(run!.status).toBe("success");
    expect(run!.steps).toEqual(result.steps);
  });

  it("failing progress writes never fail the sync", async () => {
    await seedTenant();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    // Reject every progress write (a steps-only update of sync_runs); the
    // final write, which also sets the status, goes through.
    const realUpdate = currentDb.update.bind(currentDb);
    const update = vi
      .spyOn(currentDb, "update")
      .mockImplementation((table: PgTable) => {
        const builder = realUpdate(table);
        if (table !== schema.syncRuns) return builder;
        const realSet = builder.set.bind(builder);
        builder.set = (values: Record<string, unknown>) => {
          if (!("status" in values)) throw new Error("progress write refused");
          return realSet(values);
        };
        return builder;
      });

    const result = await runSync(TENANT_ID, { client: makeGraphClient() });

    expect(result.status).toBe("success");
    const [run] = await getRuns();
    expect(run!.status).toBe("success");
    expect(run!.steps).toEqual(result.steps);
    expect(warn).toHaveBeenCalledWith(
      "[sync] progress write failed",
      "progress write refused",
    );
    update.mockRestore();
    warn.mockRestore();
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

describe("runSync with unavailable Microsoft usage data", () => {
  const emptyReport = { ...usageReport([]), bodyBytes: 42 };
  const daysAgo = (days: number) =>
    new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const user = (id: string): GraphUser => ({
    ...GRAPH_USER,
    id,
    userPrincipalName: `${id}@example.test`,
    signInActivity: null,
  });
  const active = user("active");
  const inactive = user("inactive");
  const never = user("never");
  const directory = [active, inactive, never];
  const listUsers =
    (users: GraphUser[], hasP1 = false): GraphClient["listUsers"] =>
    async ({ includeSignInActivity }) => {
      if (!hasP1 && includeSignInActivity)
        throw new PremiumLicenseRequiredError();
      return users;
    };
  const sync = (overrides: Partial<GraphClient> = {}) =>
    runSync(TENANT_ID, {
      client: makeGraphClient({
        listUsers: listUsers(directory),
        getActiveUserDetail: async () => ({
          ...usageReport(directory),
          rows: [
            ...usageReport([active], daysAgo(2)).rows,
            ...usageReport([inactive], daysAgo(120)).rows,
            ...usageReport([never]).rows,
          ],
        }),
        ...overrides,
      }),
    });
  const storedUser = (graphId: string) =>
    currentDb.query.tenantUsers.findFirst({
      where: eq(schema.tenantUsers.graphId, graphId),
    });
  const storedTenant = () => currentDb.query.tenants.findFirst();
  const activityFindings = async () =>
    (await currentDb.query.findings.findMany())
      .filter((row) => ["inactive_90d", "never_active"].includes(row.rule))
      .sort((a, b) => a.dedupeKey.localeCompare(b.dedupeKey));

  it("keeps no activity coverage on both an initial and a repeated 403 without report history", async () => {
    await seedTenant();
    const denied = {
      getActiveUserDetail: async () => {
        throw new GraphHttpError(403, null, "Denied");
      },
    };
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await sync(denied);
      expect(
        result.steps.find((step) => step.step === "usageReports"),
      ).toMatchObject({
        status: "warning",
      });
      expect(await storedTenant()).toMatchObject({
        activitySignal: "none",
        usageReportUnavailable: false,
      });
      expect(await activityFindings()).toHaveLength(0);
    }
  });

  it("expires report history after 30 days when there are no stored dates or counts", async () => {
    await seedTenant();
    const baseline = await sync({
      getActiveUserDetail: async () => usageReport(directory),
    });
    const missing = { getActiveUserDetail: async () => emptyReport };
    await sync(missing);
    expect(await storedTenant()).toMatchObject({
      activitySignal: "unknown",
      usageReportUnavailable: true,
    });
    expect(baseline.runId).not.toBeNull();
    await currentDb
      .update(schema.syncRuns)
      .set({ startedAt: new Date(daysAgo(31)) })
      .where(eq(schema.syncRuns.id, baseline.runId!));

    await sync(missing);
    expect(await storedTenant()).toMatchObject({
      activitySignal: "none",
      usageReportUnavailable: false,
    });
  });

  it.each(["empty", "denied", "unmatched"])(
    "keeps workload dates and findings without P1 when the report is %s",
    async (kind) => {
      await seedTenant();
      await sync();
      const before = await activityFindings();
      expect(before.map((f) => [f.rule, f.graphUserId, f.status])).toEqual([
        ["inactive_90d", inactive.id, "open"],
        ["never_active", never.id, "open"],
      ]);
      const result = await sync({
        listUsers: listUsers([...directory, user("new-license")]),
        getActiveUserDetail: async () => {
          if (kind === "denied") throw new GraphHttpError(403, null, "Denied");
          return kind === "unmatched"
            ? usageReport([user("deleted")])
            : emptyReport;
        },
      });
      const step = result.steps.find((step) => step.step === "usageReports");
      expect(step?.status).toBe("warning");
      if (kind === "unmatched")
        expect(step?.message).toContain("no rows matched");
      expect(
        (await getRuns()).find((run) => run.id === result.runId)?.steps,
      ).toEqual(result.steps);
      expect(await storedUser(active.id)).toMatchObject({
        workloadActivity: { exchange: daysAgo(2) },
        lastActivity: new Date(daysAgo(2)),
      });
      expect(await storedTenant()).toMatchObject({
        activitySignal: "unknown",
        usageReportUnavailable: true,
      });
      expect(await activityFindings()).toMatchObject(
        before.map(({ id, status, lastSeenAt }) => ({
          id,
          status,
          lastSeenAt,
        })),
      );

      await sync({
        getActiveUserDetail: async () => usageReport(directory, daysAgo(1)),
      });
      expect(await storedTenant()).toMatchObject({
        activitySignal: "full",
        usageReportUnavailable: false,
      });
      expect((await activityFindings()).map((f) => f.status)).toEqual([
        "resolved",
        "resolved",
      ]);
    },
  );

  it.each(["empty", "denied"])(
    "uses fresh P1 sign-ins while preserving workloads when the report is %s",
    async (kind) => {
      await seedTenant();
      await sync({ listUsers: listUsers(directory, true) });
      await sync({
        listUsers: listUsers(
          [
            ...directory.map((entry) =>
              entry.id === inactive.id
                ? {
                    ...entry,
                    signInActivity: {
                      lastSignInDateTime: daysAgo(1),
                      lastNonInteractiveSignInDateTime: null,
                    },
                  }
                : entry,
            ),
            {
              ...user("old-sign-in"),
              signInActivity: {
                lastSignInDateTime: daysAgo(100),
                lastNonInteractiveSignInDateTime: null,
              },
            },
          ],
          true,
        ),
        getActiveUserDetail: async () => {
          if (kind === "denied") throw new GraphHttpError(403, null, "Denied");
          return emptyReport;
        },
      });
      expect(await storedTenant()).toMatchObject({
        activitySignal: "full",
        usageReportUnavailable: true,
      });
      expect(await storedUser(inactive.id)).toMatchObject({
        workloadActivity: { exchange: daysAgo(120) },
        lastActivity: new Date(daysAgo(1)),
      });
      expect(
        (await activityFindings()).map((f) => [f.graphUserId, f.status]),
      ).toEqual([
        [inactive.id, "resolved"],
        ["old-sign-in", "open"],
        [never.id, "open"],
      ]);
    },
  );

  it("resolves findings for removed licenses, deleted accounts and newly disabled users during an outage", async () => {
    await seedTenant();
    const removed = user("removed-license");
    await sync({
      listUsers: listUsers([...directory, removed]),
      getActiveUserDetail: async () => usageReport([...directory, removed]),
    });
    await sync({
      listUsers: listUsers([
        active,
        { ...never, accountEnabled: false },
        { ...removed, assignedLicenses: [] },
      ]),
      getActiveUserDetail: async () => emptyReport,
    });
    expect(await storedUser(inactive.id)).toBeUndefined();
    expect(await storedTenant()).toMatchObject({
      activitySignal: "unknown",
      usageReportUnavailable: true,
    });
    expect(
      (await activityFindings()).map((f) => [f.graphUserId, f.status]),
    ).toEqual([
      [active.id, "open"],
      [inactive.id, "resolved"],
      [never.id, "resolved"],
      [removed.id, "resolved"],
    ]);
    expect(
      await currentDb.query.findings.findFirst({
        where: eq(schema.findings.rule, "disabled_account_with_license"),
      }),
    ).toMatchObject({ graphUserId: never.id, status: "open" });
  });

  it("refreshes carried details after price and threshold changes without recording a new observation", async () => {
    await seedTenant();
    await sync();
    const neverKey = `never_active|${inactive.id}|-`;
    await currentDb.insert(schema.findings).values({
      tenantId: TENANT_ID,
      dedupeKey: neverKey,
      rule: "never_active",
      graphUserId: inactive.id,
      title: "Earlier finding",
      status: "acknowledged",
    });
    await sync({ getActiveUserDetail: async () => emptyReport });
    const before = await activityFindings();
    expect(before.filter((f) => f.graphUserId === inactive.id)).toHaveLength(2);

    await currentDb.update(schema.tenants).set({ inactiveDays: 180 });
    await currentDb
      .update(schema.priceBook)
      .set({ monthlyPriceCents: 7_500 })
      .where(eq(schema.priceBook.skuId, SKU.skuId));
    await currentDb
      .update(schema.tenantUsers)
      .set({
        displayName: "Renamed user",
        lastActivity: new Date(daysAgo(125)),
      })
      .where(eq(schema.tenantUsers.graphId, inactive.id));
    await runAnalysis(TENANT_ID);

    const after = await activityFindings();
    expect(after).toMatchObject(
      before.map(({ id, dedupeKey, rule, status, lastSeenAt }) => ({
        id,
        dedupeKey,
        rule,
        status,
        lastSeenAt,
      })),
    );
    expect(after[0]).toMatchObject({
      title: "No activity for 125 days: Renamed user",
      monthlyImpactCents: 7_500,
      detail: {
        inactiveDays: 125,
        inactiveThresholdDays: 180,
        licenses: [{ skuId: SKU.skuId, monthlyPriceCents: 7_500 }],
      },
    });
    expect(after.find((f) => f.dedupeKey === neverKey)).toMatchObject({
      title: "Licensed but never active: Renamed user",
      monthlyImpactCents: 7_500,
      status: "acknowledged",
    });
  });

  it.each(["license removal", "exclusion"])(
    "retains the last concealed aggregate during an outage until %s",
    async (change) => {
      await seedTenant();
      const concealed = {
        listUsers: listUsers([never]),
        getReportConcealment: async () => true,
      };
      await sync({
        ...concealed,
        getActiveUserDetail: async () =>
          usageReport([{ ...never, userPrincipalName: "a".repeat(32) }]),
      });
      const aggregate = () =>
        currentDb.query.findings.findFirst({
          where: eq(schema.findings.rule, "inactive_90d"),
        });
      const before = await aggregate();
      expect(before).toMatchObject({
        graphUserId: null,
        status: "open",
        detail: { aggregate: true },
      });

      await sync({
        ...concealed,
        getActiveUserDetail: async () => emptyReport,
      });
      await runAnalysis(TENANT_ID);
      expect(await aggregate()).toMatchObject({
        id: before?.id,
        status: "open",
        lastSeenAt: before?.lastSeenAt,
        detail: { aggregate: true },
      });
      expect(await storedTenant()).toMatchObject({
        concealedNames: true,
        usageReportUnavailable: true,
      });

      if (change === "license removal") {
        await sync({
          ...concealed,
          listUsers: listUsers([{ ...never, assignedLicenses: [] }]),
          getActiveUserDetail: async () => emptyReport,
        });
      } else {
        await currentDb
          .update(schema.tenants)
          .set({ findingExclusions: [never.userPrincipalName] });
        await runAnalysis(TENANT_ID);
      }
      expect(await aggregate()).toMatchObject({
        id: before?.id,
        status: "resolved",
      });
    },
  );

  it("does not reopen a concealed aggregate during an outage with an empty directory", async () => {
    await seedTenant();
    const listNoUsers = listUsers([]);
    await sync({
      listUsers: listNoUsers,
      getActiveUserDetail: async () =>
        usageReport([{ ...never, userPrincipalName: "a".repeat(32) }]),
    });
    expect(await activityFindings()).toMatchObject([{ status: "open" }]);

    await sync({
      listUsers: listNoUsers,
      getActiveUserDetail: async () => emptyReport,
    });
    expect(await storedTenant()).toMatchObject({
      activitySignal: "unknown",
      usageReportUnavailable: true,
    });
    await runAnalysis(TENANT_ID);
    expect(await activityFindings()).toMatchObject([{ status: "resolved" }]);
  });

  it("keeps a concealed aggregate when a licensed user appears during an outage", async () => {
    await seedTenant();
    await sync({
      listUsers: listUsers([]),
      getActiveUserDetail: async () =>
        usageReport([{ ...never, userPrincipalName: "a".repeat(32) }]),
    });
    const [before] = await activityFindings();
    expect(before).toMatchObject({ status: "open" });

    await sync({
      listUsers: listUsers([never]),
      getActiveUserDetail: async () => emptyReport,
    });
    expect(await storedTenant()).toMatchObject({
      activitySignal: "unknown",
      usageReportUnavailable: true,
    });
    await runAnalysis(TENANT_ID);
    expect(await activityFindings()).toMatchObject([
      { id: before?.id, status: "open" },
    ]);
  });

  it("accepts a report with a licensed match and a deleted user's row", async () => {
    await seedTenant();
    await sync();
    const result = await sync({
      getActiveUserDetail: async () =>
        usageReport([active, user("deleted")], daysAgo(1)),
    });
    expect(
      result.steps.find((step) => step.step === "usageReports"),
    ).toMatchObject({
      status: "ok",
      count: 2,
    });
    expect(await storedUser(active.id)).toMatchObject({
      workloadActivity: { exchange: daysAgo(1) },
    });
    expect(await storedTenant()).toMatchObject({
      usageReportUnavailable: false,
    });
  });

  it.each(["Entra-only license", "unlicensed user with consumed inventory"])(
    "accepts header-only history for a tenant with an %s",
    async (scenario) => {
      await seedTenant();
      const entraSku = {
        ...SKU,
        skuId: "sku-entra",
        skuPartNumber: "AAD_PREMIUM",
      };
      const list = [
        {
          ...active,
          assignedLicenses: scenario.startsWith("Entra")
            ? [{ skuId: entraSku.skuId, disabledPlans: [] }]
            : [],
        },
      ];
      const result = await sync({
        listUsers: listUsers(list, scenario.startsWith("Entra")),
        getSubscribedSkus: async () => [entraSku],
        getActiveUserDetail: async () => emptyReport,
      });
      expect(
        result.steps.find((step) => step.step === "usageReports"),
      ).toMatchObject({
        status: "ok",
        count: 0,
      });
      expect(await storedTenant()).toMatchObject({
        usageReportUnavailable: false,
      });
    },
  );
});
