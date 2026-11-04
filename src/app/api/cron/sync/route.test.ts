import type * as DrizzleOrm from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Env = { CRON_SECRET: string; APP_BASE_URL?: string };

const { env, notifyOps, findMany, runSync, dispatchTenantSyncs } = vi.hoisted(
  () => {
    const env: Env = { CRON_SECRET: "s3cret-s3cret-s3cret" };
    return {
      env,
      notifyOps: vi.fn(() => Promise.resolve()),
      findMany: vi.fn(),
      runSync: vi.fn(),
      dispatchTenantSyncs: vi.fn(),
    };
  },
);
vi.mock("~/env", () => ({ env }));
vi.mock("~/server/ops", () => ({ notifyOps }));
vi.mock("~/server/db", () => {
  const chain = { from: () => chain, where: () => chain };
  return { db: { query: { tenants: { findMany } }, select: () => chain } };
});
vi.mock("drizzle-orm", async (importOriginal) => ({
  ...(await importOriginal<typeof DrizzleOrm>()),
  exists: () => undefined,
  or: () => undefined,
}));
vi.mock("~/server/sync/runSync", () => ({ runSync }));
vi.mock("~/server/sync/dispatch", () => ({ dispatchTenantSyncs }));

const { GET } = await import("./route");

const req = () =>
  new NextRequest("https://licensemeter.test/api/cron/sync", {
    headers: { authorization: "Bearer s3cret-s3cret-s3cret" },
  });
const tenantRows = ["t1", "t2", "t3"].map((id) => ({ id, name: id, tid: id }));

describe("GET /api/cron/sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    env.APP_BASE_URL = "https://licensemeter.com";
    findMany.mockResolvedValue(tenantRows);
    runSync.mockResolvedValue({ runId: "r", status: "success", steps: [] });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("dispatches every tenant on Vercel and syncs none in-process", async () => {
    vi.stubEnv("VERCEL", "1");
    dispatchTenantSyncs.mockResolvedValue({
      accepted: ["t1", "t2", "t3"],
      rejected: [],
    });
    const body = (await (await GET(req())).json()) as {
      dispatched: number;
      synced: number;
    };
    expect(dispatchTenantSyncs).toHaveBeenCalledWith(["t1", "t2", "t3"], {
      baseUrl: "https://licensemeter.com",
      secret: "s3cret-s3cret-s3cret",
    });
    expect(body).toMatchObject({ dispatched: 3, synced: 0 });
    expect(runSync).not.toHaveBeenCalled();
    expect(notifyOps).not.toHaveBeenCalled();
  });

  it("syncs rejected dispatches in-process and alerts once", async () => {
    vi.stubEnv("VERCEL", "1");
    dispatchTenantSyncs.mockResolvedValue({
      accepted: ["t1"],
      rejected: ["t2", "t3"],
    });
    const body = (await (await GET(req())).json()) as {
      dispatched: number;
      synced: number;
    };
    expect(runSync.mock.calls.map((c) => c[0] as string).sort()).toEqual([
      "t2",
      "t3",
    ]);
    expect(body).toMatchObject({ dispatched: 1, synced: 2 });
    expect(notifyOps).toHaveBeenCalledWith(
      "nightly sync could not dispatch 2 of 3 tenants; syncing them in the cron request",
      expect.objectContaining({ key: "cron:sync:dispatch" }),
    );
  });

  it("syncs everything in-process when self-hosted", async () => {
    vi.stubEnv("VERCEL", "");
    const body = (await (await GET(req())).json()) as {
      dispatched: number;
      synced: number;
    };
    expect(dispatchTenantSyncs).not.toHaveBeenCalled();
    expect(runSync).toHaveBeenCalledTimes(3);
    expect(body).toMatchObject({ dispatched: 0, synced: 3 });
  });

  it("syncs in-process on Vercel when APP_BASE_URL is missing", async () => {
    vi.stubEnv("VERCEL", "1");
    delete env.APP_BASE_URL;
    await GET(req());
    expect(dispatchTenantSyncs).not.toHaveBeenCalled();
    expect(runSync).toHaveBeenCalledTimes(3);
  });
});
