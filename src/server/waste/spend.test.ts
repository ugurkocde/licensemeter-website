import { expect, it } from "vitest";
import { analyzeAdobeWaste } from "~/server/adobe/analyze";
import { analyzeSaasWaste } from "~/server/saas/analyze";
import type { SaasProvider, SaasSeat } from "~/server/types";
import { analyzeWaste, COPILOT_SKU_ID } from "./engine";
import { licenseSpend, priceConfidence } from "./spend";

const now = new Date("2026-10-27T00:00:00Z");
const skuId = "paid-sku";
const sku = {
  skuId,
  skuPartNumber: "PAID",
  prepaidEnabled: 8,
  consumedUnits: 2,
};
const seat = {
  email: "member@example.test",
  status: "active",
  products: ["Standard"],
  displayName: null,
  lastActiveAt: null,
};
const prices = [
  { skuId, monthlyPriceCents: 100, source: "custom" as const },
  {
    skuId: "adobe:Standard",
    monthlyPriceCents: 120,
    source: "default" as const,
  },
  {
    skuId: "salesforce:Standard",
    monthlyPriceCents: 80,
    source: "custom" as const,
  },
];
const priceMap = Object.fromEntries(
  prices.map((p) => [p.skuId, p.monthlyPriceCents]),
);
const saas = new Map<SaasProvider, SaasSeat[]>([
  ["salesforce", [seat]],
  ["chatgpt", [seat]],
]);

it("counts idle purchases in the same spend used for waste share", () => {
  const spend = licenseSpend(
    { skus: [sku], adobe: [], saas: new Map() },
    prices,
  );
  const waste = analyzeWaste({
    users: [],
    skus: [sku],
    now,
    prices: priceMap,
    activitySignal: "none",
    copilotSignal: "none",
  });
  expect(spend.totalCents).toBe(800);
  expect(waste[0]!.monthlyImpactCents / spend.totalCents).toBe(0.75);
});

it("combines paid and active provider seats and counts zero prices by seat", () => {
  const spend = licenseSpend(
    { skus: [sku], adobe: [seat, { ...seat, status: "inactive" }], saas },
    prices,
  );
  const directory = [
    {
      graphId: "id",
      upn: seat.email,
      accountEnabled: false,
      displayName: null,
    },
  ];
  const waste = [
    ...analyzeAdobeWaste([seat], directory, priceMap),
    ...analyzeSaasWaste("salesforce", [seat], directory, priceMap, {
      now,
      inactiveDays: 90,
    }),
  ];
  expect(
    waste.reduce((sum, f) => sum + f.monthlyImpactCents, 0) + 600,
  ).toBeLessThanOrEqual(spend.totalCents);
  expect(spend.totalCents).toBe(1000);
  expect(priceConfidence(spend)).toEqual({
    customPercent: 82,
    estimatePercent: 9,
    unpricedPercent: 9,
  });
  expect(
    priceConfidence(
      licenseSpend({ skus: [sku], adobe: [], saas: new Map() }, []),
    ),
  ).toEqual({
    customPercent: 0,
    estimatePercent: 0,
    unpricedPercent: 100,
  });
});

it("never prices more waste than paid spend across purchase, assignment and trial counts", () => {
  for (let i = 0; i < 250; i++) {
    const prepaidEnabled = i % 17;
    const consumedUnits = (i * 7) % 21;
    const trialUnits = (i * 3) % 13;
    const skus = [
      {
        ...sku,
        skuId: COPILOT_SKU_ID,
        prepaidEnabled,
        consumedUnits,
        trialUnits,
      },
    ];
    const users = Array.from({ length: (i * 11) % 27 }, (_, j) => ({
      graphId: `user-${j}`,
      upn: `user-${j}@example.test`,
      displayName: null,
      accountEnabled: j % 3 > 0,
      userType: "Member",
      createdDateTime: null,
      lastActivity: now,
      copilotLastActivity: null,
      licenses: [null, "group"].map((assignedByGroup) => ({
        skuId: COPILOT_SKU_ID,
        assignedByGroup,
        state: "Active",
        disabledPlans: [],
      })),
    }));
    const findings = analyzeWaste({
      users,
      skus,
      now,
      prices: { [COPILOT_SKU_ID]: 101 },
      activitySignal: "full",
      copilotSignal: i % 2 ? "per-user" : "aggregate",
      copilotAggregate: { inactiveCount: i % 25, totalCount: 25 },
    });
    expect(
      findings.reduce((sum, f) => sum + f.monthlyImpactCents, 0),
    ).toBeLessThanOrEqual(
      licenseSpend({ skus, adobe: [], saas: new Map() }, [
        { skuId: COPILOT_SKU_ID, monthlyPriceCents: 101 },
      ]).totalCents,
    );
  }
});

it("weights a catalog seat by list price even when the entered price is zero", () => {
  const e3 = "05e9a617-0261-4cee-bb44-138d3ef5d965";
  const spend = licenseSpend(
    {
      skus: [{ ...sku, skuId: e3, skuPartNumber: "SPE_E3", prepaidEnabled: 1 }],
      adobe: [seat],
      saas: new Map(),
    },
    [
      { skuId: e3, source: "custom", monthlyPriceCents: 0 },
      { skuId: "adobe:Standard", source: "default", monthlyPriceCents: 367 },
    ],
  );
  expect(priceConfidence(spend)).toEqual({
    customPercent: 0,
    estimatePercent: 9,
    unpricedPercent: 91,
  });
});
