import { describe, expect, it } from "vitest";

import { calendarDaysUntil, fmtAgo, fmtDate, relativeDayLabel } from "./format";

describe("fmtAgo", () => {
  it("returns never for null", () => {
    expect(fmtAgo(null)).toBe("never");
  });

  it("formats past durations", () => {
    expect(fmtAgo(new Date(Date.now() - 5 * 60_000))).toBe("5 min ago");
    expect(fmtAgo(new Date(Date.now() - 3 * 60 * 60_000))).toBe("3 h ago");
    expect(fmtAgo(new Date(Date.now() - 48 * 60 * 60_000))).toBe("2 d ago");
  });

  it("clamps future timestamps to just now", () => {
    expect(fmtAgo(new Date(Date.now() + 10 * 60_000))).toBe("just now");
  });
});

describe("calendarDaysUntil", () => {
  // Local wall-clock times: the same timezone fmtDate formats in.
  const at = (day: number, hour: number) => new Date(2026, 10, day, hour, 0);

  it("counts calendar dates, not elapsed hours", () => {
    // Noon today to tomorrow evening is 30 hours but one calendar day.
    expect(calendarDaysUntil(at(4, 18), at(3, 12))).toBe(1);
    // Evening today to later tonight is the same date, not tomorrow.
    expect(calendarDaysUntil(at(3, 23), at(3, 20))).toBe(0);
    // Late evening to early tomorrow is one day although only hours apart.
    expect(calendarDaysUntil(at(4, 1), at(3, 23))).toBe(1);
    expect(calendarDaysUntil(at(1, 9), at(3, 12))).toBe(-2);
  });

  it("agrees with the displayed date", () => {
    const now = at(3, 21);
    const date = at(4, 6);
    expect(fmtDate(date)).toBe("04 Nov 2026");
    expect(relativeDayLabel(calendarDaysUntil(date, now))).toBe("Tomorrow");
  });

  it("labels past and future days", () => {
    expect([-3, -1, 0, 1, 12].map((d) => relativeDayLabel(d))).toEqual([
      "3 days ago",
      "Yesterday",
      "Today",
      "Tomorrow",
      "In 12 days",
    ]);
  });
});
