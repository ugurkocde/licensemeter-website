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
import { METERED_APPS } from "~/lib/metering";
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
const { syncMetering } = await import("./sync");
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
const oid = "test-admin";
const ctx = () => ({
  user: { oid },
  tenant: { id: tenantId, tid, isDemo: false },
});
const conn = () =>
  database.query.meteringConnections.findFirst({
    where: eq(schema.meteringConnections.tenantId, tenantId),
  });
const rows = () => database.select().from(schema.meteringDevices);
const history = () => database.select().from(schema.meteringHistory);
const req = (patch: Record<string, string> = {}) =>
  new NextRequest(
    `https://app.test/api/connect/metering/callback?${new URLSearchParams({ state: nonce, tenant: tid, admin_consent: "True", ...patch })}`,
  );
const source = (): MeteringSource => ({
  packages: vi.fn(async () => []),
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
        v: 1,
        catalog: "windows-v1",
        start: "2026-01-01T00:00:00Z",
        end: new Date().toISOString(),
        health: "ok",
        apps: METERED_APPS.map((app) => [app.id, null]),
      }),
    },
  ]),
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

describe("metering sync persistence and isolation", () => {
  it("performs no source calls when disabled or awaiting consent", async () => {
    const graph = source();
    expect((await syncMetering(tenantId, { source: graph })).status).toBe(
      "skipped",
    );
    await seedConnection(false);
    expect((await syncMetering(tenantId, { source: graph })).status).toBe(
      "skipped",
    );
    expect(graph.devices).not.toHaveBeenCalled();
  });
  it("stores only normalized aggregates and deduplicates daily history", async () => {
    await seedConnection();
    expect((await syncMetering(tenantId, { source: source() })).status).toBe(
      "ok",
    );
    expect((await syncMetering(tenantId, { source: source() })).status).toBe(
      "ok",
    );
    expect(await rows()).toHaveLength(1);
    expect(await history()).toHaveLength(1);
    expect((await rows())[0]?.payload?.apps).toHaveLength(6);
    expect((await conn())?.lastError).toBeNull();
  });
  it("treats empty, failed, duplicate and malformed results as unknown", async () => {
    await seedConnection();
    const graph = source();
    graph.states = async () => [];
    await syncMetering(tenantId, { source: graph });
    expect((await rows())[0]).toMatchObject({
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
    await syncMetering(tenantId, { source: graph });
    expect((await rows())[0]).toMatchObject({
      status: "invalid_output",
      payload: null,
    });
    const state = (await source().states(scriptId))[0]!;
    graph.states = async () => [state, state];
    await syncMetering(tenantId, { source: graph });
    expect((await rows())[0]?.payload).toBeNull();
    expect(await history()).toHaveLength(0);
  });
  it("preserves prior data and records a sanitized failure", async () => {
    await seedConnection();
    await syncMetering(tenantId, { source: source() });
    const graph = source();
    graph.states = async () => {
      throw new Error("secret and tenant details");
    };
    expect((await syncMetering(tenantId, { source: graph })).status).toBe(
      "failed",
    );
    expect(await rows()).toHaveLength(1);
    expect((await conn())?.lastError).not.toContain("secret");
    expect((await conn())?.syncLock).toBeNull();
  });
  it("does not resurrect observations after disable and re-enable during network work", async () => {
    await seedConnection();
    const graph = source();
    const states = graph.states;
    graph.states = async () => {
      await database.delete(schema.meteringConnections);
      await seedConnection(false);
      return states(scriptId);
    };
    expect((await syncMetering(tenantId, { source: graph })).status).toBe(
      "failed",
    );
    expect(await rows()).toHaveLength(0);
    expect(await history()).toHaveLength(0);
    expect((await conn())?.consentedAt).toBeNull();
    expect((await conn())?.lastError).toBeNull();
  });
  it("rejects a late result after configuration changes and respects the refresh lock", async () => {
    await seedConnection();
    const graph = source();
    const states = graph.states;
    graph.states = async () => {
      expect((await syncMetering(tenantId, { source: source() })).status).toBe(
        "skipped",
      );
      await database.update(schema.meteringConnections).set({
        revision: sql`${schema.meteringConnections.revision} + 1`,
        syncLock: null,
      });
      return states(scriptId);
    };
    expect((await syncMetering(tenantId, { source: graph })).status).toBe(
      "failed",
    );
    expect(await rows()).toHaveLength(0);
  });
  it("keeps workspaces separate and cascades only the disabled workspace", async () => {
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
    await syncMetering(tenantId, { source: source() });
    await syncMetering(other, { source: source() });
    expect(await rows()).toHaveLength(2);
    await database
      .delete(schema.meteringConnections)
      .where(eq(schema.meteringConnections.tenantId, tenantId));
    expect((await rows()).map((row) => row.tenantId)).toEqual([other]);
    expect((await history()).map((row) => row.tenantId)).toEqual([other]);
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
