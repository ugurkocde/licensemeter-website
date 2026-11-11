import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { TRUST_CONTENT } from "~/app/(marketing)/trust-center/content";
import { PRICING_CONTENT } from "~/lib/pricingContent";
import { RETENTION_DAYS } from "~/lib/retention";
import { SLA_CONTENT, SLA_TERMS, formatPct } from "~/lib/sla";

/** Every string reachable inside a value, for copy-wide checks. */
const strings = (value: unknown): string[] => {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object")
    return Object.values(value).flatMap(strings);
  return [];
};

const text = (value: unknown) => strings(value).join("\n");

describe("SLA content", () => {
  it("formats the target per language", () => {
    expect(formatPct(99.5, "en")).toBe("99.5%");
    expect(formatPct(99.5, "de")).toBe("99,5 %");
    expect(formatPct(95, "de")).toBe("95,0 %");
  });

  it("has the same sections in English and German", () => {
    const ids = (lang: "en" | "de") =>
      SLA_CONTENT[lang].sections.map((s) => s.id);
    expect(ids("de")).toEqual(ids("en"));
  });

  it("quotes every number in both languages", () => {
    const en = text(SLA_CONTENT.en);
    const de = text(SLA_CONTENT.de);
    for (const { belowPct, creditPct } of SLA_TERMS.credits) {
      expect(en).toContain(`below ${formatPct(belowPct, "en")}: ${creditPct}%`);
      expect(de).toContain(
        `unter ${formatPct(belowPct, "de")}: ${creditPct} %`,
      );
    }
    for (const n of [
      SLA_TERMS.creditClaimDays,
      SLA_TERMS.maintenanceNoticeHours,
      SLA_TERMS.incidentNoticeHours,
      SLA_TERMS.rtoHours,
      SLA_TERMS.response.criticalBusinessHours,
      SLA_TERMS.response.normalBusinessDays,
    ]) {
      expect(en).toContain(String(n));
      expect(de).toContain(String(n));
    }
    expect(en).toContain("Effective 13 November 2026");
    expect(de).toContain("Gültig ab 13. November 2026");
  });

  it("is the only uptime figure anywhere in the site source", () => {
    const files = readdirSync("src", { recursive: true, encoding: "utf8" })
      .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f))
      .map((f) => join("src", f));
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/99(\.9%|,9 %)/);
    }
  });

  it("is the only uptime figure on the pricing page", () => {
    const pricing = text(PRICING_CONTENT);
    expect(pricing).not.toMatch(/99[.,]9/);
    expect(pricing).toContain(formatPct(SLA_TERMS.availabilityTargetPct, "en"));
    expect(pricing).toContain(formatPct(SLA_TERMS.availabilityTargetPct, "de"));
  });
});

describe("Trust Center content", () => {
  it("states the retention periods from the constants", () => {
    for (const lang of ["en", "de"] as const) {
      const retention = text(TRUST_CONTENT[lang].retention);
      for (const days of Object.values(RETENTION_DAYS)) {
        expect(retention).toContain(`${days} `);
      }
    }
  });

  it("keeps the same, unique section anchors in both languages", () => {
    const anchors = (lang: "en" | "de") => {
      const c = TRUST_CONTENT[lang];
      return [
        c.retention,
        c.program,
        c.vulnerability,
        c.incident,
        c.continuity,
        c.sla,
        c.compliance,
        c.contact,
      ].map((s) => s.id);
    };
    expect(anchors("de")).toEqual(anchors("en"));
    expect(new Set(anchors("en")).size).toBe(anchors("en").length);
  });

  it("says plainly that no external penetration test has been done", () => {
    expect(text(TRUST_CONTENT.en.vulnerability)).toContain(
      "No external penetration test has been performed yet.",
    );
  });
});

describe("public copy punctuation", () => {
  it("uses no em dashes, en dashes or spaced hyphens", () => {
    for (const copy of [SLA_CONTENT, TRUST_CONTENT]) {
      for (const s of strings(copy)) {
        expect(s).not.toMatch(/[–—]| - /);
      }
    }
  });
});
