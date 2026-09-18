import { describe, expect, it } from "vitest";

import {
  isoWeekKey,
  periodKeyFor,
  reportMonthKey,
} from "~/server/emailPeriods";

const utc = (iso: string): Date => new Date(`${iso}Z`);

describe("isoWeekKey", () => {
  it("names the week of an ordinary Monday run", () => {
    expect(isoWeekKey(utc("2026-09-14T06:00:00"))).toBe("2026-W38");
  });

  it("keeps Monday through Sunday in one week", () => {
    expect(isoWeekKey(utc("2026-09-14T00:00:00"))).toBe("2026-W38");
    expect(isoWeekKey(utc("2026-09-20T23:59:59"))).toBe("2026-W38");
    expect(isoWeekKey(utc("2026-09-21T00:00:00"))).toBe("2026-W39");
  });

  it("pads single-digit weeks", () => {
    expect(isoWeekKey(utc("2026-02-02T06:00:00"))).toBe("2026-W06");
  });

  it("puts late December into week 1 of the next year", () => {
    // 2024-12-30 is a Monday; its Thursday is 2025-01-02.
    expect(isoWeekKey(utc("2024-12-30T06:00:00"))).toBe("2025-W01");
    expect(isoWeekKey(utc("2025-12-29T06:00:00"))).toBe("2026-W01");
  });

  it("puts early January into week 52 of the previous year", () => {
    // 2023-01-01 is a Sunday and still belongs to 2022-W52.
    expect(isoWeekKey(utc("2023-01-01T12:00:00"))).toBe("2022-W52");
    expect(isoWeekKey(utc("2022-01-02T12:00:00"))).toBe("2021-W52");
  });

  it("handles 53-week years on both sides of the boundary", () => {
    expect(isoWeekKey(utc("2020-12-31T12:00:00"))).toBe("2020-W53");
    expect(isoWeekKey(utc("2021-01-03T12:00:00"))).toBe("2020-W53");
    expect(isoWeekKey(utc("2021-01-04T06:00:00"))).toBe("2021-W01");
    expect(isoWeekKey(utc("2026-12-28T06:00:00"))).toBe("2026-W53");
    expect(isoWeekKey(utc("2027-01-03T06:00:00"))).toBe("2026-W53");
  });

  it("uses UTC, not the local day", () => {
    expect(isoWeekKey(new Date("2026-09-21T01:00:00+02:00"))).toBe("2026-W38");
  });
});

describe("reportMonthKey", () => {
  it("reports the month before the run", () => {
    expect(reportMonthKey(utc("2026-09-01T07:00:00"))).toBe("2026-08");
  });

  it("reports December of the previous year in January", () => {
    expect(reportMonthKey(utc("2027-01-01T07:00:00"))).toBe("2026-12");
  });

  it("is stable for a late re-run in the same month", () => {
    expect(reportMonthKey(utc("2026-03-31T23:59:59"))).toBe("2026-02");
  });
});

describe("periodKeyFor", () => {
  it("dispatches on the job", () => {
    const now = utc("2026-09-14T06:00:00");
    expect(periodKeyFor("digest", now)).toBe("2026-W38");
    expect(periodKeyFor("report", now)).toBe("2026-08");
  });
});
