import { describe, expect, it } from "vitest";

import { ALL_RULES, findingChipLabel, isWasteRule } from "~/lib/rules";

describe("isWasteRule", () => {
  it("accepts every known rule id", () => {
    for (const rule of ALL_RULES) expect(isWasteRule(rule)).toBe(true);
  });

  it("rejects unknown ids and inherited object keys", () => {
    expect(isWasteRule("not_a_rule")).toBe(false);
    expect(isWasteRule("constructor")).toBe(false);
    expect(isWasteRule("__proto__")).toBe(false);
    expect(isWasteRule("toString")).toBe(false);
    expect(isWasteRule("")).toBe(false);
  });
});

describe("findingChipLabel", () => {
  it("names the provider for generic SaaS rules", () => {
    expect(findingChipLabel("saas_inactive", { provider: "zoom" })).toBe(
      "Zoom idle",
    );
  });

  it("falls back to the rule chip when the provider is not a known connector", () => {
    const generic = findingChipLabel("saas_inactive", {});
    expect(findingChipLabel("saas_inactive", { provider: "constructor" })).toBe(
      generic,
    );
    expect(findingChipLabel("saas_inactive", { provider: "__proto__" })).toBe(
      generic,
    );
  });
});
