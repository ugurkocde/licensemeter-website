import { beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import * as schema from "~/server/db/schema";
import { freshDb, type TestDb } from "~/server/mcp/testHarness";
import type { Session } from "~/server/auth";

let currentDb: TestDb;
let session: Session | null;
let requestId: string;
let workspaceId: string;
const oid = "00000000-0000-4000-8000-000000000002";
const setCookie = vi.fn();
vi.mock("~/server/auth", () => ({ auth: () => Promise.resolve(session) }));
vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve({ set: setCookie }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("~/server/access", () => ({
  WORKSPACE_COOKIE: "lm_workspace",
  workspaceCookieOptions: () => ({ httpOnly: true, path: "/" }),
}));
vi.mock("~/server/db", () => ({
  db: new Proxy(
    {},
    {
      get: (_target, prop) =>
        (currentDb as unknown as Record<string | symbol, unknown>)[prop],
    },
  ),
}));
const { checkAccessRequest, acknowledgeDeclinedRequest } =
  await import("./accessRequestActions");

beforeEach(async () => {
  currentDb = await freshDb();
  setCookie.mockClear();
  const [tenant] = await currentDb
    .insert(schema.tenants)
    .values({ name: "Acme" })
    .returning();
  workspaceId = tenant!.id;
  const [request] = await currentDb
    .insert(schema.joinRequests)
    .values({
      tenantId: workspaceId,
      oid,
      email: "colleague@acme.example",
      status: "pending",
    })
    .returning();
  requestId = request!.id;
  session = {
    user: {
      oid,
      tid: "aaaaaaaa-0000-4000-8000-000000000001",
      upn: "colleague@acme.example",
      email: "colleague@acme.example",
      emailProven: true,
      name: "Colleague",
      isDemo: false,
    },
  };
});

describe("requester actions", () => {
  it("checks the actual pending status without opening a workspace", async () => {
    const result = await checkAccessRequest(requestId);
    expect(result).toMatchObject({
      ok: true,
      status: "pending",
      checkedAt: expect.any(String) as string,
    });
    expect(setCookie).not.toHaveBeenCalled();
    expect((await acknowledgeDeclinedRequest(requestId)).ok).toBe(false);
  });

  it("rejects anonymous users, demo users, invalid IDs and another requester's ID", async () => {
    expect((await checkAccessRequest("invalid")).ok).toBe(false);
    session!.user.oid = "stranger";
    expect((await checkAccessRequest(requestId)).ok).toBe(false);
    expect((await acknowledgeDeclinedRequest(requestId)).ok).toBe(false);
    session!.user.oid = oid;
    session!.user.isDemo = true;
    expect((await checkAccessRequest(requestId)).ok).toBe(false);
    session = null;
    expect((await checkAccessRequest(requestId)).ok).toBe(false);
    expect(setCookie).not.toHaveBeenCalled();
  });

  it("opens the approved workspace explicitly and records acknowledgement", async () => {
    await currentDb
      .update(schema.joinRequests)
      .set({ status: "approved" })
      .where(eq(schema.joinRequests.id, requestId));
    await currentDb.insert(schema.memberships).values({
      tenantId: workspaceId,
      oid,
      email: "colleague@acme.example",
      role: "viewer",
    });
    expect(await checkAccessRequest(requestId)).toEqual({
      ok: true,
      status: "approved",
      href: `/app?accessRequest=${requestId}`,
    });
    expect(setCookie).toHaveBeenCalledWith(
      "lm_workspace",
      workspaceId,
      expect.objectContaining({ httpOnly: true }),
    );
    const events = await currentDb
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, "member_join_notice_acknowledged"));
    expect(events).toHaveLength(1);
  });

  it("does not restore a revoked membership merely because the request was approved", async () => {
    await currentDb
      .update(schema.joinRequests)
      .set({ status: "approved" })
      .where(eq(schema.joinRequests.id, requestId));
    expect(await checkAccessRequest(requestId)).toMatchObject({
      ok: false,
      error: expect.stringContaining("removed") as string,
    });
    expect(setCookie).not.toHaveBeenCalled();
  });

  it("acknowledges a decline once without deleting it or granting access", async () => {
    await currentDb
      .update(schema.joinRequests)
      .set({ status: "declined" })
      .where(eq(schema.joinRequests.id, requestId));
    expect(await checkAccessRequest(requestId)).toMatchObject({
      ok: true,
      status: "declined",
    });
    expect(await acknowledgeDeclinedRequest(requestId)).toEqual({ ok: true });
    expect(await acknowledgeDeclinedRequest(requestId)).toEqual({ ok: true });
    const [request] = await currentDb
      .select()
      .from(schema.joinRequests)
      .where(eq(schema.joinRequests.id, requestId));
    expect(request!.status).toBe("declined");
    expect(
      await currentDb
        .select()
        .from(schema.memberships)
        .where(
          and(
            eq(schema.memberships.tenantId, workspaceId),
            eq(schema.memberships.oid, oid),
          ),
        ),
    ).toEqual([]);
    expect(setCookie).not.toHaveBeenCalled();
    expect(await currentDb.select().from(schema.auditLog)).toHaveLength(1);
  });

  it("can open access restored through an invitation after a decline", async () => {
    await currentDb
      .update(schema.joinRequests)
      .set({ status: "declined" })
      .where(eq(schema.joinRequests.id, requestId));
    await currentDb.insert(schema.memberships).values({
      tenantId: workspaceId,
      oid,
      email: "colleague@acme.example",
      role: "admin",
    });
    expect(await checkAccessRequest(requestId)).toMatchObject({
      ok: true,
      status: "approved",
    });
    expect(setCookie).toHaveBeenCalledWith(
      "lm_workspace",
      workspaceId,
      expect.any(Object),
    );
  });
});
