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
  DelegatedGraphClient,
  MsGraphClient,
  parseRetryAfter,
  verifyManagedConsent,
  verifyMsCredential,
} from "./msGraph";
import type { GraphClient } from "./types";

const NOW = Date.parse("2026-09-18T12:00:00Z");

/**
 * When admin consent lands, the connector app's service principal can take a
 * minute to appear. Until then Entra mints an app-only token without the `oid`
 * claim and Graph rejects it with Authorization_IdentityNotFound ("The identity
 * of the calling application could not be established"). The sync waits for the
 * identity, the consent probe waits through a token-endpoint propagation error
 * but accepts an issued token, and a test connection answers immediately.
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

// Well past the full 15s + 30s + 45s propagation schedule.
const advancePastPropagation = () => vi.advanceTimersByTimeAsync(120_000);

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
    await advancePastPropagation();

    await expect(pending).resolves.toEqual([]);
    expect(mocks.mint).toHaveBeenCalledTimes(2);
    // A second client was built: the first, with its cached bad token, was dropped.
    expect(mocks.clientsCreated).toBe(2);
  });

  it("surfaces the identity error once the waits are exhausted, leaving no cached token", async () => {
    vi.useFakeTimers();
    stubSkusFetch();
    mocks.mint.mockResolvedValue({ accessToken: withoutOid() });

    const cred = managedCred("22222222-2222-2222-2222-222222222222");
    const pending = new MsGraphClient(cred).getSubscribedSkus();
    const assertion = expect(pending).rejects.toThrow(
      "The identity of the calling application could not be established",
    );
    await advancePastPropagation();
    await assertion;

    expect(mocks.mint).toHaveBeenCalledTimes(4);
    expect(mocks.clientsCreated).toBe(4);

    // The rejected client was not left cached: the next call builds a fresh one.
    await verifyMsCredential(cred);
    expect(mocks.clientsCreated).toBe(5);
  });

  it("retries when Graph itself rejects the app identity", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => {
      if (fetchMock.mock.calls.length === 1) {
        return new Response(
          JSON.stringify({
            error: {
              code: "Authorization_IdentityNotFound",
              message:
                "The identity of the calling application could not be established.",
            },
          }),
          { status: 401, headers: { "content-type": "application/json" } },
        );
      }
      return Response.json({ value: [] });
    });
    vi.stubGlobal("fetch", fetchMock);
    mocks.mint.mockResolvedValue({ accessToken: withOid() });

    const client = new MsGraphClient(
      managedCred("77777777-7777-7777-7777-777777777777"),
    );
    const pending = client.getSubscribedSkus();
    await advancePastPropagation();

    await expect(pending).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mocks.clientsCreated).toBe(2);
  });

  it("evicts the client even when a Graph identity rejection persists", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: {
                code: "Authorization_IdentityNotFound",
                message:
                  "The identity of the calling application could not be established.",
              },
            }),
            { status: 401, headers: { "content-type": "application/json" } },
          ),
      ),
    );
    mocks.mint.mockResolvedValue({ accessToken: withOid() });

    const cred = managedCred("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    const pending = new MsGraphClient(cred).getSubscribedSkus();
    const assertion = expect(pending).rejects.toThrow(
      "The identity of the calling application could not be established",
    );
    await advancePastPropagation();
    await assertion;

    // Initial attempt plus the two Graph waits.
    expect(mocks.clientsCreated).toBe(3);

    // The rejected client was not left cached: the next call builds a fresh one.
    await verifyMsCredential(cred);
    expect(mocks.clientsCreated).toBe(4);
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

  it("fails the non-critical organization read fast instead of waiting", async () => {
    mocks.mint.mockResolvedValue({ accessToken: withoutOid() });

    await expect(
      new MsGraphClient(
        managedCred("88888888-8888-8888-8888-888888888888"),
      ).getOrganizationName(),
    ).resolves.toBeNull();
    expect(mocks.mint).toHaveBeenCalledTimes(1);
  });

  it("stops retrying once the propagation deadline has passed", async () => {
    vi.useFakeTimers();
    stubSkusFetch();
    mocks.mint.mockResolvedValue({ accessToken: withoutOid() });

    const client = new MsGraphClient(
      managedCred("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"),
      Date.now() + 10_000,
    );
    // Move past the deadline before the pull starts.
    await vi.advanceTimersByTimeAsync(20_000);

    const pending = client.getSubscribedSkus();
    const assertion = expect(pending).rejects.toThrow(
      "The identity of the calling application could not be established",
    );
    await vi.advanceTimersByTimeAsync(1_000);
    await assertion;

    // The first identity-less token ended the run: no retry sleep was taken.
    expect(mocks.mint).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("fails before the request when the deadline has already passed", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => Response.json({ value: [] }));
    vi.stubGlobal("fetch", fetchMock);
    mocks.mint.mockResolvedValue({ accessToken: withOid() });

    const client = new MsGraphClient(
      managedCred("dddddddd-dddd-dddd-dddd-dddddddddddd"),
      Date.now() - 1,
    );

    await expect(client.getSubscribedSkus()).rejects.toThrow(
      "Sync deadline reached before the request could start",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not sleep on a throttle wait that does not fit the deadline", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      async () =>
        new Response("", { status: 429, headers: { "retry-after": "30" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    mocks.mint.mockResolvedValue({ accessToken: withOid() });

    const client = new MsGraphClient(
      managedCred("cccccccc-cccc-cccc-cccc-cccccccccccc"),
      Date.now() + 5_000,
    );

    await expect(client.getSubscribedSkus()).rejects.toThrow(
      "Graph throttling persisted",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("immediate paths before the sync", () => {
  it("answers a test connection now with the service principal message", async () => {
    mocks.mint.mockResolvedValue({ accessToken: withoutOid() });

    const result = await verifyMsCredential(
      managedCred("33333333-3333-3333-3333-333333333333"),
    );

    expect(result).toEqual({
      ok: false,
      error:
        "The app has no service principal in that tenant yet. Grant admin consent for the app, then try again.",
    });
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
});

describe("consent probe", () => {
  it("succeeds while the service principal propagates", async () => {
    mocks.mint.mockResolvedValue({ accessToken: withoutOid() });

    await expect(
      verifyManagedConsent("66666666-6666-6666-6666-666666666666"),
    ).resolves.toBe(true);
    expect(mocks.mint).toHaveBeenCalledTimes(1);
  });

  it("waits through a token-endpoint propagation error before answering", async () => {
    vi.useFakeTimers();
    mocks.mint
      .mockRejectedValueOnce(
        new Error("AADSTS7000229: missing service principal in the tenant"),
      )
      .mockResolvedValueOnce({ accessToken: withOid() });

    const pending = verifyManagedConsent(
      "99999999-9999-9999-9999-999999999999",
    );
    await advancePastPropagation();

    await expect(pending).resolves.toBe(true);
    expect(mocks.mint).toHaveBeenCalledTimes(2);
  });
});

describe("directory reads", () => {
  const requestedUrls = (fetchMock: ReturnType<typeof vi.fn>): URL[] =>
    fetchMock.mock.calls.map((call) => new URL(String(call[0])));

  it("pages users at Graph's maximum of 999 in both clients", async () => {
    const fetchMock = vi.fn(async () => Response.json({ value: [] }));
    vi.stubGlobal("fetch", fetchMock);
    mocks.mint.mockResolvedValue({ accessToken: withOid() });

    await new MsGraphClient(
      managedCred("88888888-8888-8888-8888-888888888888"),
    ).listUsers({ includeSignInActivity: true });
    await new DelegatedGraphClient("delegated-token").listUsers({
      includeSignInActivity: false,
    });

    const [appOnly, delegated] = requestedUrls(fetchMock);
    expect(appOnly?.searchParams.get("$top")).toBe("999");
    expect(appOnly?.searchParams.get("$select")).toContain("signInActivity");
    expect(delegated?.searchParams.get("$top")).toBe("999");
    // Unlicensed users stay in the result: the connector leak rules need them.
    expect(appOnly?.searchParams.has("$filter")).toBe(false);
  });

  it("reads trial flags and renewal dates from /directory/subscriptions", async () => {
    const subscription = {
      skuId: "sku-1",
      skuPartNumber: "SPE_E3",
      status: "Enabled",
      isTrial: true,
      totalLicenses: 25,
      nextLifecycleDateTime: "2026-12-01T00:00:00Z",
    };
    const fetchMock = vi.fn(async () =>
      Response.json({ value: [subscription] }),
    );
    vi.stubGlobal("fetch", fetchMock);
    mocks.mint.mockResolvedValue({ accessToken: withOid() });

    const rows = await new MsGraphClient(
      managedCred("99999999-9999-9999-9999-999999999999"),
    ).getSubscriptions(Date.now() + 20_000);

    expect(rows).toEqual([subscription]);
    const [url] = requestedUrls(fetchMock);
    expect(url?.pathname).toBe("/v1.0/directory/subscriptions");
    expect(url?.searchParams.get("$select")).toBe(
      "skuId,skuPartNumber,status,isTrial,totalLicenses,nextLifecycleDateTime",
    );
  });

  it("gives up on throttled subscriptions within its own budget and leaves the rest of the sync budget intact", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async (url: string | URL) => {
      if (String(url).includes("/directory/subscriptions")) {
        return new Response(null, {
          status: 429,
          headers: { "retry-after": "5" },
        });
      }
      return Response.json({ value: [] });
    });
    vi.stubGlobal("fetch", fetchMock);
    mocks.mint.mockResolvedValue({ accessToken: withOid() });
    const client = new MsGraphClient(
      managedCred("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"),
      Date.now() + 240_000,
    );

    const pending = client.getSubscriptions(Date.now() + 12_000);
    const outcome = expect(pending).rejects.toMatchObject({
      status: 429,
      code: "throttled",
    });
    // Settles inside its 12 s budget: two 5 s waits fit, the third does not.
    await vi.advanceTimersByTimeAsync(12_000);
    await outcome;
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // The client's own deadline is untouched: the users pull still runs.
    await expect(
      client.listUsers({ includeSignInActivity: false }),
    ).resolves.toEqual([]);
  });

  it("settles by its deadline while the token is still being acquired", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => Response.json({ value: [] }));
    vi.stubGlobal("fetch", fetchMock);
    let deliverToken: ((value: { accessToken: string }) => void) | undefined;
    mocks.mint.mockReturnValue(
      new Promise((resolve) => {
        deliverToken = resolve;
      }),
    );
    const client = new MsGraphClient(
      managedCred("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"),
      Date.now() + 240_000,
    );

    const pending = client.getSubscriptions(Date.now() + 50);
    const outcome = expect(pending).rejects.toMatchObject({
      status: 504,
      code: "deadline_exceeded",
    });
    await vi.advanceTimersByTimeAsync(50);
    await outcome;

    // The token arrives late: the abandoned call must not reach Graph.
    deliverToken!({ accessToken: withOid() });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("leaves subscriptions out of the delegated instant scan", () => {
    const client: GraphClient = new DelegatedGraphClient("delegated-token");
    expect("getSubscriptions" in client).toBe(false);
  });
});
