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

const mocks = vi.hoisted(() => ({
  env: {
    NODE_ENV: "test",
    ALERT_WEBHOOK_URL: "https://hooks.example.test/ops",
    ALERT_EMAIL: undefined as string | undefined,
  },
  emailEnabled: vi.fn(() => false),
  sendEmail: vi.fn((_args: { subject: string; html: string }) =>
    Promise.resolve(true),
  ),
  // Default: behave like a call outside any request scope.
  after: vi.fn((_task: unknown): void => {
    throw new Error("`after` was called outside a request scope");
  }),
}));

vi.mock("~/env", () => ({ env: mocks.env }));

vi.mock("next/server", () => ({ after: mocks.after }));

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
  emailEnabled: mocks.emailEnabled,
  sendEmail: mocks.sendEmail,
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
  mocks.after.mockClear();
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

describe("notifyOps delivery", () => {
  it("hands the delivery to after() inside a request scope", async () => {
    mocks.after.mockImplementationOnce(() => undefined);
    const pending = notifyOps("sync FAILED");
    expect(mocks.after).toHaveBeenCalledTimes(1);
    expect(mocks.after.mock.calls[0]![0]).toBe(pending);
    await pending;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("still delivers when after() is unavailable", async () => {
    await notifyOps("sync FAILED");
    expect(mocks.after).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("puts the subject override and escaped detail in the email only", async () => {
    mocks.env.ALERT_EMAIL = "ops@example.test";
    mocks.emailEnabled.mockReturnValue(true);
    try {
      await notifyOps("unhandled error on GET /x: boom", {
        subject: "LicenseMeter error: GET /x",
        detail: "Error: boom <b>\n    at handler (route.ts:1:1)",
      });
      expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
      const email = mocks.sendEmail.mock.calls[0]![0];
      expect(email.subject).toBe("LicenseMeter error: GET /x");
      expect(email.html).toContain("<pre");
      expect(email.html).toContain("Error: boom &lt;b&gt;");
      const body = JSON.parse(fetchMock.mock.calls[0]![1]?.body as string) as {
        text: string;
      };
      expect(body.text).toBe("LicenseMeter: unhandled error on GET /x: boom");
    } finally {
      mocks.env.ALERT_EMAIL = undefined;
      mocks.emailEnabled.mockReturnValue(false);
      mocks.sendEmail.mockClear();
    }
  });

  it("keeps the default subject without an override", async () => {
    mocks.env.ALERT_EMAIL = "ops@example.test";
    mocks.emailEnabled.mockReturnValue(true);
    try {
      await notifyOps("sync FAILED");
      expect(mocks.sendEmail.mock.calls[0]![0].subject).toBe(
        "LicenseMeter alert: sync FAILED",
      );
      expect(mocks.sendEmail.mock.calls[0]![0].html).not.toContain("<pre");
    } finally {
      mocks.env.ALERT_EMAIL = undefined;
      mocks.emailEnabled.mockReturnValue(false);
      mocks.sendEmail.mockClear();
    }
  });
});
