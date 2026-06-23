import { describe, expect, it, vi } from "vitest";

import type { PlanInterval, PlanTier } from "~/server/types";

/**
 * priceId <-> plan mapping (src/server/stripe.ts: priceIdFor + planFromPriceId).
 *
 * PRICE_ENV is built ONCE at module load from env.STRIPE_PRICE_*, so the env
 * must be mocked before the module is imported — vi.stubEnv would be too late
 * (and under SKIP_ENV_VALIDATION the vars are unset, so priceIdFor would only
 * ever return null). We mock ~/env with distinct sentinel ids and stub the
 * server-only side imports (server-only throws on import; db/ops touch the DB)
 * so the pure mapping functions can be exercised in isolation.
 */
vi.mock("server-only", () => ({}));
vi.mock("~/server/db", () => ({ db: {} }));
vi.mock("~/server/ops", () => ({ notifyOps: vi.fn() }));
vi.mock("~/env", () => ({
  env: {
    STRIPE_PRICE_STARTER_MONTHLY: "price_starter_month",
    STRIPE_PRICE_STARTER_ANNUAL: "price_starter_year",
    STRIPE_PRICE_GROWTH_MONTHLY: "price_growth_month",
    STRIPE_PRICE_GROWTH_ANNUAL: "price_growth_year",
    STRIPE_PRICE_SCALE_MONTHLY: "price_scale_month",
    STRIPE_PRICE_SCALE_ANNUAL: "price_scale_year",
  },
  siteUrl: () => "https://licensemeter.test",
}));

const { priceIdFor, planFromPriceId } = await import("~/server/stripe");

const TIERS: PlanTier[] = ["starter", "growth", "scale"];
const INTERVALS: PlanInterval[] = ["month", "year"];

describe("priceIdFor / planFromPriceId round-trip", () => {
  it("resolves a distinct, non-null price id for every (tier, interval)", () => {
    const ids = new Set<string>();
    for (const tier of TIERS) {
      for (const interval of INTERVALS) {
        const id = priceIdFor(tier, interval);
        expect(id).not.toBeNull();
        ids.add(id!);
      }
    }
    // Six cells, six distinct ids: no two (tier, interval) pairs collide.
    expect(ids.size).toBe(6);
  });

  it("round-trips every (tier, interval) through priceId and back", () => {
    for (const tier of TIERS) {
      for (const interval of INTERVALS) {
        const id = priceIdFor(tier, interval);
        expect(planFromPriceId(id!)).toEqual({ tier, interval });
      }
    }
  });
});

describe("planFromPriceId rejects unknown ids", () => {
  it("returns null for an unmapped price id, never coercing to a tier", () => {
    expect(planFromPriceId("price_legacy_or_forgotten")).toBeNull();
    expect(planFromPriceId("price_growth_monthly")).toBeNull(); // close but not equal
    expect(planFromPriceId("starter")).toBeNull();
  });

  it("returns null for the empty string and other falsy-ish ids", () => {
    // An unconfigured env var would be undefined in PRICE_ENV; an empty-string
    // price id from Stripe must not accidentally match such a cell.
    expect(planFromPriceId("")).toBeNull();
  });
});

describe("unconfigured env yields null without mismapping", () => {
  it("priceIdFor returns null for an interval whose env var is unset, and the populated cell still round-trips", async () => {
    vi.resetModules();
    vi.doMock("server-only", () => ({}));
    vi.doMock("~/server/db", () => ({ db: {} }));
    vi.doMock("~/server/ops", () => ({ notifyOps: vi.fn() }));
    vi.doMock("~/env", () => ({
      env: {
        // Only the starter-monthly cell is configured; everything else unset.
        STRIPE_PRICE_STARTER_MONTHLY: "price_only_one",
        STRIPE_PRICE_STARTER_ANNUAL: undefined,
        STRIPE_PRICE_GROWTH_MONTHLY: undefined,
        STRIPE_PRICE_GROWTH_ANNUAL: undefined,
        STRIPE_PRICE_SCALE_MONTHLY: undefined,
        STRIPE_PRICE_SCALE_ANNUAL: undefined,
      },
      siteUrl: () => "https://licensemeter.test",
    }));
    try {
      const m = await import("~/server/stripe");
      expect(m.priceIdFor("starter", "month")).toBe("price_only_one");
      expect(m.priceIdFor("starter", "year")).toBeNull();
      expect(m.priceIdFor("growth", "month")).toBeNull();
      // The reverse map must not match undefined cells against an undefined-ish
      // lookup; only the genuinely configured id resolves.
      expect(m.planFromPriceId("price_only_one")).toEqual({
        tier: "starter",
        interval: "month",
      });
      expect(m.planFromPriceId("price_starter_year")).toBeNull();
    } finally {
      vi.doUnmock("server-only");
      vi.doUnmock("~/server/db");
      vi.doUnmock("~/server/ops");
      vi.doUnmock("~/env");
      vi.resetModules();
    }
  });
});
