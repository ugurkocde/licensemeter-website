import { describe, expect, it } from "vitest";

import {
  entitlementOf,
  mspEntitlementOf,
  trialDaysLeftAt,
  trialEndsAtFor,
} from "~/server/entitlement";
import type { SubscriptionStatus } from "~/server/types";

/** Minimal tenant satisfying the fields entitlementOf reads. */
const tenant = (over: Partial<{
  isDemo: boolean;
  compedAt: Date | null;
  subscriptionStatus: SubscriptionStatus | null;
  paidUntil: Date | null;
  trialStartedAt: Date | null;
  createdAt: Date;
}> = {}) => ({
  isDemo: false,
  compedAt: null,
  subscriptionStatus: null,
  paidUntil: null,
  trialStartedAt: null,
  createdAt: new Date("2026-06-11T00:00:00Z"),
  ...over,
});

const sub = (over: Partial<{ tier: "starter" | "growth" | "scale"; cancelAtPeriodEnd: boolean }> = {}) => ({
  tier: "growth" as const,
  cancelAtPeriodEnd: false,
  ...over,
});

describe("trial window (UTC day math)", () => {
  it("normalizes an intraday anchor to whole UTC days (anchor 19:01 -> expiry +14 days at 00:00)", () => {
    const anchor = new Date("2026-06-11T19:01:24Z");
    expect(trialEndsAtFor(anchor).toISOString()).toBe("2026-06-25T00:00:00.000Z");
  });

  it("two tenants created hours apart expire on the same boundary", () => {
    const a = trialEndsAtFor(new Date("2026-06-11T00:30:00Z"));
    const b = trialEndsAtFor(new Date("2026-06-11T23:30:00Z"));
    expect(a.getTime()).toBe(b.getTime());
  });

  it("counts whole days left and floors to 0 on the final day", () => {
    const anchor = new Date("2026-06-11T00:00:00Z");
    expect(trialDaysLeftAt(anchor, new Date("2026-06-11T12:00:00Z"))).toBe(13);
    expect(trialDaysLeftAt(anchor, new Date("2026-06-24T12:00:00Z"))).toBe(0);
    expect(trialDaysLeftAt(anchor, new Date("2026-06-25T12:00:00Z"))).toBe(0);
  });
});

