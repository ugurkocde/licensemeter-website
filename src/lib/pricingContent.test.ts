import { describe, expect, it } from "vitest";

import { PLAN_PRICES } from "~/lib/pricing";
import {
  PLAN_IDS,
  PRICING_CONTENT,
  PRICING_LANGS,
  comparisonGroups,
  formatEuro,
  planPrice,
} from "~/lib/pricingContent";

/** Every string anywhere in a content tree, keys excluded. */
const strings = (value: unknown): string[] => {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(strings);
  }
  return [];
};

const allStrings = (lang: (typeof PRICING_LANGS)[number]): string[] => [
  ...strings(PRICING_CONTENT[lang]),
  ...strings(comparisonGroups(lang)),
];

const rowIds = (lang: (typeof PRICING_LANGS)[number]): string[] =>
  comparisonGroups(lang).flatMap((g) => g.rows.map((r) => `${g.id}/${r.id}`));

describe("pricing content", () => {
  it("has the same plan ids in both languages", () => {
    for (const lang of PRICING_LANGS) {
      expect(Object.keys(PRICING_CONTENT[lang].plans)).toEqual([...PLAN_IDS]);
    }
  });

  it("has the same comparison rows in the same order in both languages", () => {
    expect(rowIds("de")).toEqual(rowIds("en"));
    expect(rowIds("en").length).toBeGreaterThan(20);
    for (const lang of PRICING_LANGS) {
      for (const group of comparisonGroups(lang)) {
        expect(group.label).not.toBe("");
        for (const row of group.rows) {
          expect(row.label).not.toBe("");
          expect(row.cells).toHaveLength(PLAN_IDS.length);
        }
      }
    }
  });

  it("gives both languages the same cells, apart from the wording", () => {
    const kinds = (lang: (typeof PRICING_LANGS)[number]) =>
      comparisonGroups(lang).map((g) =>
        g.rows.map((r) => r.cells.map((cell) => cell.kind)),
      );
    expect(kinds("de")).toEqual(kinds("en"));
  });

  it("has the same number of plan items, FAQ items and facts", () => {
    const { en, de } = PRICING_CONTENT;
    for (const id of PLAN_IDS) {
      expect(de.plans[id].items).toHaveLength(en.plans[id].items.length);
      expect(de.plans[id].soon?.length).toBe(en.plans[id].soon?.length);
    }
    expect(de.faq.items).toHaveLength(en.faq.items.length);
    expect(de.facts.items).toHaveLength(en.facts.items.length);
    expect(de.buy.options).toHaveLength(en.buy.options.length);
  });

  it("follows the writing rules in every string", () => {
    const banned: [string, RegExp][] = [
      ["em-dash", /\u2014/],
      ["en-dash", /\u2013/],
      ["spaced hyphen", / - /],
      ["SLA", /\bSLA\b/i],
      ["service credit", /service credit/i],
      ["priority support", /priority support/i],
      ["Azure credit", /azure credit/i],
    ];
    for (const lang of PRICING_LANGS) {
      for (const text of allStrings(lang)) {
        for (const [name, pattern] of banned) {
          expect(pattern.test(text), `${lang}: ${name} in "${text}"`).toBe(
            false,
          );
        }
      }
    }
  });

  it("never presents unbuilt features as available", () => {
    for (const lang of PRICING_LANGS) {
      const groups = comparisonGroups(lang);
      const soon = groups.filter((g) => g.soon);
      expect(soon.map((g) => g.id)).toEqual(["soon"]);
      expect(soon[0]!.rows.map((r) => r.id)).toEqual([
        "portfolioAlerts",
        "mspTeam",
      ]);
      for (const row of soon[0]!.rows) {
        expect(row.cells.some((cell) => cell.kind === "yes")).toBe(false);
      }
      /* Outside that group, and in the list of included plan items, the two
       * labels must not appear at all. */
      const soonLabels = soon[0]!.rows.map((r) => r.label);
      const available = [
        ...groups.filter((g) => !g.soon).flatMap((g) => g.rows),
      ].map((r) => r.label);
      const included = PLAN_IDS.flatMap((id) =>
        PRICING_CONTENT[lang].plans[id].items.map((item) => item.text),
      );
      for (const label of soonLabels) {
        expect(available).not.toContain(label);
        expect(included).not.toContain(label);
      }
      expect(PRICING_CONTENT[lang].plans.msp.soon).toEqual(soonLabels);
    }
    expect(allStrings("en").join("\n")).not.toMatch(/team roles|delegation/i);
  });

  it("states the limits and commitments of the model", () => {
    const row = (id: string) =>
      comparisonGroups("en")
        .flatMap((g) => g.rows)
        .find((r) => r.id === id)!
        .cells.map((cell) => (cell.kind === "text" ? cell.text : cell.kind));
    expect(row("history")).toEqual(["12 months", "24 months", "24 months"]);
    expect(row("support")).toEqual(["No support", "Email", "Email"]);
    expect(row("standardDpa")).toEqual(["yes", "yes", "yes"]);
    expect(row("signedDpa")).toEqual(["no", "yes", "yes"]);
    expect(row("subProcessorDpa")).toEqual(["no", "no", "yes"]);
    expect(row("onboarding")).toEqual(["no", "no", "yes"]);
  });

  it("takes prices from the shared figures and formats them per language", () => {
    expect(planPrice("free", "year")).toBe(0);
    expect(planPrice("pro", "month")).toBe(PLAN_PRICES.pro.month);
    expect(planPrice("msp", "year")).toBe(PLAN_PRICES.msp.year);
    expect(formatEuro(2990, "en")).toBe("€2,990");
    expect(formatEuro(2990, "de")).toBe("2.990\u00a0€");
    expect(formatEuro(99, "en")).toBe("€99");
    /* "2 months off" and "twelve months for the price of ten". */
    expect(PLAN_PRICES.pro.year).toBe(PLAN_PRICES.pro.month * 10);
    expect(PLAN_PRICES.msp.year).toBe(PLAN_PRICES.msp.month * 10);
  });
});
