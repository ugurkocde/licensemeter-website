import { createHmac } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

vi.mock("~/env", () => ({
  env: {
    NODE_ENV: "test",
    POLAR_PRODUCT_PRO_MONTH: "prod-pro-month",
    POLAR_PRODUCT_PRO_YEAR: "prod-pro-year",
    POLAR_PRODUCT_MSP_MONTH: "prod-msp-month",
    // POLAR_PRODUCT_MSP_YEAR deliberately unset.
  },
}));
// The mapper is pure; the modules below are only reached by the writer path.
vi.mock("~/server/db", () => ({ db: {} }));
vi.mock("~/server/ops", () => ({ notifyOps: vi.fn() }));

const {
  entitlementEventOf,
  polarProductId,
  polarProductOf,
  polarSubscriptionSchema,
  verifyPolarSignature,
} = await import("./polar");
type PolarSubscription = Parameters<typeof entitlementEventOf>[0];

const TENANT_ID = "11111111-1111-1111-1111-000000000001";
const OTHER_TENANT_ID = "11111111-1111-1111-1111-000000000002";
const MSP_ID = "aaaaaaaa-0000-0000-0000-000000000001";
const META = {
  eventId: "msg_1",
  type: "subscription.updated",
  occurredAt: new Date("2026-09-18T10:00:00Z"),
};

const subscription = (
  overrides: Partial<PolarSubscription> = {},
): PolarSubscription => ({
  id: "sub_1",
  status: "active",
  product_id: "prod-pro-month",
  customer_id: "cus_1",
  customer: { external_id: `t_${TENANT_ID}` },
  metadata: {},
  seats: null,
  current_period_end: "2026-10-18T10:00:00Z",
  trial_end: null,
  cancel_at_period_end: false,
  ended_at: null,
  ...overrides,
});

const mapped = (overrides: Partial<PolarSubscription> = {}) => {
  const result = entitlementEventOf(subscription(overrides), META);
  if (!result.ok) throw new Error(`not mapped: ${result.reason}`);
  return result.event;
};

describe("Polar product mapping", () => {
  it("maps every configured product id to its plan and interval and back", () => {
    for (const product of [
      { plan: "pro", interval: "month" },
      { plan: "pro", interval: "year" },
      { plan: "msp", interval: "month" },
    ] as const) {
      const id = polarProductId(product);
      expect(id).not.toBeNull();
      expect(polarProductOf(id!)).toEqual(product);
    }
  });

  it("answers null for an unconfigured product and an unknown id", () => {
    expect(polarProductId({ plan: "msp", interval: "year" })).toBeNull();
    expect(polarProductOf("prod-someone-else")).toBeNull();
    // An unset variable must never match an empty or missing product id.
    expect(polarProductOf("")).toBeNull();
    expect(polarProductOf("undefined")).toBeNull();
  });
});

describe("entitlementEventOf", () => {
  it("maps an active Pro subscription", () => {
    expect(mapped()).toEqual({
      ...META,
      provider: "polar",
      owner: { tenantId: TENANT_ID },
      plan: "pro",
      status: "active",
      quantity: 1,
      trialEnd: null,
      currentPeriodEnd: new Date("2026-10-18T10:00:00Z"),
      cancelAtPeriodEnd: false,
      providerSubscriptionId: "sub_1",
      providerCustomerId: "cus_1",
    });
  });

  it("maps every Polar status to the neutral status", () => {
    const expected = {
      trialing: "trialing",
      active: "active",
      past_due: "past_due",
      canceled: "canceled",
      unpaid: "suspended",
      paused: "suspended",
      incomplete_expired: "suspended",
    } as const;
    for (const [status, neutral] of Object.entries(expected)) {
      expect(mapped({ status }).status).toBe(neutral);
    }
  });

  it("does not record a subscription whose first payment is still pending", () => {
    expect(
      entitlementEventOf(subscription({ status: "incomplete" }), META),
    ).toEqual({
      ok: false,
      reason: "incomplete",
      detail: "sub_1",
    });
  });

  it("reports a status it does not know", () => {
    expect(
      entitlementEventOf(subscription({ status: "frozen" }), META),
    ).toMatchObject({ ok: false, reason: "unknownStatus" });
  });

  it("carries the trial end and the cancel flag", () => {
    const event = mapped({
      status: "trialing",
      trial_end: "2026-10-18T10:00:00Z",
      cancel_at_period_end: true,
    });
    expect(event.trialEnd).toEqual(new Date("2026-10-18T10:00:00Z"));
    expect(event.cancelAtPeriodEnd).toBe(true);
  });

  it("ends a revoked subscription at once, not at its period end", () => {
    const event = mapped({
      status: "canceled",
      ended_at: "2026-09-18T09:59:00Z",
    });
    expect(event.currentPeriodEnd).toEqual(new Date("2026-09-18T09:59:00Z"));
  });

  it("keeps the period end when the subscription ended no earlier", () => {
    const event = mapped({
      status: "canceled",
      ended_at: "2026-10-18T10:00:01Z",
    });
    expect(event.currentPeriodEnd).toEqual(new Date("2026-10-18T10:00:00Z"));
  });

  it("uses the seats of an MSP subscription as quantity, never below the included ten", () => {
    const msp = {
      product_id: "prod-msp-month",
      customer: { external_id: `m_${MSP_ID}` },
    };
    expect(mapped({ ...msp, seats: 14 })).toMatchObject({
      owner: { mspAccountId: MSP_ID },
      plan: "msp",
      quantity: 14,
    });
    expect(mapped({ ...msp, seats: 3 }).quantity).toBe(10);
    expect(mapped({ ...msp, seats: null }).quantity).toBe(10);
  });

  it("ignores seats on a Pro subscription", () => {
    expect(mapped({ seats: 25 }).quantity).toBe(1);
  });

  it("prefers the owner in the subscription metadata over the customer's external id", () => {
    const event = mapped({ metadata: { owner_ref: `t_${OTHER_TENANT_ID}` } });
    expect(event.owner).toEqual({ tenantId: OTHER_TENANT_ID });
  });

  it("falls back to the external id when the metadata does not parse", () => {
    const event = mapped({ metadata: { owner_ref: "t_not-a-uuid" } });
    expect(event.owner).toEqual({ tenantId: TENANT_ID });
  });

  it("reports an unknown product instead of guessing a plan", () => {
    expect(
      entitlementEventOf(subscription({ product_id: "prod-other" }), META),
    ).toEqual({ ok: false, reason: "unknownProduct", detail: "prod-other" });
  });

  it("reports an owner it cannot parse", () => {
    for (const customer of [
      { external_id: null },
      { external_id: "workspace-1" },
      { external_id: TENANT_ID },
      null,
    ]) {
      expect(
        entitlementEventOf(subscription({ customer }), META),
      ).toMatchObject({ ok: false, reason: "unknownOwner" });
    }
  });

  it("reports a plan bought for the wrong kind of owner", () => {
    expect(
      entitlementEventOf(
        subscription({ customer: { external_id: `m_${MSP_ID}` } }),
        META,
      ),
    ).toMatchObject({ ok: false, reason: "ownerPlanMismatch" });
    expect(
      entitlementEventOf(subscription({ product_id: "prod-msp-month" }), META),
    ).toMatchObject({ ok: false, reason: "ownerPlanMismatch" });
  });
});