describe("entitlementOf precedence", () => {
  const now = new Date("2026-07-01T00:00:00Z"); // well past a 2026-06-11 trial

  it("demo is always full access, even with no sub and an old trial", () => {
    const e = entitlementOf(tenant({ isDemo: true }), null, now, false);
    expect(e).toMatchObject({ state: "demo", active: true, locked: false });
  });

  it("billing disabled => everyone is comped (master flag)", () => {
    const e = entitlementOf(tenant(), null, now, true);
    expect(e).toMatchObject({ state: "comped", active: true, locked: false });
  });

  it("comped_at grandfathers a tenant regardless of an expired trial", () => {
    const e = entitlementOf(tenant({ compedAt: new Date("2026-06-21T00:00:00Z") }), null, now, false);
    expect(e).toMatchObject({ state: "comped", active: true });
  });

  it("active subscription within the paid horizon => paid", () => {
    const e = entitlementOf(
      tenant({ subscriptionStatus: "active", paidUntil: new Date("2026-08-01T00:00:00Z") }),
      sub({ tier: "scale" }),
      now,
      false,
    );
    expect(e).toMatchObject({ state: "paid", active: true, locked: false, plan: "scale" });
  });

  it("active status but paid horizon in the past (missed cancel webhook) => expired, not paid", () => {
    const e = entitlementOf(
      tenant({
        subscriptionStatus: "active",
        paidUntil: new Date("2026-06-20T00:00:00Z"),
        trialStartedAt: new Date("2026-06-11T00:00:00Z"),
      }),
      sub(),
      now,
      false,
    );
    expect(e).toMatchObject({ state: "expired", active: false, locked: true });
  });

  it("past_due within horizon keeps access (dunning grace)", () => {
    const e = entitlementOf(
      tenant({ subscriptionStatus: "past_due", paidUntil: new Date("2026-07-15T00:00:00Z") }),
      sub(),
      now,
      false,
    );
    expect(e).toMatchObject({ state: "past_due", active: true, locked: false });
  });

  it("past_due past horizon (retries exhausted) => locked", () => {
    const e = entitlementOf(
      tenant({ subscriptionStatus: "past_due", paidUntil: new Date("2026-06-20T00:00:00Z") }),
      sub(),
      now,
      false,
    );
    expect(e).toMatchObject({ state: "past_due", active: false, locked: true });
  });

  it("canceled subscription with an elapsed trial => expired", () => {
    const e = entitlementOf(
      tenant({
        subscriptionStatus: "canceled",
        paidUntil: null,
        trialStartedAt: new Date("2026-06-11T00:00:00Z"),
      }),
      sub(),
      now,
      false,
    );
    expect(e).toMatchObject({ state: "expired", active: false, locked: true });
  });

  it("no subscription, still inside the trial => trial (full access)", () => {
    const e = entitlementOf(
      tenant({ trialStartedAt: new Date("2026-06-28T00:00:00Z") }),
      null,
      now,
      false,
    );
    expect(e).toMatchObject({ state: "trial", active: true, locked: false });
    expect(e.trialDaysLeft).toBeGreaterThan(0);
  });

  it("incomplete status past the trial => incomplete (locked, not generic expired)", () => {
    const e = entitlementOf(
      tenant({
        subscriptionStatus: "incomplete",
        trialStartedAt: new Date("2026-06-11T00:00:00Z"),
      }),
      sub(),
      now,
      false,
    );
    expect(e).toMatchObject({ state: "incomplete", active: false, locked: true });
  });

  it("incomplete_expired status past the trial => incomplete (locked)", () => {
    const e = entitlementOf(
      tenant({
        subscriptionStatus: "incomplete_expired",
        trialStartedAt: new Date("2026-06-11T00:00:00Z"),
      }),
      sub(),
      now,
      false,
    );
    expect(e).toMatchObject({ state: "incomplete", active: false, locked: true });
  });

  it("incomplete status but still inside the trial => trial access wins", () => {
    const e = entitlementOf(
      tenant({
        subscriptionStatus: "incomplete",
        trialStartedAt: new Date("2026-06-28T00:00:00Z"),
      }),
      sub(),
      now,
      false,
    );
    expect(e).toMatchObject({ state: "trial", active: true, locked: false });
    expect(e.trialDaysLeft).toBeGreaterThan(0);
  });

  it("no subscription, trial not started (no connector yet) => full access", () => {
    // trialStartedAt is null until the first service is connected; an empty
    // workspace must not burn trial days while the user explores.
    const e = entitlementOf(tenant(), null, now, false);
    expect(e).toMatchObject({ state: "trial", active: true, locked: false });
  });

  it("no subscription, trial started and elapsed => expired (soft lock)", () => {
    const e = entitlementOf(
      tenant({ trialStartedAt: new Date("2026-06-11T00:00:00Z") }),
      null,
      now,
      false,
    );
    expect(e).toMatchObject({ state: "expired", active: false, locked: true });
  });

  it("anchors on trialStartedAt, not createdAt (reconnect cannot extend the trial)", () => {
    // createdAt is recent but the immutable trial anchor is old -> expired.
    const e = entitlementOf(
      tenant({
        trialStartedAt: new Date("2026-06-11T00:00:00Z"),
        createdAt: new Date("2026-06-30T00:00:00Z"),
      }),
      null,
      now,
      false,
    );
    expect(e.state).toBe("expired");
  });

  it("surfaces cancelAtPeriodEnd from the sub for the UI", () => {
    const e = entitlementOf(
      tenant({ subscriptionStatus: "active", paidUntil: new Date("2026-08-01T00:00:00Z") }),
      sub({ cancelAtPeriodEnd: true }),
      now,
      false,
    );
    expect(e.cancelAtPeriodEnd).toBe(true);
  });
});

