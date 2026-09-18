import { afterEach, describe, expect, it } from "vitest";

import { isSameOrigin } from "~/server/auth/origin";

/**
 * CSRF guard for custom POST handlers: with sameSite=lax a cross-site form POST
 * still reaches the route, so the only defense is comparing the browser-sent
 * Origin to the origin the request was made to. That origin comes from the
 * request URL, or from APP_BASE_URL when SELF_HOSTED=true (the configured
 * public origin is authoritative behind a reverse proxy).
 *
 * Contract: returns true when there is no Origin (non-browser clients) OR when
 * the Origin equals the request origin (scheme, host and port); false on any
 * mismatch or a malformed Origin.
 */
const reqWith = (
  headers: Record<string, string>,
  url = "https://app.licensemeter.com/api/x",
): Request => new Request(url, { method: "POST", headers });

const originalSelfHosted = process.env.SELF_HOSTED;
const originalBaseUrl = process.env.APP_BASE_URL;

afterEach(() => {
  if (originalSelfHosted === undefined) delete process.env.SELF_HOSTED;
  else process.env.SELF_HOSTED = originalSelfHosted;
  if (originalBaseUrl === undefined) delete process.env.APP_BASE_URL;
  else process.env.APP_BASE_URL = originalBaseUrl;
});

describe("isSameOrigin", () => {
  it("is true when Origin matches the request origin (https, default port)", () => {
    expect(
      isSameOrigin(reqWith({ origin: "https://app.licensemeter.com" })),
    ).toBe(true);
  });

  it("is true when host:port match including an explicit port", () => {
    expect(
      isSameOrigin(
        reqWith(
          { origin: "http://localhost:3000" },
          "http://localhost:3000/api/x",
        ),
      ),
    ).toBe(true);
  });

  it("is false when only the scheme differs", () => {
    expect(
      isSameOrigin(reqWith({ origin: "http://app.licensemeter.com" })),
    ).toBe(false);
  });

  it("is false for a cross-origin host", () => {
    expect(isSameOrigin(reqWith({ origin: "https://evil.example" }))).toBe(
      false,
    );
  });

  it("is false when only the port differs", () => {
    expect(
      isSameOrigin(
        reqWith(
          { origin: "http://localhost:4000" },
          "http://localhost:3000/api/x",
        ),
      ),
    ).toBe(false);
  });

  it("is false for a look-alike subdomain (no suffix matching)", () => {
    expect(
      isSameOrigin(
        reqWith({ origin: "https://app.licensemeter.com.evil.example" }),
      ),
    ).toBe(false);
  });

  it("is false for a malformed / non-absolute Origin", () => {
    expect(isSameOrigin(reqWith({ origin: "not a url" }))).toBe(false);
    // Protocol-relative is not a valid absolute URL -> new URL throws -> false.
    expect(isSameOrigin(reqWith({ origin: "//app.licensemeter.com" }))).toBe(
      false,
    );
  });

  it("ignores the Host header (a proxy may rewrite it)", () => {
    expect(
      isSameOrigin(
        reqWith({
          origin: "https://app.licensemeter.com",
          host: "internal-upstream:3000",
        }),
      ),
    ).toBe(true);
  });

  it("is true when Origin is absent (non-browser client sends no Origin)", () => {
    expect(isSameOrigin(reqWith({}))).toBe(true);
  });

  it("does not let a userinfo@ trick spoof the host", () => {
    // new URL("https://app.licensemeter.com@evil.example").origin is evil.example
    expect(
      isSameOrigin(
        reqWith({ origin: "https://app.licensemeter.com@evil.example" }),
      ),
    ).toBe(false);
  });

  describe("self-hosted behind a reverse proxy", () => {
    it("compares against the configured APP_BASE_URL, not the request URL", () => {
      process.env.SELF_HOSTED = "true";
      process.env.APP_BASE_URL = "https://licenses.example.org";
      // The upstream sees a plain http request on the private port.
      const url = "http://127.0.0.1:3000/api/x";
      expect(
        isSameOrigin(reqWith({ origin: "https://licenses.example.org" }, url)),
      ).toBe(true);
      expect(
        isSameOrigin(reqWith({ origin: "http://127.0.0.1:3000" }, url)),
      ).toBe(false);
      expect(
        isSameOrigin(reqWith({ origin: "https://evil.example" }, url)),
      ).toBe(false);
    });

    it("fails closed when APP_BASE_URL is missing", () => {
      process.env.SELF_HOSTED = "true";
      delete process.env.APP_BASE_URL;
      expect(
        isSameOrigin(reqWith({ origin: "https://licenses.example.org" })),
      ).toBe(false);
    });
  });
});
