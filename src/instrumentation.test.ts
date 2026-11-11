import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const notifyOps = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock("~/server/ops", () => ({ notifyOps }));

const { onRequestError, crashDetail, crashSignature, withoutQueryParams } =
  await import("~/instrumentation");

const request = { method: "GET", path: "/api/export/dpa?lang=de&email=a@b.c" };
const context = {
  routerKind: "App Router",
  routePath: "/api/export/dpa",
  routeType: "route",
};

beforeEach(() => {
  vi.stubEnv("NEXT_RUNTIME", "nodejs");
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "abcdef1234567890");
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  notifyOps.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("onRequestError", () => {
  it("alerts once per route and message with a crash key and detail", async () => {
    await onRequestError(
      new Error("Cannot find module\nsecond line"),
      request,
      context,
    );
    expect(notifyOps).toHaveBeenCalledTimes(1);
    const [text, opts] = notifyOps.mock.calls[0] as unknown as [
      string,
      { key: string; cooldownMs: number; subject: string; detail: string },
    ];
    // Alerts carry allowlisted fields only, never the message.
    expect(text).toBe("unhandled error on GET /api/export/dpa: Error");
    expect(opts.key).toMatch(/^crash:GET \/api\/export\/dpa:[0-9a-f]{8}$/);
    expect(opts.cooldownMs).toBe(30 * 60 * 1000);
    expect(opts.subject).toBe("LicenseMeter error: GET /api/export/dpa");
    expect(opts.detail).toContain("Commit: abcdef1");
    expect(opts.detail).toContain("Kind: App Router / route");
    expect(opts.detail).not.toContain("Cannot find module");
    expect(opts.detail).not.toContain("second line");
    // The raw query string (user data) stays out of the alert.
    expect(JSON.stringify(notifyOps.mock.calls)).not.toContain("a@b.c");
  });

  it("never uses the caller-controlled path when no route pattern is given", async () => {
    await onRequestError("plain failure", {
      method: "GET",
      path: "/app/alex-example",
    });
    const [text] = notifyOps.mock.calls[0] as unknown as [string];
    expect(text).toBe(
      "unhandled error on GET unknown route: Non-error value thrown",
    );
    expect(JSON.stringify(notifyOps.mock.calls)).not.toContain("alex");
  });

  it("stays silent on preview deployments", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    await onRequestError(new Error("boom"), request, context);
    expect(notifyOps).not.toHaveBeenCalled();
  });

  it("stays silent outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    await onRequestError(new Error("boom"), request, context);
    expect(notifyOps).not.toHaveBeenCalled();
  });

  it("skips the edge runtime", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge");
    await onRequestError(new Error("boom"), request, context);
    expect(notifyOps).not.toHaveBeenCalled();
  });

  it("never throws when alerting fails", async () => {
    notifyOps.mockRejectedValueOnce(new Error("resend down"));
    await expect(
      onRequestError(new Error("boom"), request, context),
    ).resolves.toBeUndefined();
  });
});

describe("crashDetail", () => {
  it("caps the stack excerpt", () => {
    const err = new Error("deep");
    err.stack = [
      "Error: deep",
      ...Array.from({ length: 30 }, (_, i) => `    at f${i}`),
    ].join("\n");
    const detail = crashDetail(err, request, context);
    expect(detail).toContain("at f9");
    expect(detail).not.toContain("at f10");
  });
});

describe("crashDetail size", () => {
  it("caps the detail for huge non-Error values", () => {
    const detail = crashDetail("x".repeat(50_000), request, context);
    expect(detail.length).toBeLessThanOrEqual(4000);
    expect(detail).not.toContain("xxx");
  });
});

