import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq, sql } from "drizzle-orm";
import {
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { NextRequest } from "next/server";
import * as schema from "~/server/db/schema";
import type { MeteringSource } from "./graph";
import type * as MeteringGraphModule from "./graph";

let database: ReturnType<typeof makeDb>;
const client = new PGlite();
const access = vi.fn();
const verify = vi.fn();
vi.mock("~/env", () => ({
  env: { METERING_CLIENT_ID: "metering-client" },
  appBaseUrl: () => "https://app.test",
}));
vi.mock("~/server/db", () => ({
  db: new Proxy(
    {},
    {
      get: (_t, prop) =>
        (database as unknown as Record<string | symbol, unknown>)[prop],
    },
  ),
}));
vi.mock("~/server/access", () => ({
  apiAccess: access,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("~/server/audit", () => ({ audit: vi.fn() }));
vi.mock("~/server/rateLimit", () => ({ rateLimitDurable: async () => true }));
vi.mock("~/server/auth/origin", () => ({
  isSameOrigin: (req: Request) =>
    !req.headers.get("origin") ||
    req.headers.get("origin") === "https://app.test",
}));
vi.mock("~/server/metering/graph", async (original) => ({
  ...(await original<typeof MeteringGraphModule>()),
  meteringConfigured: () => true,
  verifyMeteringConsent: verify,
  meteringClient: () => {
    throw new Error("Live calls are forbidden in this test");
  },
}));
const { collectMetering, readMetering } = await import("./live");
const { GET: callback } =
  await import("~/app/api/connect/metering/callback/route");
const { POST: action } = await import("~/app/api/metering/route");
const { POST: start } = await import("~/app/api/connect/metering/start/route");
function makeDb() {
  return drizzle(client, { schema });
}
const tenantId = "11111111-1111-1111-1111-111111111111";
const tid = "22222222-2222-2222-2222-222222222222";
const deviceId = "33333333-3333-3333-3333-333333333333";
const scriptId = "44444444-4444-4444-4444-444444444444";
const nonce = "55555555-5555-5555-5555-555555555555";
const other = "66666666-6666-6666-6666-666666666666";
const appId = "88888888-8888-8888-8888-888888888888";
const oid = "test-admin";
const ctx = (metering = true) => ({
  user: { oid },
  tenant: { id: tenantId, tid, isDemo: false },
  entitlement: { state: metering ? "pro" : "free", features: { metering } },
});
const conn = () =>
  database.query.meteringConnections.findFirst({
    where: eq(schema.meteringConnections.tenantId, tenantId),
  });
const req = (patch: Record<string, string> = {}) =>
  new NextRequest(
    `https://app.test/api/connect/metering/callback?${new URLSearchParams({ state: nonce, tenant: tid, admin_consent: "True", ...patch })}`,
  );
const source = (): MeteringSource => ({
  packages: vi.fn(async () => [{ id: scriptId, displayName: "Collector" }]),
  collectors: vi.fn(async () => [
    {
      id: scriptId,
      name: "Collector",
      catalogId: "a1b2c3d4",
      programs: ["acad.exe"],
    },
  ]),
  devices: vi.fn(async () => [
    { id: deviceId, deviceName: "Test Windows", operatingSystem: "Windows" },
  ]),
  states: vi.fn(async () => [
    {
      id: "state",
      managedDevice: { id: deviceId },
      detectionState: "success",
      lastStateUpdateDateTime: new Date().toISOString(),
      preRemediationDetectionScriptOutput: JSON.stringify({
        v: 2,
        c: "a1b2c3d4",
        s: "2026-01-01T00:00:00Z",
        e: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
        h: "ok",
        a: [["acad.exe", 30, 2]],
      }),
    },
  ]),
  apps: vi.fn(async () => [
    {
      id: appId,
      type: "win32LobApp" as const,
      name: "AutoCAD 2026",
      publisher: "Autodesk",
      detected: [],
      products: [],
    },
  ]),
  installs: vi.fn(async () => ({ [appId]: [deviceId] })),
});
async function seedConnection(consented = true) {
  const [result] = await database
    .insert(schema.meteringConnections)
    .values({
      tenantId,
      tid,
      consentedAt: consented ? new Date() : null,
      scriptId,
    })
    .returning();
  return result!;
}
async function seedNonce(createdAt = new Date()) {
  const connection = await seedConnection(false);
  await database.insert(schema.meteringConsentStates).values({
    state: nonce,
    tenantId,
    connectionId: connection.id,
    oid,
    tid,
    createdAt,
  });
}
beforeAll(async () => {
  database = makeDb();
  await migrate(database, { migrationsFolder: "docker/migrations" });
}, 30000);
afterAll(async () => {
  await client.close();
});
beforeEach(async () => {
  await database.delete(schema.tenants);
  await database
    .insert(schema.tenants)
    .values({ id: tenantId, name: "Test", tid, consentedAt: new Date() });
  vi.clearAllMocks();
  access.mockResolvedValue(ctx());
  verify.mockResolvedValue(undefined);
});

const target = (revision = 0, patch = {}) => ({
  id: "77777777-7777-7777-7777-777777777777",
  tid,
  revision,
  scriptId,
  excludedApps: [],
  programOverrides: {},
  ...patch,
});

describe("live metering reads", () => {
  it("defines no table that could hold device results", async () => {
    const tables = await database.execute<{ table_name: string }>(
      sql`select table_name from information_schema.tables where table_schema = 'public' and table_name like 'metering%' order by table_name`,
    );
    expect(tables.rows.map((row) => row.table_name)).toEqual([
      "metering_connections",
      "metering_consent_states",
    ]);
  });
  it("joins collector results, the Intune app list and install status", async () => {
    const graph = source();
    const result = await collectMetering(graph, target());
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      deviceName: "Test Windows",
      status: "ok",
    });
    expect(result.rows[0]?.payload?.a).toEqual([["acad.exe", 30, 2]]);
    expect(result.catalog).toMatchObject([
      { id: appId, programs: ["acad.exe"], source: "catalog" },
    ]);
    expect(result.installs).toEqual({ [appId]: [deviceId] });
    expect(graph.installs).toHaveBeenCalledWith([appId]);
  });
  it("skips install reads for excluded apps", async () => {
    const graph = source();
    const result = await collectMetering(
      graph,
      target(0, { excludedApps: [appId] }),
    );
    expect(result.catalog[0]?.excluded).toBe(true);
    expect(graph.installs).not.toHaveBeenCalled();
  });
  it("keeps a valid result while Intune reports the run as pending", async () => {
    const graph = source();
    const [state] = await source().states(scriptId);
    graph.states = async () => [{ ...state!, detectionState: "pending" }];
    expect((await collectMetering(graph, target())).rows[0]).toMatchObject({
      status: "ok",
    });
    graph.states = async () => [{ ...state!, detectionState: "fail" }];
    expect((await collectMetering(graph, target())).rows[0]).toMatchObject({
      status: "script_error",
      payload: null,
    });
  });
  it("treats empty, failed, duplicate and malformed results as unknown", async () => {
    const graph = source();
    graph.states = async () => [];
    graph.packages = async () => [{ id: scriptId, displayName: "Collector" }];
    expect((await collectMetering(graph, target())).rows[0]).toMatchObject({
      status: "no_report",
      payload: null,
    });
    graph.states = async () => [
      {
        id: "state",
        managedDevice: { id: deviceId },
        detectionState: "success",
        lastStateUpdateDateTime: new Date().toISOString(),
        preRemediationDetectionScriptOutput: "malformed private output",
      },
    ];
    expect((await collectMetering(graph, target())).rows[0]).toMatchObject({
      status: "invalid_output",
      payload: null,
    });
    graph.states = async () => [
      {
        id: "state",
        managedDevice: { id: deviceId },
        detectionState: "fail",
        preRemediationDetectionScriptError: "error text",
      },
    ];
    expect((await collectMetering(graph, target())).rows[0]).toMatchObject({
      status: "script_error",
      payload: null,
    });
    const state = (await source().states(scriptId))[0]!;
    graph.states = async () => [state, state];
    expect(
      (await collectMetering(graph, target())).rows[0]?.payload,
    ).toBeNull();
  });
  it("finds the deployed collector without a package choice", async () => {
    const graph = source();
    const result = await collectMetering(graph, target(0, { scriptId: null }));
    expect(result.collector).toMatchObject({
      id: scriptId,
      catalogId: "a1b2c3d4",
    });
    expect(graph.states).toHaveBeenCalledWith(scriptId);
  });
  it("reads no results until exactly one collector package is known", async () => {
    const graph = source();
    graph.collectors = vi.fn(async () => []);
    const none = await collectMetering(graph, target(0, { scriptId: null }));
    expect(none.collector).toBeNull();
    expect(none.rows[0]).toMatchObject({ status: "no_report" });
    expect(graph.states).not.toHaveBeenCalled();
    const two = [
      {
        id: scriptId,
        name: "A",
        catalogId: "a1b2c3d4",
        programs: ["acad.exe"],
      },
      { id: other, name: "B", catalogId: "a1b2c3d4", programs: ["acad.exe"] },
    ];
    graph.collectors = vi.fn(async () => two);
    expect(
      (await collectMetering(graph, target(0, { scriptId: null }))).collector,
    ).toBeNull();
    expect(
      (await collectMetering(graph, target(0, { scriptId: other }))).collector
        ?.id,
    ).toBe(other);
  });
  it("reuses a recent read, and rereads when forced or reconfigured", async () => {
    const graph = source();
    const first = await readMetering(target(1), { source: graph });
    expect(await readMetering(target(1), { source: graph })).toBe(first);
    expect(graph.states).toHaveBeenCalledTimes(1);
    await readMetering(target(1), { source: graph, fresh: true });
    await readMetering(target(2), { source: graph });
    expect(graph.states).toHaveBeenCalledTimes(3);
  });
  it("never reuses a failed read", async () => {
    const graph = source();
    graph.states = vi.fn(async () => {
      throw new Error("secret and tenant details");
    });
    await expect(readMetering(target(3), { source: graph })).rejects.toThrow();
    graph.states = source().states;
    expect(
      (await readMetering(target(3), { source: graph })).rows,
    ).toHaveLength(1);
  });
  it("returns a sanitized error from a refresh without storing anything", async () => {
    await seedConnection();
    const response = await action(
      new Request("https://app.test/api/metering", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refresh" }),
      }),
    );
    expect(response.status).toBe(502);
    expect(JSON.stringify(await response.json())).not.toContain("forbidden");
  });
  const saveApp = (body: object) =>
    action(
      new Request("https://app.test/api/metering", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "app", ...body }),
      }),
    );
  it("saves one app's settings and keeps the others", async () => {
    await seedConnection();
    await database
      .update(schema.meteringConnections)
      .set({
        excludedApps: ["00000000-0000-4000-8000-000000000002"],
        programOverrides: {
          "00000000-0000-4000-8000-000000000002": ["other.exe"],
        },
      })
      .where(eq(schema.meteringConnections.tenantId, tenantId));
    const response = await saveApp({
      id: "00000000-0000-4000-8000-000000000001",
      programs: ["Tool.exe", "tool.exe"],
      excluded: false,
      updateIntune: false,
    });
    expect(response.status).toBe(200);
    const saved = await conn();
    expect(saved?.programOverrides).toEqual({
      "00000000-0000-4000-8000-000000000002": ["other.exe"],
      "00000000-0000-4000-8000-000000000001": ["tool.exe"],
    });
    expect(saved?.excludedApps).toEqual([
      "00000000-0000-4000-8000-000000000002",
    ]);
    expect(saved?.revision).toBe(1);

    await saveApp({
      id: "00000000-0000-4000-8000-000000000001",
      programs: [],
      excluded: true,
      updateIntune: false,
    });
    expect((await conn())?.programOverrides).toEqual({
      "00000000-0000-4000-8000-000000000002": ["other.exe"],
    });
    expect((await conn())?.excludedApps).toEqual([
      "00000000-0000-4000-8000-000000000002",
      "00000000-0000-4000-8000-000000000001",
    ]);
  });
  it("keeps the saved setting when Intune cannot be updated", async () => {
    await seedConnection();
    const response = await saveApp({
      id: "00000000-0000-4000-8000-000000000001",
      excluded: true,
      updateIntune: true,
    });
    expect(response.status).toBe(502);
    const { error } = (await response.json()) as { error: string };
    expect(error).toMatch(/^Saved\. /);
    expect(error).not.toContain("forbidden");
    expect((await conn())?.excludedApps).toEqual([
      "00000000-0000-4000-8000-000000000001",
    ]);
  });
  it("expires cached reads after five minutes without another read", async () => {
    vi.useFakeTimers();
    try {
      const graph = source();
      await readMetering(target(9), { source: graph });
      vi.advanceTimersByTime(300_001);
      await readMetering(target(9), { source: graph });
      expect(graph.states).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
  it("deletes only the disabled workspace's settings", async () => {
    await seedConnection();
    await database
      .insert(schema.tenants)
      .values({ id: other, name: "Other", tid: other });
    await database.insert(schema.meteringConnections).values({
      tenantId: other,
      tid: other,
      consentedAt: new Date(),
      scriptId,
    });
    const response = await action(
      new Request("https://app.test/api/metering", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "disable" }),
      }),
    );
    expect(response.status).toBe(200);
    expect(
      (await database.select().from(schema.meteringConnections)).map(
        (row) => row.tenantId,
      ),
    ).toEqual([other]);
  });
});

