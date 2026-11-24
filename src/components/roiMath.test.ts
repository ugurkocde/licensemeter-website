import { describe, expect, it } from "vitest";
import {
  computeRoi,
  DEMO_WASTE_PCT,
  parseEuroToCents,
  parseSeats,
} from "./roiMath";
describe("waste estimates", () => {
  it.each([
    [250, 3670, 8, 73400],
    [3000, 3670, 8, 880800],
    [25, 3670, 8, 7340],
    [250, 0, 8, 0],
  ])("calculates waste for %i seats", (seats, cost, pct, monthly) => {
    expect(computeRoi(seats, cost, pct)).toEqual({
      monthlyWasteCents: monthly,
      annualWasteCents: monthly * 12,
    });
  });
});
describe("input parsing", () => {
  it("accepts dot and comma decimals for euros and rejects junk", () => {
    expect(parseEuroToCents("36.70")).toBe(3670);
    expect(parseEuroToCents("36,70")).toBe(3670);
    expect(parseEuroToCents("12")).toBe(1200);
    expect(parseEuroToCents("")).toBe(0);
    expect(parseEuroToCents("abc")).toBe(0);
    expect(parseEuroToCents("-5")).toBe(0);
  });

  it("parses seats as whole non-negative numbers", () => {
    expect(parseSeats("250")).toBe(250);
    expect(parseSeats("12.7")).toBe(12);
    expect(parseSeats("")).toBe(0);
    expect(parseSeats("-40")).toBe(0);
    expect(parseSeats("99999999")).toBe(1_000_000);
  });
});

describe("DEMO_WASTE_PCT", () => {
  it("matches the demo tenant the marketing pages quote (32 percent)", () => {
    // 297986 / 924294, recomputed so the slider hint cannot go stale.
    expect(DEMO_WASTE_PCT).toBe(32);
  });
});
