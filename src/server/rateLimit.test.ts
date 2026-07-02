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
const { rateLimitDurable } = await import("./rateLimit");

beforeEach(async () => {
  const client = new PGlite();
  await seedSchema(client);
  currentDb = drizzle(client, { schema });
});

describe("rateLimitDurable", () => {
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

  it("counts keys independently", async () => {
    expect(await rateLimitDurable("test:a", 1, 60_000)).toBe(true);
    expect(await rateLimitDurable("test:a", 1, 60_000)).toBe(false);
    // A different key has its own fresh window.
    expect(await rateLimitDurable("test:b", 1, 60_000)).toBe(true);
  });
});
