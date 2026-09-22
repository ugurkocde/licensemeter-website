import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const notifyOps = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock("~/server/ops", () => ({ notifyOps }));

const { onRequestError, crashDetail, crashSignature } =
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
    expect(text).toBe(
      "unhandled error on GET /api/export/dpa: Cannot find module",
    );
    expect(opts.key).toBe("crash:GET /api/export/dpa:Cannot find module");
    expect(opts.cooldownMs).toBe(30 * 60 * 1000);
    expect(opts.subject).toBe("LicenseMeter error: GET /api/export/dpa");
    expect(opts.detail).toContain("Commit: abcdef1");
    expect(opts.detail).toContain("Kind: App Router / route");
    expect(opts.detail).toContain("Cannot find module");
    // The raw query string (user data) stays out of the alert.
    expect(JSON.stringify(notifyOps.mock.calls)).not.toContain("a@b.c");
  });

  it("falls back to the path without query when no route context is given", async () => {
    await onRequestError("plain failure", request);
    const [text] = notifyOps.mock.calls[0] as unknown as [string];
    expect(text).toBe("unhandled error on GET /api/export/dpa: plain failure");
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
    expect(detail.length).toBe(4000);
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
