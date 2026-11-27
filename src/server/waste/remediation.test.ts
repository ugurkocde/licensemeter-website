import { describe, expect, it } from "vitest";

import type { findings } from "~/server/db/schema";
import { findingSkuIds, generateRemediationScript } from "./remediation";

type Row = typeof findings.$inferSelect;

const E3 = "05e9a617-0261-4cee-bb44-138d3ef5d965";
const VISIO = "c5928f49-12ba-48f7-ada3-0d743a3601d5";
const EXO = "4b9405b0-7788-4568-add1-99614e613b69";

const row = (overrides: Partial<Row>): Row =>
  ({
    id: "f",
    tenantId: "t",
    dedupeKey: "k",
    rule: "inactive_90d",
    graphUserId: "u",
    skuId: null,
    title: "Inactive: Anna",
    detail: {},
    monthlyImpactCents: 0,
    status: "open",
    ...overrides,
  }) as Row;

const inactive = row({
  detail: {
    upn: "anna@x.example",
    licenses: [
      { skuId: E3, assignedVia: [null] },
      { skuId: VISIO, assignedVia: [null] },
    ],
  },
});
const overlap = row({
  rule: "overlapping_licenses",
  title: "Overlap: Ben",
  detail: {
    upn: "ben@x.example",
    redundantSkuIds: [EXO],
    licenses: [{ skuId: EXO, assignedVia: [null] }],
  },
});
const shelfware = row({
  rule: "shelfware",
  graphUserId: null,
  skuId: VISIO,
  title: "Unassigned Visio",
  detail: { skuPartNumber: "VISIOCLIENT" },
});

describe("findingSkuIds", () => {
  it("reads the SKU column, held licenses and redundant overlap SKUs", () => {
    expect(findingSkuIds(inactive)).toEqual([E3, VISIO]);
    expect(findingSkuIds(overlap)).toEqual([EXO]);
    expect(findingSkuIds(shelfware)).toEqual([VISIO]);
  });
});

describe("generateRemediationScript limited to one SKU", () => {
  it("removes only that SKU and skips findings that do not touch it", () => {
    const script = generateRemediationScript([inactive, overlap, shelfware], {
      skuId: VISIO,
    });
    expect(script).toContain("Limited to one subscription");
    expect(script).toContain(
      `Set-MgUserLicense -UserId 'anna@x.example' -RemoveLicenses @('${VISIO}') -AddLicenses @()`,
    );
    expect(script).not.toContain(E3);
    expect(script).not.toContain("ben@x.example");
    expect(script).toContain("Unassigned Visio");
  });

  it("is unchanged without the option", () => {
    const script = generateRemediationScript([inactive]);
    expect(script).not.toContain("Limited to one subscription");
    expect(script).toContain(`@('${E3}', '${VISIO}')`);
  });
});
