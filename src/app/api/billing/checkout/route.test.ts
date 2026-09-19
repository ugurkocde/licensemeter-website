import { beforeEach, describe, expect, it, vi } from "vitest";

const TENANT_ID = "11111111-1111-1111-1111-000000000001";
const MSP_ID = "aaaaaaaa-0000-0000-0000-000000000001";
let enabled = true;

vi.mock("~/env", () => ({
  polarEnabled: () => enabled,
  appBaseUrl: () => "https://licensemeter.com",
}));
vi.mock("~/server/access", () => ({ apiAccess: vi.fn() }));
vi.mock("~/server/audit", () => ({ audit: vi.fn() }));
vi.mock("~/server/rateLimit", () => ({ rateLimitDurable: vi.fn() }));
vi.mock("~/server/billing/mspAccount", () => ({
  MspAccountError: class extends Error {},
  ensureMspAccount: vi.fn(),
}));
// ownerRef is pure; the module also pulls in the database client, so the
// real writer is kept out of this unit test.
vi.mock("~/server/billing/entitlementWrites", () => ({
  ownerRef: (owner: { tenantId?: string; mspAccountId?: string }) =>
    owner.tenantId ? `t_${owner.tenantId}` : `m_${owner.mspAccountId}`,
}));
vi.mock("~/server/billing/polar", () => ({
  PolarApiError: class extends Error {},
  createPolarCheckout: vi.fn(),
  entitlementRowOf: vi.fn(),
  grantsNow: vi.fn(),
  polarProductId: vi.fn(),
}));

const { POST } = await import("./route");
const { apiAccess } = await import("~/server/access");
const { rateLimitDurable } = await import("~/server/rateLimit");
const { ensureMspAccount } = await import("~/server/billing/mspAccount");
const polar = await import("~/server/billing/polar");

const ctx = {
  user: { oid: "user-1", isDemo: false },
  tenant: { id: TENANT_ID, isDemo: false },
  membership: { email: "owner@example.com", role: "owner" },
} as unknown as NonNullable<Awaited<ReturnType<typeof apiAccess>>>;

