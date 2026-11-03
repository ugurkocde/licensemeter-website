import { describe, expect, it } from "vitest";

import {
  exclusionLikePatterns,
  exclusionMatcher,
  MAX_EXCLUSIONS,
  parseExclusions,
} from "./findingExclusions";

describe("parseExclusions", () => {
  it("trims, drops blanks, collapses stars and dedupes case-insensitively", () => {
    expect(
      parseExclusions(
        " svc-** \n\n*@Rooms.contoso.com, SVC-*\n*@rooms.CONTOSO.com",
      ),
    ).toEqual({ ok: true, patterns: ["svc-*", "*@Rooms.contoso.com"] });
  });

  it("accepts an empty list to clear exclusions", () => {
    expect(parseExclusions(" \n ")).toEqual({ ok: true, patterns: [] });
  });

  it("rejects a bare star, overlong patterns and too many patterns", () => {
    expect(parseExclusions("**").ok).toBe(false);
    expect(parseExclusions("a".repeat(121)).ok).toBe(false);
    const many = Array.from({ length: MAX_EXCLUSIONS + 1 }, (_, i) => `p${i}`);
    expect(parseExclusions(many.join("\n")).ok).toBe(false);
  });
});

describe("exclusionMatcher", () => {
  const match = exclusionMatcher(["svc-*", "*@rooms.contoso.com", "*_Queue*"]);

  it("matches upn or display name with * globs, case-insensitively", () => {
    expect(match({ upn: "SVC-backup@contoso.com", displayName: null })).toBe(
      true,
    );
    expect(
      match({ upn: "board@ROOMS.contoso.com", displayName: "Board" }),
    ).toBe(true);
    expect(
      match({ upn: "cq@contoso.com", displayName: "sales_queue_eu" }),
    ).toBe(true);
    expect(match({ upn: "alex@contoso.com", displayName: "Alex" })).toBe(false);
  });

  it("treats regex characters literally", () => {
    const literal = exclusionMatcher(["a.b+c@contoso.com"]);
    expect(literal({ upn: "a.b+c@contoso.com", displayName: null })).toBe(true);
    expect(literal({ upn: "aXbbc@contoso.com", displayName: null })).toBe(
      false,
    );
  });

  it("handles ? and other characters literally and anchors both ends", () => {
    const m = exclusionMatcher(["svc?*", "*room"]);
    expect(m({ upn: "svc?1@contoso.com", displayName: null })).toBe(true);
    expect(m({ upn: "svcx1@contoso.com", displayName: null })).toBe(false);
    expect(m({ upn: "x@contoso.com", displayName: "Board Room" })).toBe(true);
    expect(m({ upn: "x@contoso.com", displayName: "Board Rooms" })).toBe(false);
  });

  it("finishes fast on a pathological pattern", () => {
    const m = exclusionMatcher(["*a*a*a*a*a*a*a*a*a*b"]);
    const long = "a".repeat(20_000);
    const started = performance.now();
    for (let i = 0; i < 50; i++) {
      expect(m({ upn: long, displayName: long })).toBe(false);
    }
    expect(m({ upn: `${long}b`, displayName: null })).toBe(true);
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it("stays fast on a pattern built to force backtracking", () => {
    const adversarial = `*${"a".repeat(118)}b`;
    const m = exclusionMatcher(Array.from({ length: 50 }, () => adversarial));
    const as = "a".repeat(256);
    const started = performance.now();
    for (let i = 0; i < 1000; i++) {
      expect(m({ upn: as, displayName: as })).toBe(false);
    }
    expect(m({ upn: `${as}b`, displayName: null })).toBe(true);
    expect(performance.now() - started).toBeLessThan(3000);
  });

  it("checks 60,000 accounts against 50 worst-case patterns in time", () => {
    const patterns = Array.from(
      { length: 50 },
      (_, i) => `*${"a*".repeat(20)}${"a".repeat(60)}${i}b`,
    );
    expect(parseExclusions(patterns.join("\n")).ok).toBe(true);
    const m = exclusionMatcher(patterns);
    // Every account runs prefix and suffix checks against every pattern;
    // half of them also reach the middle chunks and match the last pattern.
    const miss = {
      upn: `${"a".repeat(100)}@contoso.com`,
      displayName: "a".repeat(120),
    };
    const hit = { upn: `${"a".repeat(110)}49b`, displayName: null };
    const started = performance.now();
    let matched = 0;
    for (let i = 0; i < 60_000; i++) {
      if (m(i % 2 === 0 ? miss : hit)) matched++;
    }
    expect(matched).toBe(30_000);
    expect(performance.now() - started).toBeLessThan(3000);
  });

  it("agrees with a reference glob implementation", () => {
    const reference = (pattern: string, value: string) =>
      new RegExp(
        `^${pattern
          .split("*")
          .map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
          .join(".*")}$`,
        "is",
      ).test(value);
    const alphabet = ["a", "b", "*"];
    let seed = 7;
    const next = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31);
    const word = (len: number, chars: string[]) =>
      Array.from({ length: len }, () => chars[next() % chars.length]).join("");
    for (let i = 0; i < 2000; i++) {
      const pattern = word(1 + (next() % 6), alphabet).replace(/\*{2,}/g, "*");
      if (pattern === "*") continue;
      const value = word(next() % 8, ["a", "b"]);
      expect(
        exclusionMatcher([pattern])({ upn: value, displayName: null }),
        `${pattern} vs ${value}`,
      ).toBe(reference(pattern, value));
    }
  });

  it("matches nothing without patterns", () => {
    expect(
      exclusionMatcher([])({ upn: "x@contoso.com", displayName: "x" }),
    ).toBe(false);
  });
});

describe("exclusionLikePatterns", () => {
  it("turns * into % and escapes LIKE wildcards", () => {
    expect(exclusionLikePatterns(["svc_*", "100%*"])).toEqual([
      "svc\\_%",
      "100\\%%",
    ]);
  });
});
