import { describe, expect, it } from "vitest";

import { nextTier, seatNudge } from "./plans";

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