const request = (body: unknown, origin = "https://licensemeter.com") =>
  new Request("https://licensemeter.com/api/billing/checkout", {
    method: "POST",
    headers: {
      origin,
      host: "licensemeter.com",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  enabled = true;
  vi.resetAllMocks();
  vi.mocked(apiAccess).mockResolvedValue(ctx);
  vi.mocked(rateLimitDurable).mockResolvedValue(true);
  vi.mocked(ensureMspAccount).mockResolvedValue({ id: MSP_ID });
  vi.mocked(polar.polarProductId).mockReturnValue("prod-1");
  vi.mocked(polar.entitlementRowOf).mockResolvedValue(null);
  vi.mocked(polar.createPolarCheckout).mockResolvedValue({
    id: "co_1",
    url: "https://sandbox.polar.sh/checkout/co_1",
  });
});

describe("billing checkout", () => {
  it("answers 503 when Polar is not enabled", async () => {
    enabled = false;
    const res = await POST(request({ plan: "pro", interval: "month" }));
    expect(res.status).toBe(503);
    expect(apiAccess).not.toHaveBeenCalled();
  });

  it("refuses a cross-origin request", async () => {
    const res = await POST(
      request({ plan: "pro", interval: "month" }, "https://evil.example"),
    );
    expect(res.status).toBe(403);
  });

  it("asks for the owner role and refuses everyone else", async () => {
    vi.mocked(apiAccess).mockResolvedValue(null);
    const res = await POST(request({ plan: "pro", interval: "month" }));
    expect(res.status).toBe(401);
    expect(apiAccess).toHaveBeenCalledWith("owner");
    expect(polar.createPolarCheckout).not.toHaveBeenCalled();
  });

  it("refuses the demo sign-in", async () => {
    vi.mocked(apiAccess).mockResolvedValue({
      ...ctx,
      user: { ...ctx.user, isDemo: true },
    });
    const res = await POST(request({ plan: "pro", interval: "month" }));
    expect(res.status).toBe(403);
  });

  it("rejects a body outside the schema", async () => {
    for (const body of [
      {},
      { plan: "free", interval: "month" },
      { plan: "pro", interval: "week" },
    ]) {
      expect((await POST(request(body))).status).toBe(400);
    }
    expect(polar.createPolarCheckout).not.toHaveBeenCalled();
  });

  it("buys Pro for the active workspace, ignoring any owner in the body", async () => {
    const res = await POST(
      request({
        plan: "pro",
        interval: "year",
        tenantId: "11111111-1111-1111-1111-000000000002",
      }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      url: "https://sandbox.polar.sh/checkout/co_1",
    });
    expect(polar.createPolarCheckout).toHaveBeenCalledWith({
      product: { plan: "pro", interval: "year" },
      owner: { tenantId: TENANT_ID },
      customerEmail: "owner@example.com",
      successUrl: "https://licensemeter.com/app/billing?checkout=success",
      returnUrl: "https://licensemeter.com/app/billing",
      allowTrial: true,
    });
    expect(ensureMspAccount).not.toHaveBeenCalled();
  });

  it("buys MSP for the caller's MSP account", async () => {
    const res = await POST(request({ plan: "msp", interval: "month" }));

    expect(res.status).toBe(200);
    expect(ensureMspAccount).toHaveBeenCalledWith(ctx);
    expect(polar.createPolarCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ owner: { mspAccountId: MSP_ID } }),
    );
  });

  it("refuses an MSP checkout while the workspace's own Pro plan still runs", async () => {
    vi.mocked(polar.entitlementRowOf).mockImplementation(async (owner) =>
      "tenantId" in owner
        ? ({ source: "polar" } as Awaited<
            ReturnType<typeof polar.entitlementRowOf>
          >)
        : null,
    );
    vi.mocked(polar.grantsNow).mockReturnValue(true);

    const res = await POST(request({ plan: "msp", interval: "month" }));

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "alreadyEntitled",
      source: "polar",
    });
    expect(ensureMspAccount).not.toHaveBeenCalled();
    expect(polar.createPolarCheckout).not.toHaveBeenCalled();
  });

  it("serialises checkouts per owner so a double click cannot buy twice", async () => {
    vi.mocked(rateLimitDurable).mockImplementation(
      async (key) => !key.startsWith("checkout-owner:"),
    );

    const res = await POST(request({ plan: "pro", interval: "month" }));

    expect(res.status).toBe(429);
    expect(rateLimitDurable).toHaveBeenCalledWith(
      `checkout-owner:t_${ctx.tenant.id}`,
      1,
      20_000,
    );
    expect(polar.createPolarCheckout).not.toHaveBeenCalled();
  });

  it("refuses when another source already grants the owner a plan", async () => {
    vi.mocked(polar.entitlementRowOf).mockResolvedValue({
      source: "marketplace",
    } as Awaited<ReturnType<typeof polar.entitlementRowOf>>);
    vi.mocked(polar.grantsNow).mockReturnValue(true);

    const res = await POST(request({ plan: "pro", interval: "month" }));

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "alreadyEntitled",
      source: "marketplace",
    });
    expect(polar.createPolarCheckout).not.toHaveBeenCalled();
  });

  it("allows a new checkout after a plan has ended, without a second trial", async () => {
    vi.mocked(polar.entitlementRowOf).mockResolvedValue({
      source: "polar",
    } as Awaited<ReturnType<typeof polar.entitlementRowOf>>);
    vi.mocked(polar.grantsNow).mockReturnValue(false);

    const res = await POST(request({ plan: "pro", interval: "month" }));

    expect(res.status).toBe(200);
    expect(polar.createPolarCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ allowTrial: false }),
    );
  });

  it("answers 502 when Polar refuses the checkout", async () => {
    vi.mocked(polar.createPolarCheckout).mockRejectedValue(
      new polar.PolarApiError(422, "/v1/checkouts/"),
    );
    const res = await POST(request({ plan: "pro", interval: "month" }));
    expect(res.status).toBe(502);
  });
});
