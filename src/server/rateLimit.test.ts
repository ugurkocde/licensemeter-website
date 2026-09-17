import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "~/server/db/schema";

// The route/action code imports `db` from ~/server/db; back it with a fresh
// in-memory PGlite per test, seeded from the live Drizzle schema (same harness
// pattern as the webhook integration test).
let currentDb: ReturnType<typeof drizzle>;
let queryParameters: unknown[][] = [];

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

let cachedDdl: string[] | null = null;
async function seedSchema(client: PGlite): Promise<void> {
  cachedDdl ??= await generateMigration(
    generateDrizzleJson({}),
    generateDrizzleJson(schema),
  );
  for (const stmt of cachedDdl) await client.exec(stmt);
}

// Imported after the mock is registered (top-level vi.mock is hoisted).
const { rateLimitDurable, RateLimitUnavailableError, clientIp } =
  await import("./rateLimit");

beforeEach(async () => {
  const client = new PGlite();
  await seedSchema(client);
  queryParameters = [];
  currentDb = drizzle(client, {
    schema,
    logger: { logQuery: (_query, params) => queryParameters.push(params) },
  });
});

describe("rateLimitDurable", () => {
  it("encodes timestamp parameters for the production Postgres.js driver", async () => {
    expect(await rateLimitDurable("test:encoding", 3, 60_000)).toBe(true);
    const parameters = queryParameters.at(-1)!;
    expect(parameters.length).toBeGreaterThan(3);
    expect(parameters.some((value) => value instanceof Date)).toBe(false);
  });
  it("allows up to max then blocks within the window", async () => {
    const key = "test:allow";
    // max=3: first three allowed, fourth blocked.
    expect(await rateLimitDurable(key, 3, 60_000)).toBe(true);
    expect(await rateLimitDurable(key, 3, 60_000)).toBe(true);
    expect(await rateLimitDurable(key, 3, 60_000)).toBe(true);
    expect(await rateLimitDurable(key, 3, 60_000)).toBe(false);
    expect(await rateLimitDurable(key, 3, 60_000)).toBe(false);
  });

  it("resets once the window has elapsed", async () => {
    const key = "test:reset";
    // Exhaust the window, then backdate resetAt so the next call sees it as
    // expired (deterministic; avoids sleeping on a real timer).
    expect(await rateLimitDurable(key, 1, 60_000)).toBe(true);
    expect(await rateLimitDurable(key, 1, 60_000)).toBe(false);
    await currentDb
      .update(schema.rateLimits)
      .set({ resetAt: new Date(Date.now() - 1000) })
      .where(eq(schema.rateLimits.key, key));
    // Fresh window: allowed again, count reset to 1.
    expect(await rateLimitDurable(key, 1, 60_000)).toBe(true);
    expect(await rateLimitDurable(key, 1, 60_000)).toBe(false);
  });

  it("can fail closed for public email forms without changing the default", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const insert = vi.spyOn(currentDb, "insert").mockImplementation(() => {
      throw new Error("database unavailable");
    });
    try {
      expect(await rateLimitDurable("support:test", 3, 60000, "deny")).toBe(
        false,
      );
      expect(await rateLimitDurable("existing:test", 3, 60000)).toBe(true);
      await expect(
        rateLimitDurable("support:test", 3, 60000, "throw"),
      ).rejects.toBeInstanceOf(RateLimitUnavailableError);
    } finally {
      insert.mockRestore();
      log.mockRestore();
    }
  });

  it("counts keys independently", async () => {
    expect(await rateLimitDurable("test:a", 1, 60_000)).toBe(true);
    expect(await rateLimitDurable("test:a", 1, 60_000)).toBe(false);
    // A different key has its own fresh window.
    expect(await rateLimitDurable("test:b", 1, 60_000)).toBe(true);
  });
});

describe("clientIp", () => {
  const headersWith = (value: string | null) => ({
    get: (name: string) => (name === "x-real-ip" ? value : null),
  });

  it("returns a valid IPv4 or IPv6 address", () => {
    expect(clientIp(headersWith("203.0.113.9"))).toBe("203.0.113.9");
    expect(clientIp(headersWith(" 2001:db8::1 "))).toBe("2001:db8::1");
  });

  it("falls back to unknown when the header is missing or not an IP", () => {
    expect(clientIp(headersWith(null))).toBe("unknown");
    expect(clientIp(headersWith(""))).toBe("unknown");
    expect(clientIp(headersWith("evil.example"))).toBe("unknown");
    expect(clientIp(headersWith("203.0.113.9, 10.0.0.1"))).toBe("unknown");
    expect(clientIp(headersWith("' or 1=1"))).toBe("unknown");
  });
});
