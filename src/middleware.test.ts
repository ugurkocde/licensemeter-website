import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The status-host redirect must always target the configured origin. The old
 * `new URL(pathname + search, origin)` turned a protocol-relative path such as
 * `//evil.com` (or a backslash, which the URL parser treats as a slash) into an
 * off-host redirect; setting the pathname on the origin URL keeps the host fixed.
 */

vi.mock("next/server", () => ({
  NextResponse: {
    redirect: (url: URL) => ({ location: url.href }),
    next: () => ({ next: true }),
  },
}));

const { default: middleware } = await import("./middleware");

const request = (
  host: string,
  pathname: string,
  search = "",
): Parameters<typeof middleware>[0] =>
  ({
    headers: { get: (name: string) => (name === "host" ? host : null) },
    nextUrl: { pathname, search },
  }) as unknown as Parameters<typeof middleware>[0];

const locationOf = (pathname: string, search = "") =>
  (
    middleware(
      request("status.licensemeter.com", pathname, search),
    ) as unknown as { location: string }
  ).location;

describe("status-host redirect", () => {
  beforeEach(() => {
    vi.stubEnv("APP_BASE_URL", "https://licensemeter.com");
    vi.stubEnv("PUBLIC_SITE_URL", undefined);
    vi.stubEnv("SELF_HOSTED", undefined);
  });

  afterEach(() => vi.unstubAllEnvs());

  it("keeps a protocol-relative path on the configured host", () => {
    expect(locationOf("//evil.com")).toBe(
      "https://www.licensemeter.com//evil.com",
    );
  });

  it("keeps a backslash path on the configured host", () => {
    expect(locationOf("/\\evil.com")).toContain(
      "https://www.licensemeter.com/",
    );
    expect(locationOf("/\\evil.com")).not.toContain("evil.com/");
  });

  it("redirects a hosted status path directly to www", () => {
    expect(locationOf("/pricing", "?x=1")).toBe(
      "https://www.licensemeter.com/pricing?x=1",
    );
  });

  it("uses the public override before the app origin", () => {
    vi.stubEnv("PUBLIC_SITE_URL", "http://localhost:3000/");
    vi.stubEnv("SELF_HOSTED", "true");
    expect(locationOf("/pricing")).toBe("http://localhost:3000/pricing");
  });

  it("keeps a custom app origin when SELF_HOSTED is unset", () => {
    vi.stubEnv("APP_BASE_URL", "https://licenses.example.org");
    expect(locationOf("/pricing")).toBe("https://licenses.example.org/pricing");
  });
});
