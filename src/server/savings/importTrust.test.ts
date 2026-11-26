import { describe, expect, it } from "vitest";

import { importEarnsCredits } from "./importTrust";

describe("importEarnsCredits", () => {
  it("never trusts a paste with invalid rows", () => {
    expect(
      importEarnsCredits({
        invalidRows: 1,
        previousSeats: 100,
        importedSeats: 99,
      }),
    ).toBe(false);
  });

  it("trusts a first import and a growing roster", () => {
    expect(
      importEarnsCredits({
        invalidRows: 0,
        previousSeats: 0,
        importedSeats: 40,
      }),
    ).toBe(true);
    expect(
      importEarnsCredits({
        invalidRows: 0,
        previousSeats: 40,
        importedSeats: 45,
      }),
    ).toBe(true);
  });

  it("trusts small drops: up to 5 seats or 20 percent", () => {
    expect(
      importEarnsCredits({
        invalidRows: 0,
        previousSeats: 10,
        importedSeats: 5,
      }),
    ).toBe(true);
    expect(
      importEarnsCredits({
        invalidRows: 0,
        previousSeats: 100,
        importedSeats: 80,
      }),
    ).toBe(true);
  });

  it("does not trust a paste that looks partial", () => {
    expect(
      importEarnsCredits({
        invalidRows: 0,
        previousSeats: 10,
        importedSeats: 4,
      }),
    ).toBe(false);
    expect(
      importEarnsCredits({
        invalidRows: 0,
        previousSeats: 100,
        importedSeats: 79,
      }),
    ).toBe(false);
    expect(
      importEarnsCredits({
        invalidRows: 0,
        previousSeats: 500,
        importedSeats: 50,
      }),
    ).toBe(false);
  });
});
