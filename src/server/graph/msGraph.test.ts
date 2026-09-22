import { afterEach, describe, expect, it, vi } from "vitest";

const { acquireTokenByClientCredential } = vi.hoisted(() => ({
  acquireTokenByClientCredential: vi.fn(),
}));

vi.mock("@azure/msal-node", () => ({
  ConfidentialClientApplication: class {
    acquireTokenByClientCredential = acquireTokenByClientCredential;
  },
}));

vi.mock("~/env", () => ({
  env: {
    NODE_ENV: "test",
    CONNECTOR_CLIENT_ID: "connector-client-id",
    CONNECTOR_CLIENT_SECRET: "connector-client-secret",
  },
}));

import { MsGraphClient, parseRetryAfter, verifyMsCredential } from "./msGraph";

const NOW = Date.parse("2026-09-18T12:00:00Z");

/**
 * When admin consent lands, the connector app's service principal can take a
 * minute to appear. Until then Entra mints an app-only token without the `oid`
 * claim and Graph rejects it with Authorization_IdentityNotFound ("The identity
 * of the calling application could not be established"). MSAL caches that
 * unusable token, so the sync must detect the missing identity, drop the cached
 * client and retry, while a test connection must answer immediately.
 */

const b64 = (value: unknown): string =>
  Buffer.from(JSON.stringify(value)).toString("base64url");

const appJwt = (payload: Record<string, unknown>): string =>
  `${b64({ alg: "none", typ: "JWT" })}.${b64(payload)}.signature`;

const managedCred = (tid: string) => ({ mode: "managed" as const, tid });

afterEach(() => {
  acquireTokenByClientCredential.mockReset();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("parseRetryAfter", () => {
  it("reads delta-seconds", () => {
    expect(parseRetryAfter("2", NOW)).toBe(2000);
    expect(parseRetryAfter(" 7 ", NOW)).toBe(7000);
    expect(parseRetryAfter("0", NOW)).toBe(0);
  });

  it("reads an HTTP-date relative to now", () => {
    expect(parseRetryAfter("Fri, 18 Sep 2026 12:00:05 GMT", NOW)).toBe(5000);
    // A date in the past means retry immediately, never a negative sleep.
    expect(parseRetryAfter("Fri, 18 Sep 2026 11:59:00 GMT", NOW)).toBe(0);
  });

  it("clamps to 30 seconds", () => {
    expect(parseRetryAfter("120", NOW)).toBe(30_000);
    expect(parseRetryAfter("Fri, 18 Sep 2026 13:00:00 GMT", NOW)).toBe(30_000);
  });

  it("returns null for absent or unparsable headers so callers use a default", () => {
    expect(parseRetryAfter(null, NOW)).toBeNull();
    expect(parseRetryAfter("", NOW)).toBeNull();
    expect(parseRetryAfter("soon", NOW)).toBeNull();
    expect(parseRetryAfter("NaN", NOW)).toBeNull();
    expect(parseRetryAfter("-5", NOW)).toBeNull();
  });
});

describe("service principal propagation on the sync path", () => {
  it("retries with a fresh token when the minted token has no service principal identity", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ value: [] })),
    );
    acquireTokenByClientCredential
      .mockResolvedValueOnce({ accessToken: appJwt({ roles: [] }) })
      .mockResolvedValueOnce({
        accessToken: appJwt({ oid: "service-principal-oid", roles: [] }),
      });

    const client = new MsGraphClient(
      managedCred("11111111-1111-1111-1111-111111111111"),
    );
    const pending = client.getSubscribedSkus();
    await vi.advanceTimersByTimeAsync(60_000);

    await expect(pending).resolves.toEqual([]);
    expect(acquireTokenByClientCredential).toHaveBeenCalledTimes(2);
  });

  it("surfaces the identity error once the retries are exhausted", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ value: [] })),
    );
    acquireTokenByClientCredential.mockResolvedValue({
      accessToken: appJwt({ roles: [] }),
    });

    const client = new MsGraphClient(
      managedCred("22222222-2222-2222-2222-222222222222"),
    );
    const pending = client.getSubscribedSkus();
    const assertion = expect(pending).rejects.toThrow(
      "The identity of the calling application could not be established",
    );
    await vi.advanceTimersByTimeAsync(60_000);
    await assertion;

    expect(acquireTokenByClientCredential).toHaveBeenCalledTimes(4);
  });
});

describe("verifyMsCredential service principal handling", () => {
  it("answers a test connection immediately with the service principal message", async () => {
    acquireTokenByClientCredential.mockResolvedValue({
      accessToken: appJwt({ roles: [] }),
    });

    const result = await verifyMsCredential(
      managedCred("33333333-3333-3333-3333-333333333333"),
    );

    expect(result).toEqual({
      ok: false,
      error:
        "The app has no service principal in that tenant yet. Grant admin consent for the app, then try again.",
    });
    expect(acquireTokenByClientCredential).toHaveBeenCalledTimes(1);
  });
});
