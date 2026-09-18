import { describe, expect, it } from "vitest";
import {
  FEATURES,
  PLAN_FEATURES,
  entitlementOf,
  hasFeature,
  planFor,
  type Entitlement,
  type EntitlementInput,
  type EntitlementRecord,
} from "./entitlement";

const NOW = new Date("2026-09-18T12:00:00Z");
const PAST = new Date("2026-09-01T00:00:00Z");
const FUTURE = new Date("2026-10-01T00:00:00Z");

const record = (
  overrides: Partial<EntitlementRecord> = {},
): EntitlementRecord => ({
  plan: "pro",
  source: "polar",
  status: "active",
  trialEnd: null,
  currentPeriodEnd: FUTURE,
  cancelAtPeriodEnd: false,
  ...overrides,
});

const resolve = (overrides: Partial<EntitlementInput> = {}): Entitlement =>
  entitlementOf({
    tenant: { isDemo: false },
    record: null,
    covered: true,
    billingEnabled: true,
    now: NOW,
    ...overrides,
  });

const enabledFeatures = (e: Entitlement) =>
  FEATURES.filter((f) => e.features[f]);

describe("plan map", () => {
  it("gives Free no paid feature", () => {
    expect(PLAN_FEATURES.free).toEqual([]);
  });

  it("includes every Pro feature in MSP", () => {
    for (const feature of PLAN_FEATURES.pro) {
      expect(PLAN_FEATURES.msp).toContain(feature);
    }
  });

  it("makes every feature reachable through some plan", () => {
    const reachable = new Set(Object.values(PLAN_FEATURES).flat());
    for (const feature of FEATURES) expect(reachable).toContain(feature);
  });

  it("only lists known features", () => {
    for (const feature of Object.values(PLAN_FEATURES).flat()) {
      expect(FEATURES).toContain(feature);
    }
  });

  it.each(FEATURES)(
    "planFor(%s) is the cheapest plan that has it",
    (feature) => {
      const plan = planFor(feature);
      expect(PLAN_FEATURES[plan]).toContain(feature);
      expect(plan).toBe(PLAN_FEATURES.pro.includes(feature) ? "pro" : "msp");
    },
  );
});

describe("self-hosted and demo", () => {
  it.each([
    ["no record", null],
    ["an active record", record()],
    ["a suspended record", record({ status: "suspended" })],
    [
      "a canceled, expired record",
      record({ status: "canceled", currentPeriodEnd: PAST }),
    ],
  ])("gives every feature when billing is disabled, with %s", (_label, rec) => {
    const e = resolve({ billingEnabled: false, record: rec, covered: false });
    expect(e.state).toBe("selfHosted");
    expect(e.source).toBeNull();
    expect(enabledFeatures(e)).toEqual([...FEATURES]);
  });

  it("gives the demo workspace every feature", () => {
    const e = resolve({ tenant: { isDemo: true } });
    expect(e.state).toBe("demo");
    expect(enabledFeatures(e)).toEqual([...FEATURES]);
  });

  it("prefers selfHosted over demo when billing is disabled", () => {
    const e = resolve({ tenant: { isDemo: true }, billingEnabled: false });
    expect(e.state).toBe("selfHosted");
  });
});

describe("free", () => {
  it("resolves no record to Free with every feature off", () => {
    expect(resolve()).toEqual({
      plan: "free",
      state: "free",
      source: null,
      features: Object.fromEntries(FEATURES.map((f) => [f, false])),
      currentPeriodEnd: null,
    });
  });
});

describe("status lifecycle", () => {
  type Case = [
    label: string,
    overrides: Partial<EntitlementRecord>,
    state: Entitlement["state"],
  ];
  const entitled: Case[] = [
    [
      "trialing before trialEnd",
      { status: "trialing", trialEnd: FUTURE },
      "trialing",
    ],
    [
      "trialing with null trialEnd and a future currentPeriodEnd",
      { status: "trialing", trialEnd: null, currentPeriodEnd: FUTURE },
      "trialing",
    ],
    [
      "trialing after trialEnd while the paid period is still ahead",
      { status: "trialing", trialEnd: PAST, currentPeriodEnd: FUTURE },
      "trialing",
    ],
    ["active", { status: "active" }, "active"],
    [
      "active with cancelAtPeriodEnd",
      { status: "active", cancelAtPeriodEnd: true },
      "canceling",
    ],
    ["past_due", { status: "past_due" }, "pastDue"],
    [
      "canceled before currentPeriodEnd",
      { status: "canceled", currentPeriodEnd: FUTURE },
      "canceling",
    ],
  ];
  const lapsed: Case[] = [
    [
      "trialing after trialEnd with no paid period",
      { status: "trialing", trialEnd: PAST, currentPeriodEnd: null },
      "free",
    ],
    [
      "trialing with null trialEnd and a past currentPeriodEnd",
      { status: "trialing", trialEnd: null, currentPeriodEnd: PAST },
      "free",
    ],
    [
      "trialing with no end date at all",
      { status: "trialing", trialEnd: null, currentPeriodEnd: null },
      "free",
    ],
    [
      "canceled after currentPeriodEnd",
      { status: "canceled", currentPeriodEnd: PAST },
      "free",
    ],
    [
      "canceled with null currentPeriodEnd",
      { status: "canceled", currentPeriodEnd: null },
      "free",
    ],
    [
      "canceled exactly at currentPeriodEnd",
      { status: "canceled", currentPeriodEnd: NOW },
      "free",
    ],
    ["suspended", { status: "suspended" }, "free"],
  ];

  it.each(entitled)("%s keeps the plan", (_label, overrides, state) => {
    const rec = record(overrides);
    const e = resolve({ record: rec });
    expect(e.plan).toBe("pro");
    expect(e.state).toBe(state);
    expect(e.source).toBe("polar");
    expect(e.currentPeriodEnd).toEqual(rec.currentPeriodEnd);
    expect(enabledFeatures(e)).toEqual([...PLAN_FEATURES.pro]);
  });

  it.each(lapsed)("%s falls back to Free", (_label, overrides, state) => {
    const e = resolve({ record: record(overrides) });
    expect(e.plan).toBe("free");
    expect(e.state).toBe(state);
    expect(enabledFeatures(e)).toEqual([]);
  });

  it("gives an MSP record the MSP features", () => {
    const e = resolve({ record: record({ plan: "msp" }) });
    expect(e.plan).toBe("msp");
    expect(enabledFeatures(e)).toEqual([...FEATURES]);
  });
});

describe("comped", () => {
  it.each(["suspended", "canceled"] as const)(
    "stays entitled with status %s and a past currentPeriodEnd",
    (status) => {
      const e = resolve({
        record: record({ source: "comped", status, currentPeriodEnd: PAST }),
      });
      expect(e.plan).toBe("pro");
      expect(e.state).toBe("comped");
      expect(e.source).toBe("comped");
      expect(hasFeature(e, "mcp")).toBe(true);
    },
  );
});

describe("MSP quantity", () => {
  it("resolves an uncovered workspace to Free with state overQuantity", () => {
    const rec = record({ plan: "msp", source: "marketplace" });
    const e = resolve({ record: rec, covered: false });
    expect(e.plan).toBe("free");
    expect(e.state).toBe("overQuantity");
    expect(e.source).toBe("marketplace");
    expect(enabledFeatures(e)).toEqual([]);
  });

  it("reports a lapsed MSP record as plain Free, covered or not", () => {
    const rec = record({ plan: "msp", status: "suspended" });
    expect(resolve({ record: rec, covered: false }).state).toBe("free");
  });
});