/** Minimal MSP account satisfying the fields mspEntitlementOf reads. */
const account = (over: Partial<{
  compedAt: Date | null;
  subscriptionStatus: SubscriptionStatus | null;
  paidUntil: Date | null;
}> = {}) => ({
  compedAt: null,
  subscriptionStatus: null,
  paidUntil: null,
  ...over,
});

describe("mspEntitlementOf precedence", () => {
  const now = new Date("2026-07-01T00:00:00Z");

  it("billing disabled => comped (master flag), no per-tenant trial fields", () => {
    const e = mspEntitlementOf(account(), now, true);
    expect(e).toMatchObject({ state: "comped", active: true, locked: false });
    // MSP-managed workspaces have no per-tenant trial: no countdown, no plan.
    expect(e.trialDaysLeft).toBe(0);
    expect(e.plan).toBeNull();
    expect(e.cancelAtPeriodEnd).toBe(false);
  });

  it("comped_at grandfathers the account regardless of subscription", () => {
    const e = mspEntitlementOf(
      account({ compedAt: new Date("2026-06-21T00:00:00Z") }),
      now,
      false,
    );
    expect(e).toMatchObject({ state: "comped", active: true, locked: false });
  });

  it("active subscription within the paid horizon => paid", () => {
    const e = mspEntitlementOf(
      account({ subscriptionStatus: "active", paidUntil: new Date("2026-08-01T00:00:00Z") }),
      now,
      false,
    );
    expect(e).toMatchObject({ state: "paid", active: true, locked: false });
  });

  it("trialing subscription within the paid horizon => paid", () => {
    const e = mspEntitlementOf(
      account({ subscriptionStatus: "trialing", paidUntil: new Date("2026-08-01T00:00:00Z") }),
      now,
      false,
    );
    expect(e).toMatchObject({ state: "paid", active: true, locked: false });
  });

  it("active status but paid horizon in the past (missed cancel webhook) => expired", () => {
    const e = mspEntitlementOf(
      account({ subscriptionStatus: "active", paidUntil: new Date("2026-06-20T00:00:00Z") }),
      now,
      false,
    );
    expect(e).toMatchObject({ state: "expired", active: false, locked: true });
  });

  it("past_due within horizon keeps access (dunning grace)", () => {
    const e = mspEntitlementOf(
      account({ subscriptionStatus: "past_due", paidUntil: new Date("2026-07-15T00:00:00Z") }),
      now,
      false,
    );
    expect(e).toMatchObject({ state: "past_due", active: true, locked: false });
  });

  it("past_due past horizon (retries exhausted) => locked", () => {
    const e = mspEntitlementOf(
      account({ subscriptionStatus: "past_due", paidUntil: new Date("2026-06-20T00:00:00Z") }),
      now,
      false,
    );
    expect(e).toMatchObject({ state: "past_due", active: false, locked: true });
  });

  it("canceled subscription => expired (locked)", () => {
    const e = mspEntitlementOf(
      account({ subscriptionStatus: "canceled" }),
      now,
      false,
    );
    expect(e).toMatchObject({ state: "expired", active: false, locked: true });
  });

  it("unpaid subscription (dunning exhausted) => expired (locked)", () => {
    // unpaid is neither an entitled status nor past_due, so it falls through to
    // the terminal lock just like canceled.
    const e = mspEntitlementOf(
      account({ subscriptionStatus: "unpaid" }),
      now,
      false,
    );
    expect(e).toMatchObject({ state: "expired", active: false, locked: true });
  });

  it("no subscription at all => expired (no per-tenant trial fallback)", () => {
    // Unlike a self-serve tenant, an MSP-managed workspace has no trial: a
    // missing/unsubscribed account locks immediately.
    const e = mspEntitlementOf(account(), now, false);
    expect(e).toMatchObject({ state: "expired", active: false, locked: true });
  });
});
