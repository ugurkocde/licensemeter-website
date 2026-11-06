import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { CONNECTOR_GUIDES } from "~/lib/connectorGuides";
import { SUPPORTED_CURRENCIES } from "~/lib/currency";

import {
  editFileUrl,
  sourceFileUrl,
  STATUS_QUO_COMPARISONS,
  statusQuoSourcePath,
} from ".";
import { LICENSEMETER_CLAIMS, listJoin } from "./licensemeter";

const ROOT = path.resolve(__dirname, "../../..");

const allText = (value: unknown): string[] =>
  typeof value === "string"
    ? [value]
    : Array.isArray(value)
      ? value.flatMap(allText)
      : value && typeof value === "object"
        ? Object.values(value).flatMap(allText)
        : [];

describe("status-quo comparisons", () => {
  it.each(STATUS_QUO_COMPARISONS.map((c) => [c.slug, c] as const))(
    "%s has a route and the data file the correction note links to",
    (slug) => {
      expect(
        existsSync(
          path.join(ROOT, "src/app/(marketing)/compare", slug, "page.tsx"),
        ),
      ).toBe(true);
      expect(existsSync(path.join(ROOT, statusQuoSourcePath(slug)))).toBe(true);
    },
  );

  it("keeps dimensions unique within a table", () => {
    for (const c of STATUS_QUO_COMPARISONS) {
      const dims = c.rows.map((r) => r.dimension);
      expect(new Set(dims).size).toBe(dims.length);
    }
  });

  it("never uses em dashes in published copy", () => {
    const text = allText([STATUS_QUO_COMPARISONS, LICENSEMETER_CLAIMS]);
    expect(text.filter((t) => t.includes("—"))).toEqual([]);
  });
});

describe("LicenseMeter claims", () => {
  it("names every non-Microsoft connector the app ships", () => {
    for (const guide of CONNECTOR_GUIDES.filter(
      (g) => g.slug !== "microsoft",
    )) {
      expect(LICENSEMETER_CLAIMS.beyondMicrosoft).toContain(guide.name);
    }
  });

  it("counts every supported currency", () => {
    expect(LICENSEMETER_CLAIMS.costFigures).toContain(
      `and ${SUPPORTED_CURRENCIES.length - 3} more`,
    );
  });

  it("joins lists in prose", () => {
    expect(listJoin(["A"])).toBe("A");
    expect(listJoin(["A", "B", "C"])).toBe("A, B and C");
    expect(listJoin(["A", "B"], "und")).toBe("A und B");
  });
});

describe("source links", () => {
  it("point at the public repository", () => {
    expect(sourceFileUrl("src/x.ts")).toBe(
      "https://github.com/ugurkocde/licensemeter-website/blob/main/src/x.ts",
    );
    expect(editFileUrl("src/x.ts")).toBe(
      "https://github.com/ugurkocde/licensemeter-website/edit/main/src/x.ts",
    );
  });
});
