import { describe, expect, it } from "vitest";

import { isSameOrigin } from "~/server/auth/origin";

/**
 * CSRF guard for custom POST handlers: with sameSite=lax a cross-site form POST
 * still reaches the route, so the only defense is comparing the browser-sent
 * Origin's host to the Host header. isSameOrigin is pure (reads two headers),
 * so a hand-built Request with the relevant headers fully exercises it.
 *
 * Contract: returns true when there is no Origin (non-browser clients) OR when
 * the Origin's host equals Host; false on a host mismatch or a malformed Origin.
 */
const reqWith = (headers: Record<string, string>): Request =>
  new Request("https://app.licensemeter.com/api/x", { method: "POST", headers });

describe("isSameOrigin", () => {
  it("is true when Origin's host matches Host (https, default port)", () => {
    expect(
      isSameOrigin(
        reqWith({ origin: "https://app.licensemeter.com", host: "app.licensemeter.com" }),
      ),
    ).toBe(true);
  });

  it("is true when host:port match including an explicit port", () => {
    expect(
      isSameOrigin(reqWith({ origin: "http://localhost:3000", host: "localhost:3000" })),
    ).toBe(true);
  });

  it("compares host (incl. port), so a protocol difference alone still matches", () => {
    // URL.host carries the port; scheme is intentionally not part of the check.
    expect(
      isSameOrigin(
        reqWith({ origin: "http://app.licensemeter.com", host: "app.licensemeter.com" }),
      ),
    ).toBe(true);
  });

  it("is false for a cross-origin host", () => {
    expect(
      isSameOrigin(
        reqWith({ origin: "https://evil.example", host: "app.licensemeter.com" }),
      ),
    ).toBe(false);
  });

  it("is false when only the port differs", () => {
    expect(
      isSameOrigin(reqWith({ origin: "http://localhost:4000", host: "localhost:3000" })),
    ).toBe(false);
  });

  it("is false for a look-alike subdomain (no suffix matching)", () => {
    expect(
      isSameOrigin(
        reqWith({
          origin: "https://app.licensemeter.com.evil.example",
          host: "app.licensemeter.com",
        }),
      ),
    ).toBe(false);
  });

  it("is false for a malformed / non-absolute Origin", () => {
    expect(
      isSameOrigin(reqWith({ origin: "not a url", host: "app.licensemeter.com" })),
    ).toBe(false);
    // Protocol-relative is not a valid absolute URL -> new URL throws -> false.
    expect(
      isSameOrigin(reqWith({ origin: "//app.licensemeter.com", host: "app.licensemeter.com" })),
    ).toBe(false);
  });

  it("is true when Origin is absent (non-browser client sends no Origin)", () => {
    expect(isSameOrigin(reqWith({ host: "app.licensemeter.com" }))).toBe(true);
  });

  it("is false when an Origin is present but Host is absent (can't prove same-origin)", () => {
    expect(isSameOrigin(reqWith({ origin: "https://evil.example" }))).toBe(false);
  });

  it("is true when both headers are absent", () => {
    expect(isSameOrigin(reqWith({}))).toBe(true);
  });

  it("does not let a userinfo@ trick spoof the host", () => {
    // new URL("https://app.licensemeter.com@evil.example").host === "evil.example"
    expect(
      isSameOrigin(
        reqWith({
          origin: "https://app.licensemeter.com@evil.example",
          host: "app.licensemeter.com",
        }),
      ),
    ).toBe(false);
  });
});
