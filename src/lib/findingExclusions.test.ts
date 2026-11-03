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
