import { describe, expect, it } from "vitest";

import { nextTier, parsePlanString, seatNudge } from "./plans";

describe("seatNudge", () => {
  it("is null comfortably inside the band", () => {
    expect(seatNudge("starter", 100)).toBeNull(); // 100 < floor(0.85*250)=212
    expect(seatNudge("growth", 500)).toBeNull();
  });

  it("flags 'over' past the band cap, recommending the band that fits", () => {
    expect(seatNudge("starter", 320)).toEqual({
      state: "over",
      seatMax: 250,
      recommendedTier: "growth",
    });
    // Past the top self-serve band -> MSP (null).
    expect(seatNudge("scale", 4000)).toEqual({
      state: "over",
      seatMax: 2500,
      recommendedTier: null,
    });
  });

  it("flags 'approaching' within the nudge ratio, recommending the next band", () => {
    expect(seatNudge("starter", 212)).toEqual({
      state: "approaching",
      seatMax: 250,
      recommendedTier: "growth",
    });
    expect(seatNudge("starter", 211)).toBeNull();
    // Approaching the top band -> next step is MSP (null).
    expect(seatNudge("scale", 2400)).toEqual({
      state: "approaching",
      seatMax: 2500,
      recommendedTier: null,
    });
  });

  it("treats exactly at the cap as approaching, one over as over", () => {
    expect(seatNudge("growth", 1000)?.state).toBe("approaching");
    expect(seatNudge("growth", 1001)?.state).toBe("over");
  });
});

describe("nextTier", () => {
  it("walks the bands and returns null past the top", () => {
    expect(nextTier("starter")).toBe("growth");
    expect(nextTier("growth")).toBe("scale");
    expect(nextTier("scale")).toBeNull();
  });
});

/**
 * parsePlanString is the ONLY validation on the attacker-controlled checkout
 * ?plan= token, so the rejection surface matters as much as the happy path. It
 * accepts exactly "tier:interval" where tier is a known plan and interval is
 * the literal "monthly" or "annual"; everything else must return null (never a
 * coerced or defaulted plan).
 */
describe("parsePlanString", () => {
  it("parses every valid tier:interval token, mapping the interval to the storage form", () => {
    expect(parsePlanString("starter:monthly")).toEqual({ tier: "starter", interval: "month" });
    expect(parsePlanString("starter:annual")).toEqual({ tier: "starter", interval: "year" });
    expect(parsePlanString("growth:monthly")).toEqual({ tier: "growth", interval: "month" });
    expect(parsePlanString("growth:annual")).toEqual({ tier: "growth", interval: "year" });
    expect(parsePlanString("scale:monthly")).toEqual({ tier: "scale", interval: "month" });
    expect(parsePlanString("scale:annual")).toEqual({ tier: "scale", interval: "year" });
  });

  it("rejects empty / nullish input", () => {
    expect(parsePlanString(null)).toBeNull();
    expect(parsePlanString(undefined)).toBeNull();
    expect(parsePlanString("")).toBeNull();
  });

  it("rejects an unknown tier", () => {
    expect(parsePlanString("enterprise:monthly")).toBeNull();
    expect(parsePlanString("free:annual")).toBeNull();
    expect(parsePlanString("STARTER:monthly")).toBeNull(); // case-sensitive
    expect(parsePlanString(":monthly")).toBeNull();
  });

  it("rejects an unknown / wrong interval", () => {
    expect(parsePlanString("growth:weekly")).toBeNull();
    expect(parsePlanString("growth:month")).toBeNull(); // storage form, not the token form
    expect(parsePlanString("growth:year")).toBeNull();
    expect(parsePlanString("growth:ANNUAL")).toBeNull(); // case-sensitive
    expect(parsePlanString("growth:")).toBeNull();
    expect(parsePlanString("growth")).toBeNull(); // missing colon + interval
  });

  it("rejects malformed shapes: missing colon, junk separators, whitespace", () => {
    expect(parsePlanString("growthmonthly")).toBeNull();
    expect(parsePlanString("growth-monthly")).toBeNull();
    expect(parsePlanString(" growth:monthly")).toBeNull(); // leading space breaks the tier
    expect(parsePlanString("growth : monthly")).toBeNull();
    expect(parsePlanString("growth:monthly ")).toBeNull(); // trailing space breaks the interval
  });

  it("ignores trailing colon-separated junk (split takes only the first two parts)", () => {
    // Documents the actual contract: extra ':' segments after the interval are
    // dropped by the 2-element destructure, so a third part does not poison the
    // result. This is safe — the interval is still strictly validated.
    expect(parsePlanString("growth:monthly:extra")).toEqual({ tier: "growth", interval: "month" });
    // But junk in the interval slot itself is still rejected.
    expect(parsePlanString("growth:extra:monthly")).toBeNull();
  });
});