describe("Pro plan boundary", () => {
  const post = (body: object) =>
    action(
      new Request("https://app.test/api/metering", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  it("refuses every metering action without the plan except disable", async () => {
    await seedConnection(false);
    access.mockResolvedValue(ctx(false));
    for (const body of [
      { action: "enable" },
      { action: "verify" },
      { action: "refresh" },
      { action: "configure", scriptId, inactivityDays: 60 },
      { action: "deploy", assign: "none" },
      { action: "update" },
    ])
      expect((await post(body)).status).toBe(402);
    expect(verify).not.toHaveBeenCalled();
    expect(
      (
        await start(
          new Request("https://app.test/api/connect/metering/start", {
            method: "POST",
          }),
        )
      ).headers.get("location"),
    ).toContain("plan_required");
    expect(await database.select().from(schema.meteringConsentStates)).toEqual(
      [],
    );
    expect((await post({ action: "disable" })).status).toBe(200);
    expect(await conn()).toBeUndefined();
  });
});

describe("optional consent boundary", () => {
  it("verifies portal-granted consent only for an enabled connection generation", async () => {
    const request = () =>
      new Request("https://app.test/api/metering", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify" }),
      });
    expect((await action(request())).status).toBe(409);
    await seedConnection(false);
    expect((await action(request())).status).toBe(200);
    expect((await conn())?.consentedAt).toBeInstanceOf(Date);
    verify.mockImplementationOnce(async () => {
      await database.delete(schema.meteringConnections);
      await seedConnection(false);
    });
    expect((await action(request())).status).toBe(502);
    expect((await conn())?.consentedAt).toBeNull();
    access.mockResolvedValue(null);
    expect((await action(request())).status).toBe(403);
  });

  it("requires an enabled connection and admin access before starting consent", async () => {
    expect(
      (
        await start(
          new Request("https://app.test/api/connect/metering/start", {
            method: "POST",
          }),
        )
      ).headers.get("location"),
    ).toContain("enable_first");
    await seedConnection(false);
    const result = await start(
      new Request("https://app.test/api/connect/metering/start", {
        method: "POST",
      }),
    );
    const url = new URL(result.headers.get("location")!);
    expect(url.pathname).toBe(`/${tid}/v2.0/adminconsent`);
    expect(url.searchParams.get("client_id")).toBe("metering-client");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://app.test/api/connect/metering/callback",
    );
    expect(access).toHaveBeenCalledWith("admin");
    access.mockResolvedValue(null);
    expect((await start(new Request("https://app.test"))).status).toBe(403);
  });
  it("rejects a cross-origin start and demo workspace", async () => {
    expect(
      (
        await start(
          new Request("https://app.test", {
            headers: { origin: "https://evil.test" },
          }),
        )
      ).status,
    ).toBe(403);
    access.mockResolvedValue({
      ...ctx(),
      tenant: { ...ctx().tenant, isDemo: true },
    });
    expect((await start(new Request("https://app.test"))).status).toBe(403);
  });
  it("never trusts the callback query without proving access", async () => {
    await seedNonce();
    verify.mockRejectedValueOnce(new Error("no access"));
    expect((await callback(req())).headers.get("location")).toContain(
      "error=consent",
    );
    expect((await conn())?.consentedAt).toBeNull();
  });
  it("consumes a verified nonce once without changing the tenant binding", async () => {
    await seedNonce();
    expect((await callback(req())).headers.get("location")).toContain(
      "connected=1",
    );
    expect((await callback(req())).headers.get("location")).toContain(
      "invalid_state",
    );
    expect((await conn())?.consentedAt).toBeInstanceOf(Date);
    expect(verify).toHaveBeenCalledTimes(1);
    expect((await database.query.tenants.findFirst())?.tid).toBe(tid);
  });
  it("rejects a different tenant, workspace, user, expired state, and base-connector nonce", async () => {
    await seedNonce();
    expect(
      (await callback(req({ tenant: other }))).headers.get("location"),
    ).toContain("wrong_tenant");
    access.mockResolvedValue({ ...ctx(), user: { oid: "other-user" } });
    expect((await callback(req())).headers.get("location")).toContain(
      "invalid_state",
    );
    access.mockResolvedValue({
      ...ctx(),
      tenant: { ...ctx().tenant, id: other },
    });
    expect((await callback(req())).headers.get("location")).toContain(
      "invalid_state",
    );
    access.mockResolvedValue(ctx());
    await database
      .update(schema.meteringConsentStates)
      .set({ createdAt: new Date(Date.now() - 901000) });
    expect((await callback(req())).headers.get("location")).toContain(
      "invalid_state",
    );
    await database.insert(schema.consentStates).values({
      state: other,
      tenantId,
      oid,
      tid,
      email: "admin@example.test",
      name: "Admin",
    });
    expect(
      (await callback(req({ state: other }))).headers.get("location"),
    ).toContain("invalid_state");
    expect(verify).not.toHaveBeenCalled();
  });
  it("disable during consent verification cannot resurrect consent", async () => {
    await seedNonce();
    verify.mockImplementationOnce(async () => {
      await database.delete(schema.meteringConnections);
      await seedConnection(false);
    });
    expect((await callback(req())).headers.get("location")).toContain(
      "invalid_state",
    );
    expect((await conn())?.consentedAt).toBeNull();
  });
});
