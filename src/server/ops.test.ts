import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "~/server/db/schema";

/**
 * notifyOps dedup against a real PGlite database: the cooldown claim is one
 * atomic upsert, so concurrent alerts with the same key send exactly once.
 */

let currentDb: ReturnType<typeof drizzle<typeof schema>>;

vi.mock("~/env", () => ({
  env: {
    NODE_ENV: "test",
    ALERT_WEBHOOK_URL: "https://hooks.example.test/ops",
    ALERT_EMAIL: undefined,
  },
}));

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

vi.mock("~/server/email", () => ({
  emailEnabled: () => false,
  sendEmail: vi.fn(() => Promise.resolve()),
}));

const { notifyOps } = await import("~/server/ops");

const fetchMock = vi.fn((_input: string | URL | Request, _init?: RequestInit) =>
  Promise.resolve(new Response(null)),
);

beforeEach(async () => {
  const client = new PGlite();
  const ddl = await generateMigration(
    generateDrizzleJson({}),
    generateDrizzleJson({ opsAlerts: schema.opsAlerts }),
  );
  for (const stmt of ddl) await client.exec(stmt);
  currentDb = drizzle(client, { schema });
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("VERCEL_ENV", "");
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("notifyOps dedup", () => {
  it("sends once for concurrent alerts sharing a key and counts the rest", async () => {
    await Promise.all(
      Array.from({ length: 5 }, () =>
        notifyOps("sync FAILED", { key: "sync:t1", cooldownMs: 60_000 }),
      ),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [row] = await currentDb.select().from(schema.opsAlerts);
    expect(row?.suppressedCount).toBe(4);
  });

  it("sends again after the cooldown with the suppressed count", async () => {
    await notifyOps("sync FAILED", { key: "sync:t1", cooldownMs: 60_000 });
    await notifyOps("sync FAILED", { key: "sync:t1", cooldownMs: 60_000 });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await currentDb
      .update(schema.opsAlerts)
      .set({ lastSentAt: new Date(Date.now() - 120_000) });
    await notifyOps("sync FAILED", { key: "sync:t1", cooldownMs: 60_000 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const body = fetchMock.mock.calls[1]![1]?.body;
    expect(typeof body).toBe("string");
    expect(JSON.parse(body as string)).toEqual({
      text: "LicenseMeter: sync FAILED (1 similar suppressed since the last alert)",
    });
    const [row] = await currentDb.select().from(schema.opsAlerts);
    expect(row?.suppressedCount).toBe(0);
  });

  it("stays silent on Vercel preview deployments", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    await notifyOps("sync FAILED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stays silent outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    await notifyOps("sync FAILED");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
