import { describe, expect, it } from "vitest";

import {
  computeAiSpendDelta,
  computeDigestDelta,
  daysUntilDate,
  renewalDigestLine,
  type DeltaFindingRow,
} from "~/server/digestDelta";

const NOW = new Date("2026-06-12T12:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;

const row = (overrides: Partial<DeltaFindingRow>): DeltaFindingRow => ({
  status: "open",
  firstSeenAt: new Date(NOW.getTime() - 30 * DAY_MS),
  resolvedAt: null,
  monthlyImpactCents: 1000,
  ...overrides,
});

describe("computeDigestDelta", () => {
  it("returns all zeros for no rows", () => {
    expect(computeDigestDelta([], NOW)).toEqual({
      newCount: 0,
      newCents: 0,
      resolvedCount: 0,
      resolvedCents: 0,
    });
  });

  it("counts open and acknowledged findings first seen within 7 days and sums their cents", () => {
    const delta = computeDigestDelta(
      [
        row({
          status: "open",
          firstSeenAt: new Date(NOW.getTime() - 2 * DAY_MS),
          monthlyImpactCents: 2500,
        }),
        row({
          status: "acknowledged",
          firstSeenAt: new Date(NOW.getTime() - 6 * DAY_MS),
          monthlyImpactCents: 1500,
        }),
        // Old open finding: part of the standing total, not the delta.
        row({ status: "open", monthlyImpactCents: 99_999 }),
      ],
      NOW,
    );
    expect(delta.newCount).toBe(2);
    expect(delta.newCents).toBe(4000);
    expect(delta.resolvedCount).toBe(0);
    expect(delta.resolvedCents).toBe(0);
  });

  it("includes the exact 7-day boundary and excludes anything older", () => {
    const delta = computeDigestDelta(
      [
        row({ firstSeenAt: new Date(NOW.getTime() - 7 * DAY_MS) }),
        row({ firstSeenAt: new Date(NOW.getTime() - 7 * DAY_MS - 1) }),
      ],
      NOW,
    );
    expect(delta.newCount).toBe(1);
  });

  it("counts recently resolved findings, boundary inclusive", () => {
    const delta = computeDigestDelta(
      [
        row({
          status: "resolved",
          resolvedAt: new Date(NOW.getTime() - 7 * DAY_MS),
          monthlyImpactCents: 800,
        }),
        row({
          status: "resolved",
          resolvedAt: new Date(NOW.getTime() - 7 * DAY_MS - 1),
          monthlyImpactCents: 600,
        }),
      ],
      NOW,
    );
    expect(delta.resolvedCount).toBe(1);
    expect(delta.resolvedCents).toBe(800);
  });

  it("does not count a reopened finding with a stale resolvedAt as resolved", () => {
    const delta = computeDigestDelta(
      [
        // Auto-resolved by a sync, then manually reopened in the UI: the
        // status actions do not clear resolvedAt.
        row({
          status: "open",
          firstSeenAt: new Date(NOW.getTime() - 30 * DAY_MS),
          resolvedAt: new Date(NOW.getTime() - 2 * DAY_MS),
        }),
      ],
      NOW,
    );
    expect(delta.newCount).toBe(0);
    expect(delta.resolvedCount).toBe(0);
  });

  it("does not count a resolved finding as new even when it first appeared this week", () => {
    const delta = computeDigestDelta(
      [
        row({
          status: "resolved",
          firstSeenAt: new Date(NOW.getTime() - 3 * DAY_MS),
          resolvedAt: new Date(NOW.getTime() - 1 * DAY_MS),
          monthlyImpactCents: 1200,
        }),
      ],
      NOW,
    );
    expect(delta.newCount).toBe(0);
    expect(delta.resolvedCount).toBe(1);
    expect(delta.resolvedCents).toBe(1200);
  });
});

describe("daysUntilDate", () => {
  it("returns negative days for past dates, null for unset and malformed", () => {
    expect(daysUntilDate("2026-06-10", NOW)).toBe(-2);
    expect(daysUntilDate(null, NOW)).toBeNull();
    expect(daysUntilDate("not-a-date", NOW)).toBeNull();
    expect(daysUntilDate("2026-02-31", NOW)).toBeNull();
  });
});

describe("renewalDigestLine", () => {
  it("surfaces a cancellation deadline before the renewal itself enters the window", () => {
    expect(
      renewalDigestLine(
        [
          {
            vendor: "Microsoft",
            contractName: "Enterprise Agreement",
            renewalDate: "2026-10-10",
            noticeDays: 120,
          },
        ],
        NOW,
      ),
    ).toBe(
      "Microsoft: Enterprise Agreement: cancellation notice deadline is today; renewal in 120 days",
    );
  });

  it("chooses the most urgent notice deadline across vendors", () => {
    expect(
      renewalDigestLine(
        [
          {
            vendor: "Adobe",
            contractName: "Creative Cloud",
            renewalDate: "2026-08-11",
            noticeDays: 14,
          },
          {
            vendor: "Atlassian",
            contractName: "Cloud Enterprise",
            renewalDate: "2026-09-10",
            noticeDays: 89,
          },
        ],
        NOW,
      ),
    ).toBe(
      "Atlassian: Cloud Enterprise: cancellation notice deadline is in 1 day; renewal in 90 days",
    );
  });

  it("reports overdue notice deadlines and ignores past or distant contracts", () => {
    expect(
      renewalDigestLine(
        [
          {
            vendor: "Zoom",
            contractName: "Zoom Workplace",
            renewalDate: "2026-07-12",
            noticeDays: 35,
          },
          {
            vendor: "Past",
            contractName: "Expired",
            renewalDate: "2026-06-11",
            noticeDays: 30,
          },
        ],
        NOW,
      ),
    ).toBe(
      "Zoom Workplace: cancellation notice deadline passed 5 days ago; renewal in 30 days",
    );
    expect(
      renewalDigestLine(
        [
          {
            vendor: "GitHub",
            contractName: "Enterprise",
            renewalDate: "2027-01-01",
            noticeDays: 30,
          },
        ],
        NOW,
      ),
    ).toBeNull();
  });
});

describe("computeAiSpendDelta", () => {
  it("returns zeros for no rows", () => {
    expect(computeAiSpendDelta([], NOW)).toEqual({
      last7Cents: 0,
      prior7Cents: 0,
    });
  });

  it("counts today in the last-7 bucket", () => {
    expect(
      computeAiSpendDelta([{ day: "2026-06-12", amountCents: 500 }], NOW),
    ).toEqual({ last7Cents: 500, prior7Cents: 0 });
  });

  it("puts exactly 7 days old in the prior bucket, 6 days old in last-7", () => {
    expect(
      computeAiSpendDelta(
        [
          { day: "2026-06-06", amountCents: 300 }, // age 6
          { day: "2026-06-05", amountCents: 700 }, // age 7
        ],
        NOW,
      ),
    ).toEqual({ last7Cents: 300, prior7Cents: 700 });
  });

  it("includes age 13 in the prior bucket and ignores age 14", () => {
    expect(
      computeAiSpendDelta(
        [
          { day: "2026-05-30", amountCents: 400 }, // age 13
          { day: "2026-05-29", amountCents: 9_999 }, // age 14
        ],
        NOW,
      ),
    ).toEqual({ last7Cents: 0, prior7Cents: 400 });
  });

  it("ignores malformed day strings", () => {
    expect(
      computeAiSpendDelta([{ day: "not-a-date", amountCents: 1000 }], NOW),
    ).toEqual({ last7Cents: 0, prior7Cents: 0 });
  });

  it("sums multiple rows on the same day", () => {
    expect(
      computeAiSpendDelta(
        [
          { day: "2026-06-10", amountCents: 250 },
          { day: "2026-06-10", amountCents: 150 },
        ],
        NOW,
      ),
    ).toEqual({ last7Cents: 400, prior7Cents: 0 });
  });
});
