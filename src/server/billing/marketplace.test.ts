import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type JWTVerifyGetKey,
} from "jose";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type { FulfillmentSubscription } from "./marketplace";

const mockEnv: Record<string, string | undefined> = {};
vi.mock("~/env", () => ({ env: mockEnv }));

const {
  acknowledgeOperation,
  getPublisherToken,
  MARKETPLACE_RESOURCE_ID,
  normalizePurchaseToken,
  planForMarketplaceId,
  resetMarketplaceTokenCache,
  resolveSubscription,
  subscriptionToEvent,
  verifyWebhookToken,
  withOperation,
} = await import("./marketplace");

const TENANT = "11111111-1111-4111-8111-111111111111";
const CLIENT = "22222222-2222-4222-8222-222222222222";
const SUB_ID = "33333333-3333-4333-8333-333333333333";
const OWNER = { tenantId: "44444444-4444-4444-8444-444444444444" };
const NOW = new Date("2026-09-19T12:00:00Z");

const META = {
  owner: OWNER,
  eventId: "op-1",
  type: "Renew",
  occurredAt: NOW,
};

const sub = (
  over: Partial<FulfillmentSubscription> = {},
): FulfillmentSubscription => ({
  id: SUB_ID,
  planId: "pro",
  quantity: null,
  saasSubscriptionStatus: "Subscribed",
  term: {
    startDate: "2026-09-01T00:00:00Z",
    endDate: "2026-09-30T00:00:00Z",
    termUnit: "P1M",
  },
  isFreeTrial: false,
  autoRenew: true,
  beneficiary: { emailId: "buyer@example.com", tenantId: "customer-tenant" },
  ...over,
});

beforeEach(() => {
  for (const key of Object.keys(mockEnv)) delete mockEnv[key];
});

describe("planForMarketplaceId", () => {
  it("defaults to the plan ids pro and msp", () => {
    expect(planForMarketplaceId("pro")).toBe("pro");
    expect(planForMarketplaceId("msp")).toBe("msp");
  });

  it("follows MARKETPLACE_PLAN_PRO and MARKETPLACE_PLAN_MSP", () => {
    mockEnv.MARKETPLACE_PLAN_PRO = "licensemeter-pro";
    mockEnv.MARKETPLACE_PLAN_MSP = "licensemeter-msp";
    expect(planForMarketplaceId("licensemeter-pro")).toBe("pro");
    expect(planForMarketplaceId("licensemeter-msp")).toBe("msp");
    expect(planForMarketplaceId("pro")).toBeNull();
  });

  it("answers null for an unknown, empty or missing plan id", () => {
    expect(planForMarketplaceId("gold")).toBeNull();
    expect(planForMarketplaceId("")).toBeNull();
    expect(planForMarketplaceId(null)).toBeNull();
  });
});

