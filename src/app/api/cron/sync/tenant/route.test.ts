import type * as NextServer from "next/server";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const TENANT = "11111111-2222-4333-8444-555555555555";

const { deferred, notifyOps, findFirst, runSync } = vi.hoisted(() => ({
  deferred: [] as (() => Promise<void>)[],
  notifyOps: vi.fn(() => Promise.resolve()),
  findFirst: vi.fn(),
  runSync: vi.fn(),
}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof NextServer>()),
  after: (fn: () => Promise<void>) => deferred.push(fn),
}));
vi.mock("~/env", () => ({ env: { CRON_SECRET: "s3cret-s3cret-s3cret" } }));
vi.mock("~/server/ops", () => ({ notifyOps }));
vi.mock("~/server/db", () => ({ db: { query: { tenants: { findFirst } } } }));
vi.mock("~/server/sync/runSync", () => ({ runSync }));

const { POST } = await import("./route");

const req = (body: unknown, auth = "Bearer s3cret-s3cret-s3cret") =>
  new NextRequest("https://licensemeter.test/api/cron/sync/tenant", {
    method: "POST",
    headers: { authorization: auth, "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

describe("POST /api/cron/sync/tenant", () => {
  beforeEach(() => {
    deferred.length = 0;
    vi.clearAllMocks();
    findFirst.mockResolvedValue({ id: TENANT, name: "Contoso", tid: "tid" });
    runSync.mockResolvedValue({ runId: "r", status: "success", steps: [] });
  });

  it("rejects requests without the cron secret", async () => {
    expect((await POST(req({ tenantId: TENANT }, "Bearer wrong"))).status).toBe(
      401,
    );
    expect(deferred).toHaveLength(0);
  });

  it("rejects a missing or malformed tenant id", async () => {
    expect((await POST(req({}))).status).toBe(400);
    expect((await POST(req({ tenantId: "x' or 1=1" }))).status).toBe(400);
    expect((await POST(req("not json"))).status).toBe(400);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("answers 404 for an unknown tenant", async () => {
    findFirst.mockResolvedValue(undefined);
    expect((await POST(req({ tenantId: TENANT }))).status).toBe(404);
    expect(deferred).toHaveLength(0);
  });

  it("accepts with 202 and syncs after the response with a deadline", async () => {
    const res = await POST(req({ tenantId: TENANT }));
    expect(res.status).toBe(202);
    expect(runSync).not.toHaveBeenCalled();
    expect(deferred).toHaveLength(1);
    await deferred[0]!();
    expect(runSync).toHaveBeenCalledWith(TENANT, {
      deadline: expect.any(Number) as number,
    });
  });

  it("alerts when the deferred sync throws", async () => {
    runSync.mockRejectedValue(new Error("no credential"));
    await POST(req({ tenantId: TENANT }));
    await deferred[0]!();
    expect(notifyOps).toHaveBeenCalledWith(
      "sync failed for tenant Contoso: no credential",
      expect.objectContaining({ key: `sync:${TENANT}` }),
    );
  });
});
