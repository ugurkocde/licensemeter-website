import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AccessContext, FeatureAccess } from "~/server/access";
import * as schema from "~/server/db/schema";
import { freshDb, seedTenant, type TestDb } from "~/server/mcp/testHarness";

let currentDb: TestDb;
/** What the mocked access layer resolves for the signed-in member. */
let member: {
  role: "viewer" | "admin" | "owner";
  hasMcp: boolean;
  isDemo: boolean;
};
let tenant: schema.TenantRow;

vi.mock("~/env", () => ({ env: { NODE_ENV: "test" } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

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

const RANK = { viewer: 0, admin: 1, owner: 2 } as const;

const context = (): AccessContext =>
  ({
    user: {
      oid: "user_1",
      tid: "",
      upn: "a@a.example",
      name: "A",
      isDemo: false,
    },
    tenant: { ...tenant, isDemo: member.isDemo },
    membership: { role: member.role, email: "a@a.example" },
    workspaces: [],
  }) as unknown as AccessContext;

// The real role and feature decisions, fed by the fixture above.
vi.mock("~/server/access", () => ({
  apiAccess: async (minRole: keyof typeof RANK) =>
    RANK[member.role] >= RANK[minRole] ? context() : null,
  apiFeatureAccess: async (
    _feature: string,
    minRole: keyof typeof RANK,
  ): Promise<FeatureAccess> => {
    if (RANK[member.role] < RANK[minRole]) {
      return { ctx: null, denied: "unauthorized" };
    }
    return member.hasMcp
      ? { ctx: context(), denied: null }
      : { ctx: null, denied: "featureRequired", feature: "mcp", plan: "pro" };
  },
}));

const { createMcpTokenAction, revokeMcpTokenAction } =
  await import("./actions");
const { createToken, listTokens, verifyToken } =
  await import("~/server/mcp/tokens");

const form = (name: string) => {
  const data = new FormData();
  data.set("name", name);
  return data;
};

beforeEach(async () => {
  currentDb = await freshDb();
  tenant = await seedTenant(currentDb, 1);
  member = { role: "admin", hasMcp: true, isDemo: false };
});

describe("createMcpTokenAction", () => {
  it("creates a token for an admin on a plan with MCP and returns it once", async () => {
    const result = await createMcpTokenAction(form("  Finance desk  "));
    if (!result.ok) throw new Error(result.error);

    expect(result.name).toBe("Finance desk");
    expect(await verifyToken(result.token)).toMatchObject({
      tenantId: tenant.id,
    });
    const [row] = await currentDb.select().from(schema.apiTokens);
    expect(row!.createdByKey).toBe("user_1");
    expect(JSON.stringify(row)).not.toContain(result.token);
  });

  it("refuses a workspace without the MCP feature, on the server", async () => {
    member.hasMcp = false;
    const result = await createMcpTokenAction(form("Desk"));
    expect(result).toEqual({
      ok: false,
      error: "The MCP server is not included in your plan.",
    });
    expect(await listTokens(tenant.id)).toEqual([]);
  });

  it("refuses a viewer", async () => {
    member.role = "viewer";
    expect((await createMcpTokenAction(form("Desk"))).ok).toBe(false);
    expect(await listTokens(tenant.id)).toEqual([]);
  });

  it("refuses the demo workspace", async () => {
    member.isDemo = true;
    expect((await createMcpTokenAction(form("Desk"))).ok).toBe(false);
    expect(await listTokens(tenant.id)).toEqual([]);
  });

  it("refuses an empty or overlong name", async () => {
    for (const name of ["", "   ", "x".repeat(61)]) {
      expect((await createMcpTokenAction(form(name))).ok).toBe(false);
    }
    expect(await listTokens(tenant.id)).toEqual([]);
  });
});

describe("revokeMcpTokenAction", () => {
  const seedToken = async (tenantId: string) => {
    const created = await createToken({
      tenantId,
      name: "Desk",
      createdByKey: "user_1",
    });
    if (!created.ok) throw new Error("fixture token refused");
    return created;
  };

  it("revokes a token of the active workspace", async () => {
    const { token, summary } = await seedToken(tenant.id);
    expect(await revokeMcpTokenAction(summary.id)).toEqual({ ok: true });
    expect(await verifyToken(token)).toBeNull();
  });

  it("stays possible after a downgrade", async () => {
    const { token, summary } = await seedToken(tenant.id);
    member.hasMcp = false;
    expect(await revokeMcpTokenAction(summary.id)).toEqual({ ok: true });
    expect(await verifyToken(token)).toBeNull();
  });

  it("refuses a viewer", async () => {
    const { token, summary } = await seedToken(tenant.id);
    member.role = "viewer";
    expect((await revokeMcpTokenAction(summary.id)).ok).toBe(false);
    expect(await verifyToken(token)).not.toBeNull();
  });

  it("cannot revoke a token of another workspace, or a made-up id", async () => {
    const other = await seedTenant(currentDb, 2);
    const { token, summary } = await seedToken(other.id);

    for (const id of [summary.id, "not-a-uuid", "' or 1=1 --"]) {
      expect(await revokeMcpTokenAction(id)).toEqual({
        ok: false,
        error: "Token not found",
      });
    }
    expect(await verifyToken(token)).not.toBeNull();
  });
});
