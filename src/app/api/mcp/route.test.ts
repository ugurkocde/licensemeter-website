import { beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "~/server/db/schema";
import {
  freshDb,
  seedProPlan,
  seedTenant,
  type TestDb,
} from "~/server/mcp/testHarness";

let currentDb: TestDb;
let billing = true;

vi.mock("~/env", () => ({
  env: { NODE_ENV: "test" },
  billingEnabled: () => billing,
  siteUrl: () => "https://licensemeter.example",
}));

// Stable proxy so every module's `import { db }` binding hits currentDb, wrapped
// like production so withTenant() routes queries to the tenant session.
vi.mock("~/server/db", async () => {
  const { createTenantDb } = await import("~/server/db/tenant");
  const proxy = new Proxy(
    {},
    {
      get: (_t, prop) =>
        (currentDb as unknown as Record<string | symbol, unknown>)[prop],
    },
  );
  return { db: createTenantDb(proxy), schema };
});

const { POST, GET, DELETE } = await import("./route");
const { createToken, revokeToken } = await import("~/server/mcp/tokens");

// --- fixtures ----------------------------------------------------------------

const SECRET_UPN = "dana.secret@contoso.example";
const SECRET_NAME = "Dana Secret";
const SECRET_OID = "99999999-aaaa-bbbb-cccc-000000000001";

const tokenFor = async (tenant: string) => {
  const created = await createToken({
    tenantId: tenant,
    name: "Test",
    createdByKey: "user_1",
  });
  if (!created.ok) throw new Error("fixture token refused");
  return { token: created.token, id: created.summary.id };
};

/** A workspace with findings, licenses, prices, snapshots and a sync run. */
const seedData = async (
  tenant: string,
  opts: { impactCents: number; skuName: string; upn: string; name: string },
) => {
  await currentDb.insert(schema.findings).values([
    {
      tenantId: tenant,
      dedupeKey: `inactive_90d|${opts.upn}|-`,
      rule: "inactive_90d",
      graphUserId: SECRET_OID,
      title: `No activity for 90 days: ${opts.name}`,
      detail: { upn: opts.upn, displayName: opts.name },
      monthlyImpactCents: opts.impactCents,
    },
    {
      tenantId: tenant,
      dedupeKey: "shelfware|-|sku-1",
      rule: "shelfware",
      skuId: "sku-1",
      title: `Unassigned paid seats: ${opts.skuName} (4)`,
      detail: { skuId: "sku-1", purchased: 10, assigned: 6, unassigned: 4 },
      monthlyImpactCents: 4000,
    },
    {
      tenantId: tenant,
      dedupeKey: `saas_orphaned|zoom:${opts.upn}|-`,
      rule: "saas_orphaned",
      // No Entra account, so no graph user id: the title still names a person.
      title: `Zoom seat without Entra account: ${opts.upn}`,
      detail: { upn: opts.upn, provider: "zoom" },
      monthlyImpactCents: 1500,
      status: "resolved",
    },
  ]);
  await currentDb.insert(schema.tenantSkus).values([
    {
      tenantId: tenant,
      skuId: "sku-1",
      skuPartNumber: "SPE_E3",
      displayName: opts.skuName,
      prepaidEnabled: 10,
      consumedUnits: 6,
    },
    {
      // A free sentinel SKU the portal hides.
      tenantId: tenant,
      skuId: "sku-free",
      skuPartNumber: "FLOW_FREE",
      displayName: "Power Automate Free",
      prepaidEnabled: 10000,
      consumedUnits: 3,
    },
  ]);
  await currentDb.insert(schema.priceBook).values({
    tenantId: tenant,
    skuId: "sku-1",
    monthlyPriceCents: 1000,
  });
  const today = new Date().toISOString().slice(0, 10);
  await currentDb.insert(schema.snapshots).values([
    {
      tenantId: tenant,
      day: today,
      totalMonthlySpendCents: 6000,
      totalMonthlyWasteCents: opts.impactCents + 4000,
    },
    {
      // Older than any plan's window: never returned.
      tenantId: tenant,
      day: "2019-01-15",
      totalMonthlySpendCents: 111,
      totalMonthlyWasteCents: 111,
    },
  ]);
  await currentDb.insert(schema.syncRuns).values({
    tenantId: tenant,
    status: "success",
    finishedAt: new Date("2026-09-18T06:00:00Z"),
  });
};

// --- request helpers ---------------------------------------------------------

const ENDPOINT = "https://licensemeter.example/api/mcp";

const post = (
  body: unknown,
  opts: {
    token?: string | null;
    headers?: Record<string, string>;
    raw?: string;
  } = {},
) =>
  POST(
    new Request(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
        ...opts.headers,
      },
      body: opts.raw ?? JSON.stringify(body),
    }),
  );

