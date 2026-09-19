import { describe, expect, it } from "vitest";

import {
  DEFAULT_ACCENT,
  TEXT_ON_DARK,
  TEXT_ON_LIGHT,
  brandBand,
  contrastRatio,
  readableTextOn,
  relativeLuminance,
} from "~/server/report/brandStyle";

describe("relativeLuminance", () => {
  it("runs from 0 for black to 1 for white", () => {
    expect(relativeLuminance("#000000")).toBe(0);
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 10);
  });

  it("weights green above red above blue", () => {
    expect(relativeLuminance("#00ff00")).toBeCloseTo(0.7152, 4);
    expect(relativeLuminance("#ff0000")).toBeCloseTo(0.2126, 4);
    expect(relativeLuminance("#0000ff")).toBeCloseTo(0.0722, 4);
  });

  it("accepts upper case and refuses anything that is not #RRGGBB", () => {
    expect(relativeLuminance("#FFE600")).toBe(relativeLuminance("#ffe600"));
    expect(() => relativeLuminance("#fff")).toThrow();
    expect(() => relativeLuminance("yellow")).toThrow();
  });
});

describe("contrastRatio", () => {
  it("is 21 between black and white, in either order", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 5);
  });

  it("is 1 for a colour against itself", () => {
    expect(contrastRatio("#1e3a8a", "#1e3a8a")).toBe(1);
  });
});

describe("readableTextOn", () => {
  it("picks dark text on a bright yellow brand", () => {
    expect(readableTextOn("#ffe600")).toBe(TEXT_ON_LIGHT);
  });

  it("picks dark text on white and on pale tints", () => {
    expect(readableTextOn("#ffffff")).toBe(TEXT_ON_LIGHT);
    expect(readableTextOn("#a7f3d0")).toBe(TEXT_ON_LIGHT);
  });

  it("picks white text on dark and saturated brands", () => {
    expect(readableTextOn("#000000")).toBe(TEXT_ON_DARK);
    expect(readableTextOn("#1e3a8a")).toBe(TEXT_ON_DARK);
    expect(readableTextOn("#b91c1c")).toBe(TEXT_ON_DARK);
    expect(readableTextOn(DEFAULT_ACCENT)).toBe(TEXT_ON_DARK);
  });

  it("always reaches a readable contrast on the band", () => {
    for (const color of ["#ffe600", "#777777", "#ff7a00", "#00b7c3", "#fafafa"])
      expect(
        contrastRatio(readableTextOn(color), color),
      ).toBeGreaterThanOrEqual(4.5);
  });
});

describe("brandBand", () => {
  it("falls back to the LicenseMeter accent without a colour", () => {
    expect(brandBand(null)).toEqual({
      background: DEFAULT_ACCENT,
      text: TEXT_ON_DARK,
    });
  });

  it("falls back for a stored value that is not a colour", () => {
    expect(brandBand("red").background).toBe(DEFAULT_ACCENT);
  });

  it("pairs the brand colour with its readable text colour", () => {
    expect(brandBand("#ffe600")).toEqual({
      background: "#ffe600",
      text: TEXT_ON_LIGHT,
    });
  });
});
