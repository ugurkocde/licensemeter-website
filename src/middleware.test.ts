import { describe, expect, it, vi } from "vitest";

/**
 * The status-host redirect must always target the configured origin. The old
 * `new URL(pathname + search, apex)` turned a protocol-relative path such as
 * `//evil.com` (or a backslash, which the URL parser treats as a slash) into an
 * off-host redirect; setting the pathname on the apex URL keeps the host fixed.
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
  it("keeps a protocol-relative path on the configured host", () => {
    expect(locationOf("//evil.com")).toBe("https://licensemeter.com//evil.com");
  });

  it("keeps a backslash path on the configured host", () => {
    expect(locationOf("/\\evil.com")).toContain("https://licensemeter.com/");
    expect(locationOf("/\\evil.com")).not.toContain("evil.com/");
  });

  it("redirects an ordinary status path to the apex", () => {
    expect(locationOf("/pricing", "?x=1")).toBe(
      "https://licensemeter.com/pricing?x=1",
    );
  });
});
