import { describe, expect, it } from "vitest";

import { SECURITY_CONTENT } from "~/app/(marketing)/security/content";
import { TRUST_CONTENT } from "~/app/(marketing)/trust-center/content";
import {
  DPA,
  DPA_VERSION,
  type DpaLang,
  subprocessorRegion,
  subprocessorRows,
} from "~/lib/dpa";
import { PRICING_CONTENT } from "~/lib/pricingContent";
import { BACKUP_RETENTION_DAYS } from "~/lib/retention";

const LANGS: DpaLang[] = ["en", "de"];

/** Every string reachable inside a value. */
const strings = (value: unknown): string[] => {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object")
    return Object.values(value).flatMap(strings);
  return [];
};

describe("sub-processor residency badge", () => {
  it("never calls a location outside the EU 'EU'", () => {
    for (const location of [
      "Global edge network",
      "Customer tenant region",
      "EU (Frankfurt); US fallback",
      "EU Data Boundary; US fallback",
      "United States",
      "US (Virginia)",
      "Worldwide",
      "EU and global edge network",
      "",
    ]) {
      expect(subprocessorRegion(location), location).not.toBe("eu");
    }
  });

  it("says 'EU' for EU locations only", () => {
    expect(subprocessorRegion("EU (Frankfurt)")).toBe("eu");
    expect(subprocessorRegion("EU (Ireland)")).toBe("eu");
    expect(subprocessorRegion("EU (Frankfurt); US fallback")).toBe("eu-us");
    expect(subprocessorRegion("Global edge network")).toBe("global");
    expect(subprocessorRegion("Customer tenant region")).toBe("customer");
    expect(subprocessorRegion("Somewhere else")).toBeNull();
  });

  it("derives every published badge from the DPA location", () => {
    for (const row of subprocessorRows("en")) {
      const region = subprocessorRegion(row.location);
      if (region === "eu") expect(row.location).toMatch(/^EU\b/);
      if (row.name.includes("Cloudflare")) expect(region).toBe("global");
      if (row.name.startsWith("Microsoft")) expect(region).toBe("customer");
    }
  });

  it("has a label for every region in both languages", () => {
    for (const lang of LANGS) {
      for (const region of ["eu", "eu-us", "global", "customer"] as const) {
        expect(TRUST_CONTENT[lang].where.regionLabels[region]).not.toBe("");
      }
      expect(TRUST_CONTENT[lang].where.regionLabels.global).not.toMatch(
        /\bEU\b/,
      );
      expect(TRUST_CONTENT[lang].where.regionLabels.customer).not.toMatch(
        /\bEU\b/,
      );
    }
  });
});

describe("DPA annex links", () => {
  it("point at the measures (III) and the sub-processors (IV)", () => {
    for (const lang of LANGS) {
      const c = TRUST_CONTENT[lang];
      expect(c.security.linked.href).toMatch(/#annex-iii$/);
      expect(c.where.note.href).toMatch(/#annex-iv$/);
      expect(SECURITY_CONTENT[lang].subprocessors.note.href).toMatch(
        /#annex-iv$/,
      );
      const annexes = DPA[lang].annexes;
      expect(annexes.find((a) => a.id === "III")?.toms?.length).toBeGreaterThan(
        0,
      );
      expect(
        annexes.find((a) => a.id === "IV")?.subprocessors?.rows.length,
      ).toBeGreaterThan(0);
    }
  });
});

describe("deletion wording", () => {
  const texts = (lang: DpaLang) => [
    ...strings(TRUST_CONTENT[lang]),
    ...strings(SECURITY_CONTENT[lang]),
    ...strings(DPA[lang]),
  ];

  it("no longer ties deletion to a disconnect or promises it is irreversible", () => {
    const banned =
      /irreversib|unwiderruflich|immediately and in full|on disconnect|bei (der )?Trennung|only while (your )?tenant|solange Ihr Tenant|Delete on disconnect/i;
    for (const lang of LANGS) {
      for (const text of texts(lang)) {
        expect(banned.test(text), `${lang}: "${text}"`).toBe(false);
      }
    }
  });

  it("names the backup expiry wherever the live database deletion is stated", () => {
    for (const lang of LANGS) {
      const live = texts(lang).filter((t) =>
        /live database|Live-Datenbank/.test(t),
      );
      expect(live.length).toBeGreaterThan(2);
      for (const text of live) {
        expect(text, `${lang}: "${text}"`).toContain(
          `${BACKUP_RETENTION_DAYS} ${lang === "de" ? "Tage" : "days"}`,
        );
      }
    }
  });
});

describe("status page", () => {
  it("is not linked from the Trust Center or the pricing page", () => {
    for (const lang of LANGS) {
      expect(JSON.stringify(TRUST_CONTENT[lang])).not.toContain('"/status"');
      expect(JSON.stringify(PRICING_CONTENT[lang])).not.toContain('"/status"');
    }
  });
});

describe("DPA version", () => {
  it("is 2.5, carrying the backup wording", () => {
    expect(DPA_VERSION).toBe("2.5");
  });
});
