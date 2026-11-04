import { beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "~/server/db/schema";
import { freshDb, seedTenant, type TestDb } from "~/server/mcp/testHarness";

/** The lost-access evidence against a real Drizzle/PGlite database. */

let currentDb: TestDb;
let tenant: schema.TenantRow;

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

const { loadAccessLoss } = await import("./msAccessLoss");

const CONSENT =
  "invalid_client: Error(s): 7000229 - Description: AADSTS7000229: The client application is missing service principal in the tenant.";
const CREDENTIAL =
  "invalid_client: AADSTS7000222: The provided client secret keys for app are expired.";
const NETWORK = "fetch failed: getaddrinfo ENOTFOUND login.microsoftonline.com";

const run = (
  startedAt: string,
  status: "success" | "partial" | "failed",
  error: string | null = null,
) =>
  currentDb.insert(schema.syncRuns).values({
    tenantId: tenant.id,
    status,
    startedAt: new Date(startedAt),
    finishedAt: new Date(new Date(startedAt).getTime() + 60_000),
    steps: [],
    error,
  });

describe("loadAccessLoss", () => {
  beforeEach(async () => {
    currentDb = await freshDb();
    tenant = await seedTenant(currentDb, 1);
  });

  it("reads lost consent and dates the figures by the last completed run", async () => {
    await run("2026-10-09T07:24:00Z", "success");
    await run("2026-10-10T03:00:00Z", "failed", CONSENT);
    expect(await loadAccessLoss(tenant.id)).toEqual({
      cause: "consent",
      lastSyncedAt: new Date("2026-10-09T07:25:00Z"),
    });
  });

  it("counts a partial run as the last refresh", async () => {
    await run("2026-10-09T07:24:00Z", "success");
    await run("2026-10-12T03:00:00Z", "partial");
    await run("2026-10-13T03:00:00Z", "failed", CONSENT);
    expect((await loadAccessLoss(tenant.id)).lastSyncedAt).toEqual(
      new Date("2026-10-12T03:01:00Z"),
    );
  });

  it("keeps a credential failure when a network error follows it", async () => {
    await run("2026-10-09T07:24:00Z", "success");
    await run("2026-11-01T03:00:00Z", "failed", CREDENTIAL);
    await run("2026-11-02T03:00:00Z", "failed", NETWORK);
    await run("2026-11-03T03:00:00Z", "failed", null);
    expect((await loadAccessLoss(tenant.id)).cause).toBe("connector");
  });

  it("uses the newest authentication failure", async () => {
    await run("2026-11-01T03:00:00Z", "failed", CREDENTIAL);
    await run("2026-11-02T03:00:00Z", "failed", CONSENT);
    expect((await loadAccessLoss(tenant.id)).cause).toBe("consent");
  });

  it("suggests no remedy without authentication evidence", async () => {
    await run("2026-11-02T03:00:00Z", "failed", NETWORK);
    expect(await loadAccessLoss(tenant.id)).toEqual({
      cause: "unknown",
      lastSyncedAt: null,
    });
  });

  it("ignores other workspaces", async () => {
    const other = await seedTenant(currentDb, 2);
    await currentDb.insert(schema.syncRuns).values({
      tenantId: other.id,
      status: "failed",
      startedAt: new Date("2026-11-02T03:00:00Z"),
      steps: [],
      error: CONSENT,
    });
    expect((await loadAccessLoss(tenant.id)).cause).toBe("unknown");
  });
});