describe("crashSignature", () => {
  it("masks per-occurrence tokens so repeats share one dedup key", () => {
    const a = crashSignature(
      'duplicate key value violates unique constraint "tenants_pkey" Key (id)=(3fa85f64-5717-4562-b3fc-2c963f66afa6) already exists',
    );
    const b = crashSignature(
      'duplicate key value violates unique constraint "tenants_pkey" Key (id)=(9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d) already exists',
    );
    expect(a).toBe(b);
    expect(a).toContain("<id>");
    expect(crashSignature("user jane@contoso.com not found")).toBe(
      "user <email> not found",
    );
    expect(crashSignature("row 4711 missing after 3 retries")).toBe(
      "row <n> missing after <n> retries",
    );
    expect(crashSignature("Cannot find module 'pdfkit'")).toBe(
      "Cannot find module 'pdfkit'",
    );
  });
});

describe("withoutQueryParams", () => {
  it("drops Drizzle parameters from message and stack and keeps the frames", async () => {
    const { DrizzleQueryError } = await import("drizzle-orm/errors");
    const err = new DrizzleQueryError(
      'update "findings" set "workflow_note" = $1',
      ["Follow up\n    at Alex Example\nwith HR"],
      new Error("deadlock detected"),
    );
    const safe = withoutQueryParams(err) as Error;
    for (const text of [
      safe.message,
      safe.stack ?? "",
      crashDetail(safe, request, context),
    ]) {
      expect(text).not.toContain("Alex Example");
      expect(text).not.toContain("with HR");
    }
    expect(safe.message).toBe(
      'Failed query: update "findings" set "workflow_note" = $1\nparams: <redacted>',
    );
    expect(safe.stack).toMatch(/\n\s+at .*instrumentation\.test/);
  });

  it("alerts a query error without its parameters", async () => {
    const { DrizzleQueryError } = await import("drizzle-orm/errors");
    await onRequestError(
      new DrizzleQueryError("select 1", ["alex@example.com", "Alex Example"]),
      request,
      context,
    );
    const calls = JSON.stringify(notifyOps.mock.calls);
    expect(calls).not.toContain("Alex Example");
    expect(calls).not.toContain("alex@example.com");
  });

  it("logs and alerts a Postgres-echoed value nowhere", async () => {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const { sql } = await import("drizzle-orm");
    const { inspect } = await import("node:util");
    let err: unknown;
    try {
      await drizzle(new PGlite()).execute(
        sql`select ${"Alex Example"}::integer`,
      );
    } catch (caught) {
      err = caught;
    }
    const logged: unknown[][] = [];
    const spy = vi
      .spyOn(console, "error")
      .mockImplementation((...args: unknown[]) => {
        logged.push(args);
      });
    try {
      await onRequestError(err, request, context);
    } finally {
      spy.mockRestore();
    }
    const everything = `${inspect(logged, { depth: 8 })}${JSON.stringify(notifyOps.mock.calls)}`;
    expect(everything).not.toContain("Alex Example");
    expect(everything).toContain("22P02");
  });

  it("keeps names and addresses in provider errors out of logs and alerts", async () => {
    const { GraphHttpError } = await import("~/server/graph/types");
    const graph = new GraphHttpError(
      403,
      "Authorization_RequestDenied",
      "Insufficient privileges for Alex Example (alex@example.com)",
    );
    const fetchFailure = new Error("Request for Alex Example failed", {
      cause: Object.assign(new Error("connect to Alex Example refused"), {
        code: "ECONNREFUSED",
      }),
    });
    const logged: unknown[][] = [];
    const spy = vi
      .spyOn(console, "error")
      .mockImplementation((...args: unknown[]) => {
        logged.push(args);
      });
    try {
      await onRequestError(graph, request, context);
      await onRequestError(fetchFailure, request, context);
    } finally {
      spy.mockRestore();
    }
    const { inspect } = await import("node:util");
    const everything = `${inspect(logged, { depth: 8 })}${JSON.stringify(notifyOps.mock.calls)}`;
    expect(everything).not.toContain("Alex Example");
    expect(everything).not.toContain("alex@example.com");
    expect(everything).toContain(
      "GraphHttpError HTTP 403 Authorization_RequestDenied",
    );
    expect(everything).toContain("Error ECONNREFUSED");
  });

  it("passes other errors through unchanged", () => {
    const err = new Error("boom");
    expect(withoutQueryParams(err)).toBe(err);
    expect(withoutQueryParams("text")).toBe("text");
  });
});
