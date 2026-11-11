import * as nodeCrypto from "node:crypto";

import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "~/server/db/schema";
import { freshDb, seedTenant, type TestDb } from "~/server/mcp/testHarness";

let currentDb: TestDb;

vi.mock("~/env", () => ({ env: { NODE_ENV: "test" } }));

// Stable proxy so the module's `import { db }` binding always hits currentDb.
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

// Wrapped, not replaced: the real comparison runs and its calls are counted.
vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof nodeCrypto>();
  return { ...actual, timingSafeEqual: vi.fn(actual.timingSafeEqual) };
});

const {
  createToken,
  generateToken,
  hashesEqual,
  hashToken,
  listTokens,
  MAX_ACTIVE_TOKENS,
  revokeToken,
  TOKEN_PREFIX,
  TOKEN_TTL_DAYS,
  verifyToken,
} = await import("./tokens");

const storedRows = (tenant: string) =>
  currentDb
    .select()
    .from(schema.apiTokens)
    .where(eq(schema.apiTokens.tenantId, tenant));

const create = async (tenant: string, name = "Desk") => {
  const result = await createToken({
    tenantId: tenant,
    name,
    createdByKey: "user_1",
  });
  if (!result.ok) throw new Error("token cap reached in fixture");
  return result;
};

beforeEach(async () => {
  currentDb = await freshDb();
  vi.mocked(nodeCrypto.timingSafeEqual).mockClear();
});