const rpc = (method: string, params?: unknown, id: number | string = 1) => ({
  jsonrpc: "2.0",
  id,
  method,
  ...(params === undefined ? {} : { params }),
});

type RpcBody = {
  jsonrpc: string;
  id: number | string | null;
  result?: Record<string, unknown>;
  error?: { code: number; message: string; data?: Record<string, unknown> };
};

const callTool = async (
  token: string,
  name: string,
  args?: Record<string, unknown>,
) => {
  const res = await post(rpc("tools/call", { name, arguments: args }), {
    token,
  });
  const body = (await res.json()) as RpcBody;
  return { res, body, text: JSON.stringify(body) };
};

let tenantA: schema.TenantRow;
let tenantB: schema.TenantRow;
let tokenA: string;

beforeEach(async () => {
  currentDb = await freshDb();
  billing = true;
  tenantA = await seedTenant(currentDb, 1, { consentedAt: new Date() });
  tenantB = await seedTenant(currentDb, 2, { consentedAt: new Date() });
  await seedProPlan(currentDb, tenantA.id);
  await seedProPlan(currentDb, tenantB.id);
  await seedData(tenantA.id, {
    impactCents: 2500,
    skuName: "Microsoft 365 E3",
    upn: "alex@a.example",
    name: "Alex A",
  });
  await seedData(tenantB.id, {
    impactCents: 987_654,
    skuName: "Workspace B Secret Suite",
    upn: SECRET_UPN,
    name: SECRET_NAME,
  });
  tokenA = (await tokenFor(tenantA.id)).token;
});

// --- authentication ----------------------------------------------------------

