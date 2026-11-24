import { expect, it } from "vitest";
import { resolutionOf } from "./resolution";

const now = new Date("2026-10-27T00:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);
const skuId = "product";
const license = {
  skuId,
  assignedByGroup: null,
  state: "Active",
  disabledPlans: [],
};
const member = {
  graphId: "member",
  upn: "member@example.test",
  displayName: null,
  accountEnabled: true,
  lastActivity: daysAgo(100),
  copilotLastActivity: null,
  licenses: [license],
};
const finding = {
  rule: "inactive_90d" as const,
  graphUserId: member.graphId,
  skuId: null,
  monthlyImpactCents: 200,
  detail: {
    licenses: [{ skuId, monthlyPriceCents: 200 }],
    inactiveThreshold: 90,
    lastActivity: member.lastActivity.toISOString(),
  },
};
const shelfware = {
  rule: "shelfware" as const,
  graphUserId: null,
  skuId,
  monthlyImpactCents: 400,
  detail: { purchased: 10, assigned: 8, unassigned: 2, unitPriceCents: 200 },
};
const sku = {
  skuId,
  skuPartNumber: "PRODUCT",
  prepaidEnabled: 10,
  consumedUnits: 8,
};
const classify = (
  overrides: Partial<Parameters<typeof resolutionOf>[0]> = {},
) =>
  resolutionOf({
    users: [member],
    skus: [sku],
    now,
    adobe: [],
    saas: new Map(),
    prices: { [skuId]: 200 },
    exclusions: [],
    inactiveDays: 90,
    verifiedSources: new Set(["microsoft"]),
    ...overrides,
  });

it("records removal when the user is gone or no longer holds the SKU", () => {
  for (const users of [[], [{ ...member, licenses: [] }]]) {
    expect(classify({ users })(finding)).toEqual({
      reason: "license_removed",
      monthlyCents: 200,
      skuId,
    });
  }
});
it("caps a purchased reduction at the previously flagged seats", () => {
  expect(
    classify({ skus: [{ ...sku, prepaidEnabled: 5 }] })(shelfware),
  ).toEqual({
    reason: "seats_reduced",
    monthlyCents: 400,
    skuId,
  });
  expect(
    classify({ skus: [{ ...sku, prepaidEnabled: 9, consumedUnits: 9 }] })(
      shelfware,
    ),
  ).toMatchObject({ monthlyCents: 200 });
});
it("recognizes exclusions", () => {
  expect(classify({ exclusions: [member.upn] })(finding).reason).toBe(
    "excluded",
  );
});
it("recognizes a threshold change with unchanged activity", () => {
  expect(classify({ inactiveDays: 110 })(finding).reason).toBe(
    "threshold_changed",
  );
});
it("recognizes resumed activity and re-enabled accounts", () => {
  expect(
    classify({ users: [{ ...member, lastActivity: daysAgo(15) }] })(finding)
      .reason,
  ).toBe("activity_resumed");
  expect(
    classify()({ ...finding, rule: "disabled_account_with_license" }).reason,
  ).toBe("activity_resumed");
});
it("recognizes assigned idle seats", () => {
  expect(
    classify({ skus: [{ ...sku, consumedUnits: 10 }] })(shelfware).reason,
  ).toBe("seats_assigned");
});
it("prefers a disconnected source over an apparent removal", () => {
  expect(
    classify({ users: [], removedSources: ["microsoft"] })(finding).reason,
  ).toBe("source_removed");
});
it("recognizes a vanished finding whose only available change is an explicit zero price", () => {
  expect(classify({ prices: { [skuId]: 0 } })(finding).reason).toBe(
    "price_changed",
  );
});
it("records unknown resolutions as other, including an unverified source", () => {
  expect(
    classify({ users: [], verifiedSources: new Set() })(finding).reason,
  ).toBe("other");
});
