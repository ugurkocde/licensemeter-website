import { describe, expect, it } from "vitest";

import { fmtMoney } from "~/lib/format";
import { planCalendar, planDescription, planEvents } from "./calendar";
import type { PlanItem } from "./plan";

const item = (overrides: Partial<PlanItem> = {}): PlanItem => ({
  key: "sku-05e9a617-0261-4cee-bb44-138d3ef5d965",
  kind: "subscription",
  label: "Microsoft 365 E3",
  sub: "SPE_E3",
  vendor: "Microsoft",
  contractId: null,
  skuIds: ["05e9a617-0261-4cee-bb44-138d3ef5d965"],
  renewalDate: "2027-03-01",
  noticeDate: "2027-02-22",
  daysUntil: 50,
  noticeDaysUntil: 43,
  lines: [],
  paidSeats: 100,
  unassignedSeats: 10,
  reclaimableSeats: 3,
  activeSeats: 87,
  recommendedSeats: 92,
  targetSet: false,
  cutSeats: 8,
  annualSavingsCents: 322_560,
  unpricedCutSeats: 0,
  trialOnly: false,
  estimate: false,
  term: "annual",
  monthlyAlerts: false,
  alertsApply: true,
  ...overrides,
});

const opts = {
  tenantId: "t1",
  currency: "EUR",
  url: "https://x.example/app/renewals",
};

describe("planEvents", () => {
  it("adds a decision event before the renewal event", () => {
    const events = planEvents(item(), opts);
    expect(events.map((e) => [e.date, e.summary])).toEqual([
      ["2027-02-22", "Decide Microsoft 365 E3 renewal: cut 8 seats"],
      ["2027-03-01", "Microsoft renewal: Microsoft 365 E3"],
    ]);
    expect(new Set(events.map((e) => e.uid)).size).toBe(2);
    expect(events[0]!.uid).toBe(`t1.${item().key}.notice@licensemeter`);
  });

  it("writes one event when the decision falls on the renewal day", () => {
    expect(planEvents(item({ noticeDate: "2027-03-01" }), opts)).toHaveLength(
      1,
    );
  });

  it("asks to confirm the seat count when there is nothing to cut", () => {
    expect(planEvents(item({ cutSeats: 0 }), opts)[0]!.summary).toBe(
      "Decide Microsoft 365 E3 renewal: confirm seat count",
    );
  });
});

describe("planDescription", () => {
  it("lists the seat figures and the yearly savings", () => {
    const text = planDescription(item(), "EUR");
    expect(text).toContain("Paid seats: 100");
    expect(text).toContain("Recommended: 92 seats");
    expect(text).toContain("Seats to cut: 8");
    expect(text).toContain(`Savings: ${fmtMoney(322_560, "EUR")} per year`);
  });

  it("never shows a zero price for unpriced seats", () => {
    const text = planDescription(
      item({ annualSavingsCents: null, unpricedCutSeats: 8 }),
      "EUR",
    );
    expect(text).not.toMatch(/€0/);
    expect(text).toContain("8 seats without a price");
  });

  it("claims nothing for a trial-only subscription and flags estimates", () => {
    expect(planDescription(item({ trialOnly: true }), "EUR")).toContain(
      "nothing paid to cut",
    );
    expect(planDescription(item({ estimate: true }), "EUR")).toContain(
      "Conservative estimate",
    );
  });
});

describe("planCalendar", () => {
  it("wraps every item in one calendar", () => {
    const ics = planCalendar(
      [item(), item({ key: "contract-1", noticeDate: "2027-03-01" })],
      { ...opts, now: new Date("2027-01-10T00:00:00Z") },
    );
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(3);
    expect(ics).toContain("X-WR-CALNAME:LicenseMeter renewals");
  });
});