describe("polarSubscriptionSchema", () => {
  it("accepts a payload with fields this app does not read", () => {
    const parsed = polarSubscriptionSchema.safeParse({
      ...subscription(),
      amount: 9900,
      product: { id: "prod-pro-month", name: "Pro" },
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a payload without the fields the mapper needs", () => {
    const withoutProduct = { ...subscription(), product_id: undefined };
    expect(polarSubscriptionSchema.safeParse(withoutProduct).success).toBe(
      false,
    );
  });
});

describe("verifyPolarSignature", () => {
  const SECRET = "polar_whs_placeholder";
  const NOW = new Date("2026-09-18T10:00:00Z");
  const BODY = '{"type":"subscription.active"}';
  const seconds = (date: Date) => String(Math.floor(date.getTime() / 1000));

  const headers = (
    options: { body?: string; secret?: string; sentAt?: string } = {},
  ) => {
    const sentAt = options.sentAt ?? seconds(NOW);
    // The key is the secret string itself, as UTF-8 bytes.
    const signature = createHmac("sha256", options.secret ?? SECRET)
      .update(`msg_1.${sentAt}.${options.body ?? BODY}`)
      .digest("base64");
    return new Headers({
      "webhook-id": "msg_1",
      "webhook-timestamp": sentAt,
      "webhook-signature": `v1,${signature}`,
    });
  };

  it("accepts a valid signature", () => {
    expect(verifyPolarSignature(SECRET, headers(), BODY, NOW)).toEqual({
      ok: true,
    });
  });

  it("accepts any valid entry of a rotated signature list", () => {
    const h = headers();
    h.set("webhook-signature", `v1,AAAA ${h.get("webhook-signature")!}`);
    expect(verifyPolarSignature(SECRET, h, BODY, NOW).ok).toBe(true);
  });

  it("rejects a signature made with another secret or over another body", () => {
    expect(
      verifyPolarSignature(SECRET, headers({ secret: "other" }), BODY, NOW),
    ).toEqual({ ok: false, reason: "badSignature" });
    expect(
      verifyPolarSignature(SECRET, headers({ body: "{}" }), BODY, NOW),
    ).toEqual({ ok: false, reason: "badSignature" });
  });

  it("rejects a timestamp outside the tolerance, in either direction", () => {
    for (const offsetMs of [-6 * 60_000, 6 * 60_000]) {
      const sentAt = seconds(new Date(NOW.getTime() + offsetMs));
      expect(
        verifyPolarSignature(SECRET, headers({ sentAt }), BODY, NOW),
      ).toEqual({ ok: false, reason: "staleTimestamp" });
    }
  });

  it("rejects a timestamp that is not a number and missing headers", () => {
    expect(
      verifyPolarSignature(SECRET, headers({ sentAt: "soon" }), BODY, NOW),
    ).toEqual({ ok: false, reason: "staleTimestamp" });
    expect(verifyPolarSignature(SECRET, new Headers(), BODY, NOW)).toEqual({
      ok: false,
      reason: "missingHeaders",
    });
  });
});
