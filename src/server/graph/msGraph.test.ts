import { afterEach, describe, expect, it, vi } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    // One token per call, standing in for Entra. The mocked client caches per
    // instance, so constructing a fresh client really does mint again.
    mint: vi.fn(),
    clientsCreated: 0,
  },
}));

vi.mock("@azure/msal-node", () => ({
  ConfidentialClientApplication: class {
    private cached: string | undefined;
    constructor() {
      mocks.clientsCreated += 1;
    }
    async acquireTokenByClientCredential(): Promise<{ accessToken: string }> {
      if (this.cached === undefined) {
        const result = (await mocks.mint()) as { accessToken: string };
        this.cached = result.accessToken;
      }
      return { accessToken: this.cached };
    }
  },
}));

vi.mock("~/env", () => ({
  env: {
    NODE_ENV: "test",
    CONNECTOR_CLIENT_ID: "connector-client-id",
    CONNECTOR_CLIENT_SECRET: "connector-client-secret",
  },
}));

import {
  MsGraphClient,
  parseRetryAfter,
  verifyManagedConsent,
  verifyMsCredential,
} from "./msGraph";

const NOW = Date.parse("2026-09-18T12:00:00Z");

/**
 * When admin consent lands, the connector app's service principal can take a
 * minute to appear. Until then Entra mints an app-only token without the `oid`
 * claim and Graph rejects it with Authorization_IdentityNotFound ("The identity
 * of the calling application could not be established"). The sync path must
 * drop that cached token and retry, while a test connection and the consent
 * probe answer immediately, exactly as before.
 */

const b64 = (value: unknown): string =>
  Buffer.from(JSON.stringify(value)).toString("base64url");

const appJwt = (payload: Record<string, unknown>): string =>
  `${b64({ alg: "none", typ: "JWT" })}.${b64(payload)}.signature`;

const withoutOid = (): string => appJwt({ roles: [] });
const withOid = (): string =>
  appJwt({ oid: "service-principal-oid", roles: [] });

const managedCred = (tid: string) => ({ mode: "managed" as const, tid });

const stubSkusFetch = () =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ value: [] })),
  );

afterEach(() => {
  mocks.mint.mockReset();
  mocks.clientsCreated = 0;
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
  it("discards the identity-less token, mints a fresh one and finishes the sync", async () => {
    vi.useFakeTimers();
    stubSkusFetch();
    mocks.mint
      .mockResolvedValueOnce({ accessToken: withoutOid() })
      .mockResolvedValueOnce({ accessToken: withOid() });

    const client = new MsGraphClient(
      managedCred("11111111-1111-1111-1111-111111111111"),
    );
    const pending = client.getSubscribedSkus();
    await vi.advanceTimersByTimeAsync(60_000);

    await expect(pending).resolves.toEqual([]);
    expect(mocks.mint).toHaveBeenCalledTimes(2);
    // A second client was built: the first, with its cached bad token, was dropped.
    expect(mocks.clientsCreated).toBe(2);
  });

  it("surfaces the identity error once the retries are exhausted, leaving no cached token", async () => {
    vi.useFakeTimers();
    stubSkusFetch();
    mocks.mint.mockResolvedValue({ accessToken: withoutOid() });

    const cred = managedCred("22222222-2222-2222-2222-222222222222");
    const pending = new MsGraphClient(cred).getSubscribedSkus();
    const assertion = expect(pending).rejects.toThrow(
      "The identity of the calling application could not be established",
    );
    await vi.advanceTimersByTimeAsync(60_000);
    await assertion;

    expect(mocks.mint).toHaveBeenCalledTimes(4);
    expect(mocks.clientsCreated).toBe(4);

    // The rejected client was not left cached: the next call builds a fresh one.
    await verifyMsCredential(cred);
    expect(mocks.clientsCreated).toBe(5);
  });

  it("does not treat an opaque token as identity-less", async () => {
    stubSkusFetch();
    mocks.mint.mockResolvedValue({ accessToken: "opaque-token" });

    const client = new MsGraphClient(
      managedCred("55555555-5555-5555-5555-555555555555"),
    );

    await expect(client.getSubscribedSkus()).resolves.toEqual([]);
    expect(mocks.mint).toHaveBeenCalledTimes(1);
  });
});

describe("immediate paths before the sync", () => {
  it("answers a test connection without retrying", async () => {
    mocks.mint.mockResolvedValue({ accessToken: withoutOid() });

    const result = await verifyMsCredential(
      managedCred("33333333-3333-3333-3333-333333333333"),
    );

    expect(result).toMatchObject({ ok: true });
    expect(mocks.mint).toHaveBeenCalledTimes(1);
  });

  it("does not leave the identity-less token cached across test connections", async () => {
    mocks.mint.mockResolvedValue({ accessToken: withoutOid() });

    await verifyMsCredential(
      managedCred("44444444-4444-4444-4444-444444444444"),
    );
    await verifyMsCredential(
      managedCred("44444444-4444-4444-4444-444444444444"),
    );

    // The bad token was evicted each time, so each call built a fresh client.
    expect(mocks.clientsCreated).toBe(2);
  });

  it("lets the consent probe succeed while the service principal propagates", async () => {
    mocks.mint.mockResolvedValue({ accessToken: withoutOid() });

    await expect(
      verifyManagedConsent("66666666-6666-6666-6666-666666666666"),
    ).resolves.toBe(true);
    expect(mocks.mint).toHaveBeenCalledTimes(1);
  });
});
