import { PGlite } from "@electric-sql/pglite";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "~/server/db/schema";

/**
 * notifyOps dedup against a real PGlite database: the cooldown claim is one
 * atomic upsert, so concurrent alerts with the same key send exactly once.
 */

let currentDb: ReturnType<typeof drizzle<typeof schema>>;
let client: PGlite;

const mocks = vi.hoisted(() => ({
  env: {
    NODE_ENV: "test",
    ALERT_WEBHOOK_URL: undefined as string | undefined,
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

const { notifyOps, sendDemoOpenDigest } = await import("~/server/ops");

const fetchMock = vi.fn((_input: string | URL | Request, _init?: RequestInit) =>
  Promise.resolve(new Response(null)),
);

beforeEach(async () => {
  client = new PGlite();
  const ddl = await generateMigration(
    generateDrizzleJson({}),
    generateDrizzleJson({ opsAlerts: schema.opsAlerts }),
  );
  for (const stmt of ddl) await client.exec(stmt);
  currentDb = drizzle(client, { schema });
  fetchMock.mockReset();
  mocks.after.mockClear();
  mocks.env.ALERT_WEBHOOK_URL = "https://hooks.example.test/ops";
  mocks.env.ALERT_EMAIL = undefined;
  mocks.emailEnabled.mockReset();
  mocks.sendEmail.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("VERCEL_ENV", "");
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(async () => {
  await client.close();
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
  it.each([
    "someone opened the demo workspace",
    "first sign-in from Microsoft tenant test-tenant",
    "workspace test-workspace connected its Microsoft tenant, first sync starting",
  ])("logs %s at info and still delivers it", async (message) => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    mocks.env.ALERT_EMAIL = "ops@example.test";
    mocks.emailEnabled.mockReturnValue(true);

    await notifyOps(message, { logLevel: "info" });

    expect(info).toHaveBeenCalledExactlyOnceWith(`[ops] ${message}`);
    expect(console.error).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(
      JSON.stringify({ text: `LicenseMeter: ${message}` }),
    );
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    expect(mocks.sendEmail.mock.calls[0]?.[0].html).toContain(message);
  });

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
    expect(console.error).toHaveBeenCalledWith("[ops] sync FAILED");
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

describe("daily demo open digest", () => {
  const recordOpen = () =>
    notifyOps("someone opened the demo workspace", {
      key: "demo-session",
      countForDigest: true,
    });
  const digestRow = eq(schema.opsAlerts.key, "daily-digest:demo-session");
  const readDigest = async () => {
    const [row] = await currentDb
      .select()
      .from(schema.opsAlerts)
      .where(digestRow);
    return row;
  };
  const useEmail = () => {
    mocks.env.ALERT_EMAIL = "ops@example.test";
    mocks.emailEnabled.mockReturnValue(true);
  };
  const moveClaimBackOneDay = () =>
    currentDb
      .update(schema.opsAlerts)
      .set({
        lastSentAt: sql`${schema.opsAlerts.lastSentAt} - interval '24 hours'`,
      })
      .where(digestRow);
  const webhookText = (index: number) =>
    (
      JSON.parse(fetchMock.mock.calls[index]![1]?.body as string) as {
        text: string;
      }
    ).text;

  it("does not deliver or record a digest event without a key", async () => {
    await notifyOps("someone opened the demo workspace", {
      countForDigest: true,
    });
    expect(console.error).toHaveBeenCalledWith(
      "[ops] digest event requires a key",
    );
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(currentDb.select().from(schema.opsAlerts)).resolves.toEqual(
      [],
    );
  });

  it("counts overlapping demo notifications and sends one digest for repeated cron calls in PGlite", async () => {
    await Promise.all(Array.from({ length: 7 }, recordOpen));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      "[ops] someone opened the demo workspace",
    );

    await Promise.all(Array.from({ length: 5 }, sendDemoOpenDigest));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(webhookText(0)).toBe(
      "LicenseMeter: Demo workspace opened 7 times since tracking began",
    );
    const row = await readDigest();
    expect(row?.suppressedCount).toBe(0);
    expect(row?.lastSentAt.toISOString()).toMatch(/T05:00:00\.000Z$/);
  });

  it("keeps new opens for the next 24-hour window", async () => {
    await recordOpen();
    await sendDemoOpenDigest();
    await recordOpen();
    await sendDemoOpenDigest();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await moveClaimBackOneDay();
    await sendDemoOpenDigest();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(webhookText(1)).toBe(
      "LicenseMeter: Demo workspace opened 1 time since the last digest",
    );
  });

  it("accounts for an open queued alongside repeated digest calls in PGlite", async () => {
    await recordOpen();
    await Promise.all([
      sendDemoOpenDigest(),
      recordOpen(),
      sendDemoOpenDigest(),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const sentCount = Number(/opened (\d+)/.exec(webhookText(0))?.[1]);
    const row = await readDigest();
    expect(sentCount + row!.suppressedCount).toBe(2);
  });

  it.each([
    [
      "the webhook rejects",
      () => fetchMock.mockRejectedValueOnce(new Error("offline")),
    ],
    [
      "the webhook returns HTTP 500",
      () =>
        fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 })),
    ],
    [
      "Resend throws",
      () => {
        mocks.env.ALERT_WEBHOOK_URL = undefined;
        useEmail();
        mocks.sendEmail.mockRejectedValueOnce(new Error("Resend unavailable"));
      },
    ],
    [
      "Resend returns false",
      () => {
        mocks.env.ALERT_WEBHOOK_URL = undefined;
        useEmail();
        mocks.sendEmail.mockResolvedValueOnce(false);
      },
    ],
  ])(
    "restores the count and prior window when %s",
    async (_failure, configure) => {
      await Promise.all([recordOpen(), recordOpen()]);
      const previousSentAt = new Date("2000-01-01T05:00:00Z");
      await currentDb
        .update(schema.opsAlerts)
        .set({ lastSentAt: previousSentAt })
        .where(digestRow);
      configure();
      await sendDemoOpenDigest();

      expect(console.error).toHaveBeenCalledWith(
        "[ops] digest delivery failed",
      );
      expect(await readDigest()).toMatchObject({
        suppressedCount: 2,
        lastSentAt: previousSentAt,
      });
      await sendDemoOpenDigest();
      expect((await readDigest())?.suppressedCount).toBe(0);
    },
  );

  it("adds failed delivery counts to opens recorded while it was sending", async () => {
    await recordOpen();
    fetchMock.mockImplementationOnce(async () => {
      await recordOpen();
      return new Response(null, { status: 500 });
    });
    await sendDemoOpenDigest();
    expect(await readDigest()).toMatchObject({
      suppressedCount: 2,
      lastSentAt: new Date(0),
    });
  });

  it("restores the count without overwriting a newer window claim", async () => {
    await recordOpen();
    const newerWindow = new Date("2100-01-01T05:00:00Z");
    fetchMock.mockImplementationOnce(async () => {
      await currentDb
        .update(schema.opsAlerts)
        .set({ lastSentAt: newerWindow })
        .where(digestRow);
      return new Response(null, { status: 500 });
    });
    await sendDemoOpenDigest();
    expect(await readDigest()).toMatchObject({
      suppressedCount: 1,
      lastSentAt: newerWindow,
    });
  });

  it("keeps counting without claiming when no alert channels are configured", async () => {
    mocks.env.ALERT_WEBHOOK_URL = undefined;
    await recordOpen();
    await sendDemoOpenDigest();
    await recordOpen();
    expect(await readDigest()).toMatchObject({
      suppressedCount: 2,
      lastSentAt: new Date(0),
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("neither counts nor claims in a preview deployment", async () => {
    await recordOpen();
    vi.stubEnv("VERCEL_ENV", "preview");
    await recordOpen();
    await sendDemoOpenDigest();
    expect(await readDigest()).toMatchObject({
      suppressedCount: 1,
      lastSentAt: new Date(0),
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("delivers through email alone with a digest subject and body", async () => {
    mocks.env.ALERT_WEBHOOK_URL = undefined;
    useEmail();
    await recordOpen();
    await currentDb
      .update(schema.opsAlerts)
      .set({ lastSentAt: new Date("2000-01-01T05:00:00Z") })
      .where(digestRow);
    await recordOpen();
    await sendDemoOpenDigest();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    const { subject, html } = mocks.sendEmail.mock.calls[0]![0];
    expect(subject).toBe(
      "LicenseMeter: demo workspace opened 2 times since the last digest",
    );
    expect(html).toContain(
      "Demo workspace opened 2 times since the last digest",
    );
    expect(html).not.toContain("Sync failures and crashes");
    expect((await readDigest())?.suppressedCount).toBe(0);
  });

  it("keeps the claim when one channel accepts the digest", async () => {
    useEmail();
    mocks.sendEmail.mockRejectedValueOnce(new Error("Resend unavailable"));
    await recordOpen();
    await sendDemoOpenDigest();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    expect((await readDigest())?.suppressedCount).toBe(0);
  });

  it("sends nothing on empty days and ignores legacy and other ops keys", async () => {
    await notifyOps("legacy demo alert", {
      key: "demo-session",
      cooldownMs: 60_000,
    });
    await notifyOps("legacy demo alert", {
      key: "demo-session",
      cooldownMs: 60_000,
    });
    await sendDemoOpenDigest();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await recordOpen();
    await notifyOps("sync FAILED", { key: "sync:t1", cooldownMs: 60_000 });
    await notifyOps("sync FAILED", { key: "sync:t1", cooldownMs: 60_000 });
    await sendDemoOpenDigest();
    expect(webhookText(1)).toBe("LicenseMeter: sync FAILED");
    expect(webhookText(2)).toBe(
      "LicenseMeter: Demo workspace opened 1 time since tracking began",
    );

    await moveClaimBackOneDay();
    await sendDemoOpenDigest();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [sync] = await currentDb
      .select()
      .from(schema.opsAlerts)
      .where(eq(schema.opsAlerts.key, "sync:t1"));
    expect(sync?.suppressedCount).toBe(1);
  });
});

describe("redactForOps", () => {
  it("drops multiline parameters from a Drizzle error message and stack", async () => {
    const { redactForOps } = await import("./ops");
    const { DrizzleQueryError } = await import("drizzle-orm/errors");
    const err = new DrizzleQueryError(
      'update "findings" set "workflow_note" = $1 where "id" = $2',
      [
        "Follow up\nAlex Example\nwith HR",
        "00000000-0000-0000-0000-000000000001",
      ],
      new Error("deadlock detected"),
    );
    for (const text of [err.message, err.stack ?? ""]) {
      const out = redactForOps(text);
      expect(out).toContain("params: <redacted>");
      expect(out).not.toContain("Alex Example");
      expect(out).not.toContain("with HR");
      expect(out).not.toContain("00000000-0000-0000-0000-000000000001");
      expect(out).toContain('update "findings"');
    }
  });

  it("cannot be ended early by a parameter that imitates a stack frame", async () => {
    const { redactForOps } = await import("./ops");
    const out = redactForOps(
      "Failed query: update x\nparams: Follow up\n    at Alex Example\nwith HR,1f0c\n    at execute (/app/query.js:10:1)",
    );
    expect(out).toBe("Failed query: update x\nparams: <redacted>");
  });

  it("replaces email-shaped values, guest UPNs included", async () => {
    const { redactForOps } = await import("./ops");
    expect(
      redactForOps(
        "send failed for alex.example@contoso.com and jane_contoso.com#EXT#@fabrikam.onmicrosoft.com",
      ),
    ).toBe("send failed for <email> and <email>");
  });

  it("stays linear on long text without an address", async () => {
    const { redactForOps } = await import("./ops");
    const long = `${"a".repeat(200_000)} ${"params: x\n".repeat(10_000)}`;
    const started = performance.now();
    redactForOps(long);
    expect(performance.now() - started).toBeLessThan(1000);
    expect(redactForOps(`${"a".repeat(70)}@example.com`)).toBe("<email>");
  });

  it("drops the bound parameters of a failed query", async () => {
    const { redactForOps } = await import("./ops");
    expect(
      redactForOps(
        'Failed query: insert into "memberships" values ($1, $2)\nparams: 1f0c,alex@contoso.com',
      ),
    ).toBe(
      'Failed query: insert into "memberships" values ($1, $2)\nparams: <redacted>',
    );
  });
});