describe("authentication", () => {
  it("answers 401 with WWW-Authenticate when no token is sent", async () => {
    const res = await post(rpc("ping"));
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toMatch(/^Bearer /);
    expect(((await res.json()) as RpcBody).error).toBeDefined();
  });

  it("answers 401 for an unknown, a malformed and a revoked token", async () => {
    const revoked = await tokenFor(tenantA.id);
    await revokeToken(tenantA.id, revoked.id);
    const unknown = `lm_mcp_${"A".repeat(43)}`;

    for (const token of [unknown, "garbage", revoked.token]) {
      const res = await post(rpc("tools/list"), { token });
      expect(res.status).toBe(401);
      expect(res.headers.get("www-authenticate")).toContain("invalid_token");
      // The presented token is never echoed.
      expect(await res.text()).not.toContain(token);
    }
  });

  it("ignores a token in the query string", async () => {
    const res = await POST(
      new Request(`${ENDPOINT}?token=${tokenA}&access_token=${tokenA}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rpc("ping")),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("refuses a non-Bearer scheme", async () => {
    const res = await post(rpc("ping"), {
      headers: { Authorization: `Basic ${tokenA}` },
    });
    expect(res.status).toBe(401);
  });
});

// --- plan enforcement --------------------------------------------------------

describe("plan enforcement", () => {
  it("answers 402 for a Free workspace holding a valid token", async () => {
    const free = await seedTenant(currentDb, 3);
    const { token } = await tokenFor(free.id);

    const res = await post(rpc("tools/list"), { token });
    const body = (await res.json()) as RpcBody;
    expect(res.status).toBe(402);
    expect(body.error?.data).toMatchObject({
      reason: "featureRequired",
      feature: "mcp",
      plan: "pro",
    });
    expect(body.result).toBeUndefined();
  });

  it("stops working on a downgrade and works again after an upgrade", async () => {
    expect((await post(rpc("ping"), { token: tokenA })).status).toBe(200);

    await currentDb.update(schema.entitlements).set({ status: "suspended" });
    expect((await post(rpc("ping"), { token: tokenA })).status).toBe(402);

    await currentDb.update(schema.entitlements).set({ status: "active" });
    expect((await post(rpc("ping"), { token: tokenA })).status).toBe(200);
  });

  it("serves every workspace when billing is disabled", async () => {
    billing = false;
    const free = await seedTenant(currentDb, 3);
    const { token } = await tokenFor(free.id);
    expect((await post(rpc("ping"), { token })).status).toBe(200);
  });
});

// --- transport ---------------------------------------------------------------

describe("transport", () => {
  it("answers GET and DELETE with 405", async () => {
    for (const handler of [GET, DELETE]) {
      const res = handler();
      expect(res.status).toBe(405);
      expect(res.headers.get("allow")).toBe("POST");
    }
  });

  it("refuses a foreign Origin with 403 and accepts its own", async () => {
    const foreign = await post(rpc("ping"), {
      token: tokenA,
      headers: { Origin: "https://evil.example" },
    });
    expect(foreign.status).toBe(403);

    const own = await post(rpc("ping"), {
      token: tokenA,
      headers: { Origin: "https://licensemeter.example" },
    });
    expect(own.status).toBe(200);
  });

  it("answers malformed JSON with a parse error", async () => {
    const res = await post(null, { token: tokenA, raw: "{not json" });
    const body = (await res.json()) as RpcBody;
    expect(res.status).toBe(400);
    expect(body).toMatchObject({ id: null, error: { code: -32700 } });
  });

  it("refuses an oversized body with 413", async () => {
    const res = await post(null, {
      token: tokenA,
      raw: JSON.stringify(rpc("ping", { pad: "x".repeat(70 * 1024) })),
    });
    expect(res.status).toBe(413);
  });

  it("refuses a body that is not JSON by content type", async () => {
    const res = await post(rpc("ping"), {
      token: tokenA,
      headers: { "Content-Type": "text/plain" },
    });
    expect(res.status).toBe(415);
  });

  it("refuses an unsupported MCP-Protocol-Version and names the supported ones", async () => {
    const res = await post(rpc("ping"), {
      token: tokenA,
      headers: { "MCP-Protocol-Version": "1999-01-01" },
    });
    const body = (await res.json()) as RpcBody;
    expect(res.status).toBe(400);
    expect(body.error?.data?.supported).toContain("2025-11-25");
  });

  it("refuses a JSON-RPC batch", async () => {
    const res = await post(
      [rpc("ping", undefined, 1), rpc("ping", undefined, 2)],
      {
        token: tokenA,
      },
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as RpcBody).error?.code).toBe(-32600);
  });

  it("rate limits per token with 429", async () => {
    const { token, id } = await tokenFor(tenantA.id);
    await currentDb.insert(schema.rateLimits).values({
      key: `mcp:${id}`,
      count: 120,
      resetAt: new Date(Date.now() + 60_000),
    });

    const res = await post(rpc("ping"), { token });
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("60");
    // Another token of the same workspace has its own budget.
    expect((await post(rpc("ping"), { token: tokenA })).status).toBe(200);
  });

  it("marks responses as not cacheable", async () => {
    const res = await post(rpc("ping"), { token: tokenA });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});

// --- JSON-RPC ----------------------------------------------------------------

describe("JSON-RPC", () => {
  it("answers initialize with the requested version, tools capability and server info", async () => {
    const res = await post(
      rpc("initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "test", version: "0" },
      }),
      { token: tokenA },
    );
    const body = (await res.json()) as RpcBody;
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(res.headers.get("mcp-session-id")).toBeNull();
    expect(body.id).toBe(1);
    expect(body.result).toMatchObject({
      protocolVersion: "2025-06-18",
      capabilities: { tools: {} },
      serverInfo: { name: "licensemeter" },
    });
  });

  it("offers its latest version when the requested one is unknown", async () => {
    const res = await post(
      rpc("initialize", { protocolVersion: "2099-01-01" }),
      {
        token: tokenA,
      },
    );
    expect(((await res.json()) as RpcBody).result?.protocolVersion).toBe(
      "2025-11-25",
    );
  });

  it("accepts notifications/initialized with 202 and no body", async () => {
    const res = await post(
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { token: tokenA },
    );
    expect(res.status).toBe(202);
    expect(await res.text()).toBe("");
  });

  it("answers ping with an empty result and echoes a string id", async () => {
    const res = await post(rpc("ping", undefined, "abc"), { token: tokenA });
    expect(await res.json()).toEqual({ jsonrpc: "2.0", id: "abc", result: {} });
  });

  it("lists the four read-only tools with object input schemas", async () => {
    const res = await post(rpc("tools/list"), { token: tokenA });
    const tools = ((await res.json()) as RpcBody).result?.tools as {
      name: string;
      inputSchema: { type: string; properties: Record<string, unknown> };
      annotations: { readOnlyHint: boolean };
    }[];

    expect(tools.map((t) => t.name).sort()).toEqual([
      "get_waste_summary",
      "get_waste_trend",
      "list_findings",
      "list_licenses",
    ]);
    for (const tool of tools) {
      expect(tool.inputSchema.type).toBe("object");
      expect(tool.annotations.readOnlyHint).toBe(true);
      // No tool takes a workspace or tenant id.
      expect(Object.keys(tool.inputSchema.properties).join(" ")).not.toMatch(
        /tenant|workspace/i,
      );
    }
  });

  it("answers an unknown method with -32601", async () => {
    const res = await post(rpc("resources/list"), { token: tokenA });
    const body = (await res.json()) as RpcBody;
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ id: 1, error: { code: -32601 } });
  });

  it("answers an unknown tool with -32602", async () => {
    const { body } = await callTool(tokenA, "delete_everything");
    expect(body.error?.code).toBe(-32602);
  });

  it("answers a message without jsonrpc 2.0 with -32600", async () => {
    const res = await post({ id: 1, method: "ping" }, { token: tokenA });
    expect(res.status).toBe(400);
    expect(((await res.json()) as RpcBody).error?.code).toBe(-32600);
  });

  it("reports invalid tool arguments as a tool error, including a tenant id", async () => {
    for (const args of [
      { limit: 201 },
      { status: "everything" },
      { tenant_id: tenantB.id },
      { tenantId: tenantB.id },
    ]) {
      const { body } = await callTool(tokenA, "list_findings", args);
      expect(body.result?.isError).toBe(true);
      expect(body.result?.structuredContent).toBeUndefined();
    }
  });
});

// --- tools -------------------------------------------------------------------

describe("tools", () => {
  it("get_waste_summary matches the Overview aggregates", async () => {
    const { body } = await callTool(tokenA, "get_waste_summary");
    expect(body.result?.isError).toBe(false);
    expect(body.result?.structuredContent).toMatchObject({
      currency: tenantA.currency,
      // Open findings only: 25.00 + 40.00. The resolved 15.00 is excluded.
      monthly_waste: 65,
      annualized_waste: 780,
      open_findings: 2,
      last_synced_at: "2026-09-18T06:00:00.000Z",
      last_sync_status: "success",
      by_category: [
        { category: "shelfware", open_findings: 1, monthly_waste: 40 },
        { category: "inactive_90d", open_findings: 1, monthly_waste: 25 },
      ],
    });
    // The text block carries the same data for clients without structured output.
    const content = body.result?.content as { type: string; text: string }[];
    expect(JSON.parse(content[0]!.text)).toEqual(
      body.result?.structuredContent,
    );
  });

  it("list_findings leaves out every user identifier by default", async () => {
    for (const args of [
      undefined,
      {},
      { status: "resolved" },
      { include_users: false },
    ]) {
      const { body, text } = await callTool(tokenA, "list_findings", args);
      expect(body.result?.isError).toBe(false);
      expect(body.result?.structuredContent).toMatchObject({
        users_included: false,
      });
      expect(text).not.toContain("alex@a.example");
      expect(text).not.toContain("Alex A");
      expect(text).not.toContain(SECRET_OID);
    }
  });

  it("list_findings keeps product titles and replaces titles that name a person", async () => {
    const { body } = await callTool(tokenA, "list_findings");
    const data = body.result?.structuredContent as {
      total_matching: number;
      findings: Record<string, unknown>[];
    };
    expect(data.total_matching).toBe(2);
    expect(data.findings).toEqual([
      expect.objectContaining({
        rule: "shelfware",
        title: "Unassigned paid seats: Microsoft 365 E3 (4)",
        monthly_amount: 40,
        affected_count: 4,
        status: "open",
      }),
      expect.objectContaining({
        rule: "inactive_90d",
        title: "Inactive seat",
        monthly_amount: 25,
        affected_count: 1,
      }),
    ]);
    for (const f of data.findings) expect(f).not.toHaveProperty("user");
  });

  it("list_findings returns the user principal name only with include_users", async () => {
    const { body, text } = await callTool(tokenA, "list_findings", {
      include_users: true,
      category: "inactive_90d",
    });
    const data = body.result?.structuredContent as {
      users_included: boolean;
      findings: Record<string, unknown>[];
    };
    expect(data.users_included).toBe(true);
    expect(data.findings).toHaveLength(1);
    expect(data.findings[0]).toMatchObject({
      user: "alex@a.example",
      title: "No activity for 90 days: Alex A",
    });
    // Object ids are never part of the output.
    expect(text).not.toContain(SECRET_OID);
  });

  it("list_findings filters by status and honours the limit", async () => {
    const resolved = await callTool(tokenA, "list_findings", {
      status: "resolved",
    });
    expect(resolved.body.result?.structuredContent).toMatchObject({
      total_matching: 1,
      findings: [{ rule: "saas_orphaned", title: RULE_LABEL_SAAS_ORPHANED }],
    });

    const limited = await callTool(tokenA, "list_findings", { limit: 1 });
    expect(limited.body.result?.structuredContent).toMatchObject({
      total_matching: 2,
      returned: 1,
    });
  });

  it("get_waste_trend stays inside the history window", async () => {
    for (const interval of ["daily", "monthly"]) {
      const { body, text } = await callTool(tokenA, "get_waste_trend", {
        interval,
      });
      const data = body.result?.structuredContent as {
        points: Record<string, unknown>[];
      };
      expect(data.points).toHaveLength(1);
      expect(data.points[0]).toMatchObject({
        monthly_spend: 60,
        monthly_waste: 65,
      });
      expect(text).not.toContain("2019-01");
    }
  });

  it("list_licenses matches the licenses export and hides sentinel SKUs", async () => {
    const { body, text } = await callTool(tokenA, "list_licenses");
    expect(body.result?.structuredContent).toEqual({
      currency: tenantA.currency,
      total_monthly_cost_of_unused: 40,
      licenses: [
        {
          name: "Microsoft 365 E3",
          part_number: "SPE_E3",
          purchased: 10,
          assigned: 6,
          unused: 4,
          monthly_price: 10,
          monthly_spend: 60,
          monthly_cost_of_unused: 40,
        },
      ],
    });
    expect(text).not.toContain("FLOW_FREE");
  });
});

const RULE_LABEL_SAAS_ORPHANED = "Connected app seat without Entra account";

// --- workspace isolation -----------------------------------------------------

describe("workspace isolation", () => {
  it("a token for workspace A never reads workspace B", async () => {
    const calls: [string, Record<string, unknown> | undefined][] = [
      ["get_waste_summary", undefined],
      ["list_findings", { include_users: true }],
      ["list_findings", { include_users: true, status: "resolved" }],
      ["get_waste_trend", { interval: "daily" }],
      ["get_waste_trend", { interval: "monthly" }],
      ["list_licenses", undefined],
    ];
    for (const [name, args] of calls) {
      const { body, text } = await callTool(tokenA, name, args);
      expect(body.result?.isError).toBe(false);
      expect(text).not.toContain(SECRET_UPN);
      expect(text).not.toContain(SECRET_NAME);
      expect(text).not.toContain("Workspace B Secret Suite");
      // Workspace B's 9,876.54 finding never reaches a total of A.
      expect(text).not.toContain("9876.54");
      expect(text).not.toContain(tenantB.id);
    }
  });

  it("workspace B's token reads B, so the fixture would show a leak", async () => {
    const { token } = await tokenFor(tenantB.id);
    const { text } = await callTool(token, "list_findings", {
      include_users: true,
    });
    expect(text).toContain(SECRET_UPN);
    expect(text).toContain("9876.54");
    expect(text).not.toContain("alex@a.example");
  });
});
