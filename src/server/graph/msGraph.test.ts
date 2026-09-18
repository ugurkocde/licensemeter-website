import { describe, expect, it } from "vitest";

import { parseRetryAfter } from "./msGraph";

const NOW = Date.parse("2026-09-18T12:00:00Z");

describe("parseRetryAfter", () => {
  it("reads delta-seconds", () => {
    expect(parseRetryAfter("2", NOW)).toBe(2000);
    expect(parseRetryAfter(" 7 ", NOW)).toBe(7000);
    expect(parseRetryAfter("0", NOW)).toBe(0);
  });

  it("reads an HTTP-date relative to now", () => {
    expect(parseRetryAfter("Fri, 18 Sep 2026 12:00:05 GMT", NOW)).toBe(5000);
    // A date in the past means retry immediately, never a negative sleep.
    expect(parseRetryAfter("Fri, 18 Sep 2026 11:59:00 GMT", NOW)).toBe(0);
  });

  it("clamps to 30 seconds", () => {
    expect(parseRetryAfter("120", NOW)).toBe(30_000);
    expect(parseRetryAfter("Fri, 18 Sep 2026 13:00:00 GMT", NOW)).toBe(30_000);
  });

  it("returns null for absent or unparsable headers so callers use a default", () => {
    expect(parseRetryAfter(null, NOW)).toBeNull();
    expect(parseRetryAfter("", NOW)).toBeNull();
    expect(parseRetryAfter("soon", NOW)).toBeNull();
    expect(parseRetryAfter("NaN", NOW)).toBeNull();
    expect(parseRetryAfter("-5", NOW)).toBeNull();
  });
});