describe("token format and hashing", () => {
  it("generates lm_mcp_ plus 32 random bytes as base64url", () => {
    const token = generateToken();
    expect(token).toMatch(/^lm_mcp_[A-Za-z0-9_-]{43}$/);
    expect(
      Buffer.from(token.slice(TOKEN_PREFIX.length), "base64url"),
    ).toHaveLength(32);
    expect(generateToken()).not.toBe(token);
  });

  it("hashes to hex SHA-256", () => {
    expect(hashToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("stores only the hash and a short prefix, never the token", async () => {
    const tenant = await seedTenant(currentDb, 1);
    const { token, summary } = await create(tenant.id);

    const [row] = await storedRows(tenant.id);
    expect(row!.tokenHash).toBe(hashToken(token));
    expect(row!.tokenPrefix).toBe(token.slice(0, TOKEN_PREFIX.length + 6));
    expect(JSON.stringify(row)).not.toContain(token);
    expect(JSON.stringify(summary)).not.toContain(token);
    expect(summary).not.toHaveProperty("tokenHash");
  });
});

describe("hashesEqual", () => {
  it("accepts equal hashes and refuses different or malformed ones", () => {
    const a = hashToken("a");
    expect(hashesEqual(a, a)).toBe(true);
    expect(hashesEqual(a, hashToken("b"))).toBe(false);
    expect(hashesEqual(a, a.slice(0, 10))).toBe(false);
    expect(hashesEqual("", "")).toBe(false);
  });
});

describe("verifyToken", () => {
  it("resolves a token to its workspace", async () => {
    const tenant = await seedTenant(currentDb, 1);
    const { token, summary } = await create(tenant.id);

    expect(await verifyToken(token)).toEqual({
      tokenId: summary.id,
      tenantId: tenant.id,
    });
  });

  it("runs the constant-time comparison on a hit, a miss and a malformed token", async () => {
    const tenant = await seedTenant(currentDb, 1);
    const { token } = await create(tenant.id);

    for (const presented of [token, generateToken(), "not-a-token", ""]) {
      vi.mocked(nodeCrypto.timingSafeEqual).mockClear();
      await verifyToken(presented);
      expect(nodeCrypto.timingSafeEqual).toHaveBeenCalledTimes(1);
    }
  });

  it("refuses unknown, malformed and truncated tokens", async () => {
    const tenant = await seedTenant(currentDb, 1);
    const { token } = await create(tenant.id);

    expect(await verifyToken(generateToken())).toBeNull();
    expect(await verifyToken("")).toBeNull();
    expect(await verifyToken(token.slice(0, -1))).toBeNull();
    expect(await verifyToken(`${token}x`)).toBeNull();
    expect(await verifyToken(token.toUpperCase())).toBeNull();
    // The stored hash is not a credential.
    expect(await verifyToken(hashToken(token))).toBeNull();
  });

  it("never verifies a revoked token", async () => {
    const tenant = await seedTenant(currentDb, 1);
    const { token, summary } = await create(tenant.id);

    expect(await revokeToken(tenant.id, summary.id)).toMatchObject({
      id: summary.id,
    });
    expect(await verifyToken(token)).toBeNull();
  });

  it("moves lastUsedAt at most once per minute", async () => {
    const tenant = await seedTenant(currentDb, 1);
    const { token } = await create(tenant.id);
    const lastUsed = async () => (await storedRows(tenant.id))[0]!.lastUsedAt;
    const t0 = new Date("2026-09-18T12:00:00Z");

    await verifyToken(token, t0);
    expect(await lastUsed()).toEqual(t0);

    await verifyToken(token, new Date(t0.getTime() + 59_000));
    expect(await lastUsed()).toEqual(t0);

    const t1 = new Date(t0.getTime() + 61_000);
    await verifyToken(token, t1);
    expect(await lastUsed()).toEqual(t1);
  });
});

describe("revokeToken", () => {
  it("cannot revoke a token of another workspace", async () => {
    const a = await seedTenant(currentDb, 1);
    const b = await seedTenant(currentDb, 2);
    const { token, summary } = await create(a.id);

    expect(await revokeToken(b.id, summary.id)).toBeNull();
    expect(await verifyToken(token)).not.toBeNull();
  });

  it("returns null the second time and drops the token from the list", async () => {
    const tenant = await seedTenant(currentDb, 1);
    const { summary } = await create(tenant.id);

    expect(await revokeToken(tenant.id, summary.id)).not.toBeNull();
    expect(await revokeToken(tenant.id, summary.id)).toBeNull();
    expect(await listTokens(tenant.id)).toEqual([]);
  });
});

describe("token cap", () => {
  it("refuses the token after the cap, per workspace, and counts only active ones", async () => {
    const a = await seedTenant(currentDb, 1);
    const b = await seedTenant(currentDb, 2);
    const created = [];
    for (let i = 0; i < MAX_ACTIVE_TOKENS; i += 1) {
      created.push(await create(a.id, `Token ${i}`));
    }

    expect(
      await createToken({ tenantId: a.id, name: "Extra", createdByKey: "u" }),
    ).toEqual({ ok: false, error: "limit" });
    expect(await storedRows(a.id)).toHaveLength(MAX_ACTIVE_TOKENS);

    // Another workspace has its own allowance.
    expect((await create(b.id)).ok).toBe(true);

    // Revoking one frees a slot.
    await revokeToken(a.id, created[0]!.summary.id);
    expect((await create(a.id, "After revoke")).ok).toBe(true);
    expect(await listTokens(a.id)).toHaveLength(MAX_ACTIVE_TOKENS);
  });
});

describe("listTokens", () => {
  it("lists only the workspace's own active tokens", async () => {
    const a = await seedTenant(currentDb, 1);
    const b = await seedTenant(currentDb, 2);
    await create(a.id, "Mine");
    await create(b.id, "Theirs");

    const list = await listTokens(a.id);
    expect(list.map((t) => t.name)).toEqual(["Mine"]);
    expect(Object.keys(list[0]!).sort()).toEqual(
      [
        "createdAt",
        "expiresAt",
        "id",
        "lastUsedAt",
        "name",
        "tokenPrefix",
      ].sort(),
    );
  });
});

describe("token expiry", () => {
  const DAY = 24 * 60 * 60 * 1000;

  it("gives a new token the default lifetime", async () => {
    const tenant = await seedTenant(currentDb, 1);
    const now = new Date("2026-11-11T12:00:00Z");
    const result = await createToken(
      { tenantId: tenant.id, name: "Desk", createdByKey: "user_1" },
      now,
    );
    if (!result.ok) throw new Error("cap");
    expect(result.summary.expiresAt.getTime()).toBe(
      now.getTime() + TOKEN_TTL_DAYS * DAY,
    );
  });

  it("verifies until the expiry and refuses afterwards", async () => {
    const tenant = await seedTenant(currentDb, 1);
    const now = new Date();
    const { token, summary } = await create(tenant.id);

    expect(
      await verifyToken(
        token,
        new Date(now.getTime() + (TOKEN_TTL_DAYS - 1) * DAY),
      ),
    ).toMatchObject({ tokenId: summary.id });
    expect(
      await verifyToken(
        token,
        new Date(now.getTime() + (TOKEN_TTL_DAYS + 1) * DAY),
      ),
    ).toBeNull();
  });

  it("gives rows without an explicit expiry the lifetime from now, not an immediate expiry", async () => {
    const tenant = await seedTenant(currentDb, 1);
    const token = generateToken();
    await currentDb.insert(schema.apiTokens).values({
      tenantId: tenant.id,
      name: "Existing",
      tokenHash: hashToken(token),
      tokenPrefix: token.slice(0, 13),
      createdByKey: "user_1",
      createdAt: new Date("2026-01-01T00:00:00Z"),
    });
    const [row] = await storedRows(tenant.id);
    const remaining = row!.expiresAt.getTime() - Date.now();
    expect(remaining).toBeGreaterThan((TOKEN_TTL_DAYS - 1) * DAY);
    expect(await verifyToken(token)).not.toBeNull();
  });

  it("does not count expired tokens against the cap", async () => {
    const tenant = await seedTenant(currentDb, 1);
    for (let i = 0; i < MAX_ACTIVE_TOKENS; i++)
      await create(tenant.id, `T${i}`);
    const later = new Date(Date.now() + (TOKEN_TTL_DAYS + 1) * DAY);
    const result = await createToken(
      { tenantId: tenant.id, name: "Fresh", createdByKey: "user_1" },
      later,
    );
    expect(result.ok).toBe(true);
  });
});
