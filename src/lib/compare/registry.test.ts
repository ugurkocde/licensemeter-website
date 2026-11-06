import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { CORE_FEATURE_KEYS, FEATURES } from "./features";
import {
  HEAD_TO_HEAD,
  PRODUCTS,
  productSourcePath,
  ROUNDUPS,
  roundupSourcePath,
  templatedCompareSlugs,
} from "./registry";
import { STATUS_QUO_COMPARISONS } from ".";

const ROOT = path.resolve(__dirname, "../../..");

const strings = (value: unknown): string[] =>
  typeof value === "string"
    ? [value]
    : Array.isArray(value)
      ? value.flatMap(strings)
      : value && typeof value === "object"
        ? Object.values(value).flatMap(strings)
        : [];

describe("product files", () => {
  it.each(PRODUCTS.map((p) => [p.slug, p] as const))(
    "%s lives in the file its correction link points at",
    (slug) => {
      expect(existsSync(path.join(ROOT, productSourcePath(slug)))).toBe(true);
    },
  );

  it("have unique slugs that do not collide with hand-written pages", () => {
    const slugs = PRODUCTS.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    const handWritten = STATUS_QUO_COMPARISONS.map((c) => c.slug);
    for (const slug of templatedCompareSlugs()) {
      expect(handWritten).not.toContain(slug);
    }
  });

  it.each(PRODUCTS.map((p) => [p.slug, p] as const))(
    "%s answers every core feature, with a note in both languages",
    (_, p) => {
      for (const key of CORE_FEATURE_KEYS) {
        const entry = p.features[key];
        expect(entry, key).toBeDefined();
        expect(entry.note.en.length, key).toBeGreaterThan(0);
        expect(entry.note.de.length, key).toBeGreaterThan(0);
      }
      for (const key of Object.keys(p.features)) {
        expect(FEATURES, key).toHaveProperty(key);
      }
    },
  );

  it.each(
    PRODUCTS.filter((p) => p.category !== "licensemeter").map(
      (p) => [p.slug, p] as const,
    ),
  )(
    "%s backs every definite claim with a source and records when it was checked",
    (_, p) => {
      expect(p.checkedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      for (const [key, entry] of Object.entries(p.features)) {
        if (entry.value === "unknown" || entry.value === "unchecked") continue;
        if (p.category === "microsoft" && entry.value === "no") continue;
        expect(entry.source, `${p.slug}.${key}`).toMatch(/^https:\/\//);
      }
    },
  );

  it("give every head-to-head both sides of the short answer", () => {
    for (const p of HEAD_TO_HEAD()) {
      expect(p.pickThemIf.length, p.slug).toBeGreaterThan(0);
      expect(p.pickUsIf.length, p.slug).toBeGreaterThan(0);
      expect(p.strengths.length, p.slug).toBeGreaterThan(0);
    }
    expect(HEAD_TO_HEAD().map((p) => p.slug)).not.toContain("licensemeter");
  });
});

describe("roundup files", () => {
  it.each(ROUNDUPS.map((r) => [r.slug, r] as const))(
    "%s lives in its file and only names known products",
    (slug, r) => {
      expect(existsSync(path.join(ROOT, roundupSourcePath(slug)))).toBe(true);
      const known = PRODUCTS.map((p) => p.slug);
      for (const e of r.entries) expect(known).toContain(e.product);
      if (r.subject) {
        expect(known).toContain(r.subject);
        expect(r.entries.map((e) => e.product)).not.toContain(r.subject);
      }
      const named = r.entries.map((e) => e.product);
      expect(new Set(named).size).toBe(named.length);
      expect(r.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    },
  );
});

describe("published copy", () => {
  it("never uses em dashes", () => {
    const text = strings([PRODUCTS, ROUNDUPS, FEATURES]);
    expect(text.filter((t) => t.includes("—"))).toEqual([]);
  });
});
