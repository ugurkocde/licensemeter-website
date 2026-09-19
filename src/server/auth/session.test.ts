import { SignJWT } from "jose";
import { describe, expect, it, vi } from "vitest";

/**
 * OAuth-cookie payload guard: the kind marker that branches the delegated
 * instant scan off the shared callback must be backward compatible (legacy
 * sign-in payloads carry no kind) and strict (only the exact literal "scan"
 * counts, anything else reads as a plain sign-in).
 */

// session.ts pulls ~/env at import; provide the only required test-env var
// before the dynamic import below. next/headers is request-scoped and never
// exercised by these tests.
process.env.AUTH_SECRET ??= "test-secret-test-secret";
vi.mock("next/headers", () => ({
  cookies: () => {
    throw new Error("cookies() must not be called in unit tests");
  },
}));

const {
  createOAuthToken,
  expiredOAuthCookie,
  expiredSessionCookie,
  parseOAuthToken,
  validateReturnTo,
} = await import("~/server/auth/session");

const key = new TextEncoder().encode(process.env.AUTH_SECRET);

/** Signs a payload exactly like pre-scan deployments did. */
const legacyToken = (payload: Record<string, unknown>): Promise<string> =>
  new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("600s")
    .sign(key);

describe("parseOAuthToken", () => {
  it("round-trips a scan payload", async () => {
    const token = await createOAuthToken({
      state: "s1",
      verifier: "v1",
      kind: "scan",
    });
    expect(await parseOAuthToken(token)).toEqual({
      state: "s1",
      verifier: "v1",
      kind: "scan",
    });
  });

  it("round-trips a sign-in payload without a kind", async () => {
    const token = await createOAuthToken({ state: "s2", verifier: "v2" });
    expect(await parseOAuthToken(token)).toEqual({
      state: "s2",
      verifier: "v2",
    });
  });

  it("stays backward compatible with legacy payloads signed before the kind existed", async () => {
    const token = await legacyToken({ state: "s3", verifier: "v3" });
    const parsed = await parseOAuthToken(token);
    expect(parsed).toEqual({ state: "s3", verifier: "v3" });
    expect(parsed?.kind).toBeUndefined();
  });

  it("treats unknown kind values as plain sign-ins, never as scans", async () => {
    const token = await legacyToken({
      state: "s4",
      verifier: "v4",
      kind: "evil",
    });
    expect((await parseOAuthToken(token))?.kind).toBeUndefined();
  });

  it("rejects payloads missing state or verifier", async () => {
    expect(
      await parseOAuthToken(await legacyToken({ state: "s5" })),
    ).toBeNull();
    expect(
      await parseOAuthToken(await legacyToken({ verifier: "v5" })),
    ).toBeNull();
  });

  it("rejects absent, garbage and wrongly-signed tokens", async () => {
    expect(await parseOAuthToken(undefined)).toBeNull();
    expect(await parseOAuthToken("not-a-jwt")).toBeNull();
    const foreign = await new SignJWT({ state: "s6", verifier: "v6" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("600s")
      .sign(new TextEncoder().encode("a-completely-different-signing-key"));
    expect(await parseOAuthToken(foreign)).toBeNull();
  });

  it("round-trips a valid returnTo", async () => {
    const token = await createOAuthToken({
      state: "s7",
      verifier: "v7",
      returnTo: "/app/connect/csv",
    });
    expect(await parseOAuthToken(token)).toEqual({
      state: "s7",
      verifier: "v7",
      returnTo: "/app/connect/csv",
    });
  });

  it("strips an invalid returnTo at consumption time instead of trusting the cookie", async () => {
    const token = await legacyToken({
      state: "s8",
      verifier: "v8",
      returnTo: "https://evil.example/app",
    });
    const parsed = await parseOAuthToken(token);
    expect(parsed).toEqual({ state: "s8", verifier: "v8" });
    expect(parsed?.returnTo).toBeUndefined();
  });
});

/**
 * Post-sign-in redirect targets: in-app paths only. The same guard runs when
 * the signin route mints the cookie and when the callback consumes it.
 */
describe("validateReturnTo", () => {
  it("accepts in-app paths", () => {
    expect(validateReturnTo("/app")).toBe("/app");
    expect(validateReturnTo("/app/connect/csv")).toBe("/app/connect/csv");
    expect(validateReturnTo("/app/connectors/zoom")).toBe(
      "/app/connectors/zoom",
    );
  });

  it("accepts the Marketplace landing page with its purchase token", () => {
    expect(validateReturnTo("/marketplace/landing")).toBe(
      "/marketplace/landing",
    );
    expect(validateReturnTo("/marketplace/landing?token=abc%2Bdef%3D")).toBe(
      "/marketplace/landing?token=abc%2Bdef%3D",
    );
    expect(validateReturnTo("/marketplace/landing-evil")).toBeNull();
    expect(validateReturnTo("/marketplace")).toBeNull();
    expect(
      validateReturnTo("/marketplace/landing?token=https://evil.example"),
    ).toBeNull();
  });

  it("rejects absent values and anything outside /app", () => {
    expect(validateReturnTo(null)).toBeNull();
    expect(validateReturnTo(undefined)).toBeNull();
    expect(validateReturnTo("")).toBeNull();
    expect(validateReturnTo("/")).toBeNull();
    expect(validateReturnTo("/faq")).toBeNull();
    expect(validateReturnTo("app/connect")).toBeNull();
  });

  it("rejects absolute, protocol-relative, backslash and CR/LF forms", () => {
    expect(validateReturnTo("https://evil.example/app")).toBeNull();
    expect(validateReturnTo("//evil.example/app")).toBeNull();
    expect(validateReturnTo("/app://evil.example")).toBeNull();
    expect(validateReturnTo("/app\\evil")).toBeNull();
    expect(validateReturnTo("/app/x\r\nSet-Cookie: a=b")).toBeNull();
    expect(validateReturnTo("/app/x\n")).toBeNull();
  });
});

/**
 * Cookie deletion is a Set-Cookie too, and browsers drop any Set-Cookie for
 * a __Host- name without Secure. The expired-cookie helpers must therefore
 * mirror the exact attributes the cookies were set with, in dev and in prod.
 */
describe("expired cookie helpers", () => {
  it("expire with the same attributes the cookie was set with", () => {
    expect(expiredSessionCookie()).toEqual({
      name: "lm_session",
      value: "",
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
      maxAge: 0,
    });
    expect(expiredOAuthCookie()).toEqual({
      name: "lm_oauth",
      value: "",
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
      maxAge: 0,
    });
  });

  it("carries Secure, path '/' and the __Host- name in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    // Production env validation wants a longer secret than the test default.
    vi.stubEnv("AUTH_SECRET", "prod-secret-prod-secret-prod-secret");
    vi.resetModules();
    try {
      const prod = await import("~/server/auth/session");
      expect(prod.expiredSessionCookie()).toEqual({
        name: "__Host-lm_session",
        value: "",
        httpOnly: true,
        sameSite: "lax",
        secure: true,
        path: "/",
        maxAge: 0,
      });
      expect(prod.expiredOAuthCookie()).toEqual({
        name: "__Host-lm_oauth",
        value: "",
        httpOnly: true,
        sameSite: "lax",
        secure: true,
        path: "/",
        maxAge: 0,
      });
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});
