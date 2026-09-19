import { describe, expect, it } from "vitest";

import {
  entitlementOf,
  type EntitlementInput,
  type EntitlementRecord,
} from "./entitlement";
import {
  historyMonths,
  historyStart,
  historyStartDay,
  showHistoryHint,
} from "./history";

const NOW = new Date("2026-09-18T12:00:00Z");
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

const resolve = (overrides: Partial<EntitlementInput> = {}) =>
  entitlementOf({
    tenant: { isDemo: false },
    record: null,
    covered: true,
    billingEnabled: true,
    now: NOW,
    ...overrides,
  });

const free = resolve();
const pro = resolve({ record: record() });
const msp = resolve({ record: record({ plan: "msp" }) });
const selfHosted = resolve({ billingEnabled: false });
const demo = resolve({ tenant: { isDemo: true } });
const overQuantity = resolve({
  record: record({ plan: "msp" }),
  covered: false,
});

describe("historyMonths", () => {
  it("gives Free 12 months", () => {
    expect(historyMonths(free)).toBe(12);
  });

  it("gives Pro and MSP 24 months", () => {
    expect(historyMonths(pro)).toBe(24);
    expect(historyMonths(msp)).toBe(24);
  });

  it("gives self-hosted installs and the demo 24 months", () => {
    expect(selfHosted.state).toBe("selfHosted");
    expect(historyMonths(selfHosted)).toBe(24);
    expect(demo.state).toBe("demo");
    expect(historyMonths(demo)).toBe(24);
  });

  it("gives a workspace beyond the MSP quantity 12 months", () => {
    expect(overQuantity.state).toBe("overQuantity");
    expect(historyMonths(overQuantity)).toBe(12);
  });

  it("falls back to 12 months when a paid plan has lapsed", () => {
    const lapsed = resolve({ record: record({ status: "suspended" }) });
    expect(historyMonths(lapsed)).toBe(12);
  });
});

describe("historyStart", () => {
  it("goes back calendar months to the start of the UTC day", () => {
    expect(historyStart(free, NOW).toISOString()).toBe(
      "2025-09-18T00:00:00.000Z",
    );
    expect(historyStart(pro, NOW).toISOString()).toBe(
      "2024-09-18T00:00:00.000Z",
    );
  });

  it("keeps the day of month at a month end", () => {
    const now = new Date("2027-03-31T08:30:00Z");
    expect(historyStartDay(free, now)).toBe("2026-03-31");
    expect(historyStartDay(pro, now)).toBe("2025-03-31");
  });

  it("clamps a leap day to 28 February in a common year", () => {
    const now = new Date("2028-02-29T23:59:59Z");
    expect(historyStartDay(free, now)).toBe("2027-02-28");
    expect(historyStartDay(pro, now)).toBe("2026-02-28");
  });

  it("keeps 28 February when the target year is the leap year", () => {
    const now = new Date("2029-02-28T00:00:00Z");
    expect(historyStartDay(free, now)).toBe("2028-02-28");
    expect(historyStartDay(pro, new Date("2030-03-01T00:00:00Z"))).toBe(
      "2028-03-01",
    );
  });

  it("crosses the year boundary in January", () => {
    const now = new Date("2027-01-01T00:00:00Z");
    expect(historyStartDay(free, now)).toBe("2026-01-01");
    expect(historyStartDay(pro, now)).toBe("2025-01-01");
  });

  it("uses the UTC date, not the local one", () => {
    // 23:30 in New York on 17 September is already 18 September in UTC.
    const now = new Date("2026-09-17T23:30:00-04:00");
    expect(historyStartDay(free, now)).toBe("2025-09-18");
  });

  it("does not mutate the date it is given", () => {
    const now = new Date(NOW);
    historyStart(free, now);
    expect(now.getTime()).toBe(NOW.getTime());
  });
});

describe("showHistoryHint", () => {
  it("shows on Free and beyond the MSP quantity when older data exists", () => {
    expect(showHistoryHint(free, true)).toBe(true);
    expect(showHistoryHint(overQuantity, true)).toBe(true);
  });

  it("stays hidden while nothing is older than the window", () => {
    expect(showHistoryHint(free, false)).toBe(false);
  });

  it("never shows on a paid plan, a self-hosted install or the demo", () => {
    for (const entitlement of [pro, msp, selfHosted, demo]) {
      expect(showHistoryHint(entitlement, true)).toBe(false);
    }
  });
});
