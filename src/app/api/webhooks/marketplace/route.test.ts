import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let enabled = true;
vi.mock("~/env", () => ({
  env: {
    NODE_ENV: "test",
    MARKETPLACE_TENANT_ID: "11111111-1111-4111-8111-111111111111",
    MARKETPLACE_CLIENT_ID: "22222222-2222-4222-8222-222222222222",
    MARKETPLACE_CLIENT_SECRET: "placeholder-secret",
  },
  marketplaceEnabled: () => enabled,
}));

/** Any use of the database binding counts as a touch. */
let dbTouches = 0;
vi.mock("~/server/db", () => ({
  db: new Proxy(
    {},
    {
      get: () => {
        dbTouches += 1;
        throw new Error("the database must not be reached");
      },
    },
  ),
}));

const applyEntitlementEvent = vi.fn();
vi.mock("~/server/billing/entitlementWrites", () => ({
  applyEntitlementEvent,
}));
vi.mock("~/server/ops", () => ({ notifyOps: vi.fn() }));

const { POST } = await import("./route");

const fetchMock = vi.fn();

const PAYLOAD = JSON.stringify({
  id: "op-1",
  subscriptionId: "33333333-3333-4333-8333-333333333333",
  action: "Unsubscribe",
});

const request = (headers: Record<string, string>, body = PAYLOAD) =>
  new NextRequest("https://licensemeter.example/api/webhooks/marketplace", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });

/** Header and payload decode, the signature does not verify. */
const FORGED = [
  Buffer.from(JSON.stringify({ alg: "RS256", kid: "k1" })).toString(
    "base64url",
  ),
  Buffer.from(
    JSON.stringify({
      iss: "https://login.microsoftonline.com/11111111-1111-4111-8111-111111111111/v2.0",
      aud: "22222222-2222-4222-8222-222222222222",
      tid: "11111111-1111-4111-8111-111111111111",
      azp: "20e940b3-4c77-4b0b-9a53-9e16a1b010a7",
      exp: 4_102_444_800,
    }),
  ).toString("base64url"),
  Buffer.from("forged-signature").toString("base64url"),
].join(".");

beforeEach(() => {
  enabled = true;
  dbTouches = 0;
  applyEntitlementEvent.mockReset();
  fetchMock.mockReset();
  // The signing keys cannot be fetched, as in an offline test run.
  fetchMock.mockRejectedValue(new Error("offline"));
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("POST /api/webhooks/marketplace", () => {
  it("answers 503 when Marketplace is not configured", async () => {
    enabled = false;
    const res = await POST(request({ authorization: `Bearer ${FORGED}` }));
    expect(res.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(dbTouches).toBe(0);
    expect(applyEntitlementEvent).not.toHaveBeenCalled();
  });

  it("rejects a request without a bearer token and writes nothing", async () => {
    const res = await POST(request({}));
    expect(res.status).toBe(401);
    expect(dbTouches).toBe(0);
    expect(applyEntitlementEvent).not.toHaveBeenCalled();
  });

  it("rejects a malformed token and writes nothing", async () => {
    const res = await POST(request({ authorization: "Bearer not-a-jwt" }));
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(dbTouches).toBe(0);
    expect(applyEntitlementEvent).not.toHaveBeenCalled();
  });

  it("rejects a forged token with plausible claims and writes nothing", async () => {
    const res = await POST(request({ authorization: `Bearer ${FORGED}` }));
    expect(res.status).toBe(401);
    // Only the signing keys were asked for; no fulfillment call was made.
    for (const [url] of fetchMock.mock.calls as [URL | string][]) {
      expect(String(url)).toContain("login.microsoftonline.com");
      expect(String(url)).toContain("/discovery/");
    }
    expect(dbTouches).toBe(0);
    expect(applyEntitlementEvent).not.toHaveBeenCalled();
  });

  it("refuses an oversized body before reading it", async () => {
    const res = await POST(
      request({
        authorization: `Bearer ${FORGED}`,
        "content-length": String(10 * 1024 * 1024),
      }),
    );
    expect(res.status).toBe(413);
    expect(dbTouches).toBe(0);
  });
});