describe("subscriptionToEvent", () => {
  it("maps Subscribed to active with access to the end of the last valid day", () => {
    const event = subscriptionToEvent(sub(), META);
    expect(event).toMatchObject({
      provider: "marketplace",
      eventId: "op-1",
      type: "Renew",
      occurredAt: NOW,
      owner: OWNER,
      plan: "pro",
      status: "active",
      quantity: 1,
      trialEnd: null,
      cancelAtPeriodEnd: false,
      providerSubscriptionId: SUB_ID,
      providerCustomerId: "customer-tenant",
    });
    expect(event?.currentPeriodEnd?.toISOString()).toBe(
      "2026-10-01T00:00:00.000Z",
    );
  });

  it("maps a free trial to trialing with the term end as trial end", () => {
    const event = subscriptionToEvent(sub({ isFreeTrial: true }), META);
    expect(event?.status).toBe("trialing");
    expect(event?.trialEnd?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(event?.currentPeriodEnd).toEqual(event?.trialEnd);
  });

  it("gives a trial without term dates a provisional end after the event", () => {
    const event = subscriptionToEvent(
      sub({ isFreeTrial: true, term: null }),
      META,
    );
    expect(event?.status).toBe("trialing");
    expect(event?.trialEnd?.getTime()).toBeGreaterThan(NOW.getTime());
  });

  it("maps PendingFulfillmentStart to a status that grants nothing", () => {
    const event = subscriptionToEvent(
      sub({ saasSubscriptionStatus: "PendingFulfillmentStart", term: null }),
      META,
    );
    expect(event?.status).toBe("suspended");
    expect(event?.currentPeriodEnd).toBeNull();
  });

  it("treats PendingFulfillmentStart as subscribed once Activate succeeded", () => {
    const pending = sub({
      saasSubscriptionStatus: "PendingFulfillmentStart",
      term: null,
    });
    expect(
      subscriptionToEvent(pending, { ...META, activated: true })?.status,
    ).toBe("active");
    expect(
      subscriptionToEvent(
        { ...pending, isFreeTrial: true },
        { ...META, activated: true },
      )?.status,
    ).toBe("trialing");
  });

  it("maps Suspended to suspended", () => {
    expect(
      subscriptionToEvent(sub({ saasSubscriptionStatus: "Suspended" }), META)
        ?.status,
    ).toBe("suspended");
  });

  it("maps Unsubscribed to canceled with no remaining period", () => {
    const event = subscriptionToEvent(
      sub({ saasSubscriptionStatus: "Unsubscribed" }),
      META,
    );
    expect(event?.status).toBe("canceled");
    expect(event?.currentPeriodEnd).toBeNull();
    expect(event?.cancelAtPeriodEnd).toBe(false);
  });

  it("answers null for a status the docs do not list", () => {
    expect(
      subscriptionToEvent(sub({ saasSubscriptionStatus: "Paused" }), META),
    ).toBeNull();
  });

  it("marks an active subscription without auto renew as ending", () => {
    expect(
      subscriptionToEvent(sub({ autoRenew: false }), META)?.cancelAtPeriodEnd,
    ).toBe(true);
  });

  it("keeps Pro at one workspace whatever quantity Microsoft reports", () => {
    expect(subscriptionToEvent(sub({ quantity: 25 }), META)?.quantity).toBe(1);
  });

  it("reads the MSP quantity, never below the ten included tenants", () => {
    const msp = (quantity: FulfillmentSubscription["quantity"]) =>
      subscriptionToEvent(sub({ planId: "msp", quantity }), META)?.quantity;
    expect(msp(14)).toBe(14);
    expect(msp("12")).toBe(12);
    expect(msp(3)).toBe(10);
    expect(msp("")).toBe(10);
    expect(msp(null)).toBe(10);
  });

  it("answers null for an unknown plan id", () => {
    expect(subscriptionToEvent(sub({ planId: "gold" }), META)).toBeNull();
    expect(subscriptionToEvent(sub({ planId: null }), META)).toBeNull();
  });
});

describe("withOperation", () => {
  it("takes the new plan of a ChangePlan from the operation", () => {
    expect(
      withOperation(sub(), { action: "ChangePlan", planId: "msp" }).planId,
    ).toBe("msp");
  });

  it("takes the new quantity of a ChangeQuantity from the operation", () => {
    expect(
      withOperation(sub({ planId: "msp", quantity: 10 }), {
        action: "ChangeQuantity",
        quantity: 15,
      }).quantity,
    ).toBe(15);
  });

  it("reads a Reinstate as subscribed again", () => {
    expect(
      withOperation(sub({ saasSubscriptionStatus: "Suspended" }), {
        action: "Reinstate",
      }).saasSubscriptionStatus,
    ).toBe("Subscribed");
  });

  it("leaves notify only actions untouched", () => {
    const current = sub();
    expect(withOperation(current, { action: "Renew", planId: "msp" })).toBe(
      current,
    );
  });
});

describe("normalizePurchaseToken", () => {
  it("keeps a decoded token and restores a plus that arrived as a space", () => {
    expect(normalizePurchaseToken("ab+cd/ef")).toBe("ab+cd/ef");
    expect(normalizePurchaseToken("ab cd/ef")).toBe("ab+cd/ef");
  });

  it("refuses an empty, oversized or multi line token", () => {
    expect(normalizePurchaseToken("")).toBeNull();
    expect(normalizePurchaseToken(null)).toBeNull();
    expect(normalizePurchaseToken("a".repeat(5000))).toBeNull();
    expect(normalizePurchaseToken("ab\r\ncd")).toBeNull();
  });
});

describe("verifyWebhookToken", () => {
  let keys: JWTVerifyGetKey;
  let sign: (
    claims: Record<string, unknown>,
    opts?: { issuer?: string; audience?: string; expiresAt?: Date },
  ) => Promise<string>;
  let signWithOtherKey: typeof sign;

  const V2_ISSUER = `https://login.microsoftonline.com/${TENANT}/v2.0`;
  const V1_ISSUER = `https://sts.windows.net/${TENANT}/`;

  beforeAll(async () => {
    const trusted = await generateKeyPair("RS256");
    const other = await generateKeyPair("RS256");
    const jwk = { ...(await exportJWK(trusted.publicKey)), kid: "k1" };
    keys = createLocalJWKSet({ keys: [jwk] });
    const signer =
      (privateKey: CryptoKey): typeof sign =>
      (claims, opts = {}) =>
        new SignJWT(claims)
          .setProtectedHeader({ alg: "RS256", kid: "k1" })
          .setIssuer(opts.issuer ?? V2_ISSUER)
          .setAudience(opts.audience ?? CLIENT)
          .setIssuedAt(Math.floor(NOW.getTime() / 1000) - 60)
          .setExpirationTime(
            Math.floor(
              (
                opts.expiresAt ?? new Date(NOW.getTime() + 3_600_000)
              ).getTime() / 1000,
            ),
          )
          .sign(privateKey);
    sign = signer(trusted.privateKey);
    signWithOtherKey = signer(other.privateKey);
  });

  const verify = (token: string | null) =>
    verifyWebhookToken(token === null ? null : `Bearer ${token}`, {
      tenantId: TENANT,
      clientId: CLIENT,
      keys,
      now: NOW,
    });

  it("accepts a v2.0 token that names the Marketplace API in azp", async () => {
    const token = await sign({ tid: TENANT, azp: MARKETPLACE_RESOURCE_ID });
    expect(await verify(token)).toEqual({ ok: true });
  });

  it("accepts a v1.0 token that names the Marketplace API in appid", async () => {
    const token = await sign(
      { tid: TENANT, appid: MARKETPLACE_RESOURCE_ID },
      { issuer: V1_ISSUER },
    );
    expect(await verify(token)).toEqual({ ok: true });
  });

  it("rejects a missing or malformed authorization header", async () => {
    expect(await verify(null)).toEqual({ ok: false, reason: "missing" });
    expect(await verify("not-a-jwt")).toEqual({ ok: false, reason: "invalid" });
  });

  it("rejects the wrong audience", async () => {
    const token = await sign(
      { tid: TENANT, azp: MARKETPLACE_RESOURCE_ID },
      { audience: "55555555-5555-4555-8555-555555555555" },
    );
    expect(await verify(token)).toEqual({ ok: false, reason: "invalid" });
  });

  it("rejects the wrong issuer", async () => {
    const token = await sign(
      { tid: TENANT, azp: MARKETPLACE_RESOURCE_ID },
      {
        issuer:
          "https://login.microsoftonline.com/99999999-9999-4999-8999-999999999999/v2.0",
      },
    );
    expect(await verify(token)).toEqual({ ok: false, reason: "invalid" });
  });

  it("rejects an expired token", async () => {
    const token = await sign(
      { tid: TENANT, azp: MARKETPLACE_RESOURCE_ID },
      { expiresAt: new Date(NOW.getTime() - 3_600_000) },
    );
    expect(await verify(token)).toEqual({ ok: false, reason: "invalid" });
  });

  it("rejects a token signed with a key Entra does not publish", async () => {
    const token = await signWithOtherKey({
      tid: TENANT,
      azp: MARKETPLACE_RESOURCE_ID,
    });
    expect(await verify(token)).toEqual({ ok: false, reason: "invalid" });
  });

  it("rejects the wrong tenant claim", async () => {
    const token = await sign({
      tid: "99999999-9999-4999-8999-999999999999",
      azp: MARKETPLACE_RESOURCE_ID,
    });
    expect(await verify(token)).toEqual({ ok: false, reason: "wrongTenant" });
  });

  it("rejects the wrong caller app id, and a token without one", async () => {
    const other = await sign({ tid: TENANT, azp: CLIENT });
    expect(await verify(other)).toEqual({ ok: false, reason: "wrongCaller" });
    const none = await sign({ tid: TENANT });
    expect(await verify(none)).toEqual({ ok: false, reason: "wrongCaller" });
  });
});

describe("fulfillment client", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    mockEnv.MARKETPLACE_TENANT_ID = TENANT;
    mockEnv.MARKETPLACE_CLIENT_ID = CLIENT;
    mockEnv.MARKETPLACE_CLIENT_SECRET = "placeholder-secret";
    resetMarketplaceTokenCache();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const tokenResponse = () =>
    Response.json({ access_token: "publisher-token", expires_in: "3600" });

  it("requests the publisher token for the Marketplace resource and caches it", async () => {
    fetchMock.mockResolvedValue(tokenResponse());
    expect(await getPublisherToken()).toBe("publisher-token");
    expect(await getPublisherToken()).toBe("publisher-token");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`,
    );
    const body = init.body as URLSearchParams;
    expect(body.get("grant_type")).toBe("client_credentials");
    expect(body.get("client_id")).toBe(CLIENT);
    expect(body.get("scope")).toBe(`${MARKETPLACE_RESOURCE_ID}/.default`);
  });

  it("resolves with the purchase token header and the documented api version", async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(
      Response.json({
        id: SUB_ID,
        planId: "pro",
        subscription: {
          id: SUB_ID,
          planId: "pro",
          saasSubscriptionStatus: " PendingFulfillmentStart ",
          futureField: { anything: true },
        },
      }),
    );
    const resolved = await resolveSubscription("ab+cd/ef");
    expect(resolved.subscription.saasSubscriptionStatus).toBe(
      "PendingFulfillmentStart",
    );

    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe(
      "https://marketplaceapi.microsoft.com/api/saas/subscriptions/resolve?api-version=2018-08-31",
    );
    const headers = init.headers as Record<string, string>;
    expect(init.method).toBe("POST");
    expect(headers["x-ms-marketplace-token"]).toBe("ab+cd/ef");
    expect(headers.authorization).toBe("Bearer publisher-token");
    expect(headers["x-ms-requestid"]).toBeTruthy();
    expect(headers["x-ms-correlationid"]).toBeTruthy();
  });

  it("surfaces an expired purchase token as a 400 error without the token", async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(new Response("bad", { status: 400 }));
    await expect(resolveSubscription("secret-token")).rejects.toMatchObject({
      name: "MarketplaceApiError",
      status: 400,
      message: expect.not.stringContaining("secret-token") as string,
    });
  });

  it("acknowledges an operation with PATCH and treats 409 as settled", async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 409 }));
    await acknowledgeOperation(SUB_ID, "op-1", "Success");
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe(
      `https://marketplaceapi.microsoft.com/api/saas/subscriptions/${SUB_ID}/operations/op-1?api-version=2018-08-31`,
    );
    expect(init.method).toBe("PATCH");
    expect(init.body).toBe(JSON.stringify({ status: "Success" }));
    await expect(
      acknowledgeOperation(SUB_ID, "op-1", "Failure"),
    ).resolves.toBeUndefined();
  });
});
