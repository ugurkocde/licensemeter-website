import { describe, expect, it } from "vitest";

import type { SkuTermSetting } from "~/lib/renewalTerm";
import {
  buildRenewalPlan,
  clampBuffer,
  nextRenewalAction,
  reclaimableBySku,
  recommendedSeatsOf,
  sizeLines,
  teaserOf,
  type PlanContract,
  type PlanFinding,
  type PlanInput,
  type PlanLine,
  type PlanSku,
  type PlanVendorProduct,
} from "./plan";

const NOW = new Date("2027-01-10T09:00:00Z");
const E3 = "05e9a617-0261-4cee-bb44-138d3ef5d965";
const COPILOT = "639dec6b-bb19-468b-871c-c5c441c4b0cb";
const VISIO = "c5928f49-12ba-48f7-ada3-0d743a3601d5";
/** FLOW_FREE: a known free SKU that must never be planned. */
const FLOW_FREE = "f30db892-07e9-47e9-837c-80727f46fd3d";

const sku = (overrides: Partial<PlanSku> = {}): PlanSku => ({
  skuId: E3,
  skuPartNumber: "SPE_E3",
  displayName: "Microsoft 365 E3",
  prepaidEnabled: 100,
  consumedUnits: 90,
  trialUnits: 0,
  nextLifecycleAt: new Date("2027-03-01T00:00:00Z"),
  ...overrides,
});

const userFinding = (
  rule: PlanFinding["rule"],
  user: string,
  skuIds: string[],
): PlanFinding => ({
  rule,
  graphUserId: user,
  skuId: null,
  detail: {
    upn: `${user}@contoso.example`,
    licenses: skuIds.map((skuId) => ({ skuId })),
  },
});

const input = (overrides: Partial<PlanInput> = {}): PlanInput => ({
  skus: [sku()],
  contracts: [],
  findings: [],
  priceCents: () => 3_360,
  vendorProducts: [],
  terms: new Map(),
  bufferPct: 5,
  usageConcealed: false,
  now: NOW,
  ...overrides,
});

const only = (overrides: Partial<PlanInput> = {}) => {
  const plan = buildRenewalPlan(input(overrides));
  expect(plan.items).toHaveLength(1);
  return plan.items[0]!;
};

describe("recommendedSeatsOf", () => {
  it("adds the buffer and rounds up so headroom never rounds away", () => {
    expect(recommendedSeatsOf(100, 5)).toBe(105);
    expect(recommendedSeatsOf(10, 5)).toBe(11);
    expect(recommendedSeatsOf(1, 0)).toBe(1);
    expect(recommendedSeatsOf(0, 50)).toBe(0);
  });

  it("clamps the buffer to 0..50 and falls back on non-integers", () => {
    expect(clampBuffer(-3)).toBe(0);
    expect(clampBuffer(80)).toBe(50);
    expect(clampBuffer(2.5)).toBe(5);
    expect(recommendedSeatsOf(100, 500)).toBe(150);
  });
});

describe("Microsoft subscription rows", () => {
  it("cuts unassigned and reclaimable seats down to active plus buffer", () => {
    const item = only({
      findings: [
        userFinding("inactive_90d", "u1", [E3]),
        userFinding("never_active", "u2", [E3]),
        userFinding("disabled_account_with_license", "u3", [E3, VISIO]),
      ],
    });
    expect(item).toMatchObject({
      key: `sku-${E3}`,
      kind: "subscription",
      vendor: "Microsoft",
      paidSeats: 100,
      unassignedSeats: 10,
      reclaimableSeats: 3,
      activeSeats: 87,
      recommendedSeats: 92,
      cutSeats: 8,
      annualSavingsCents: 8 * 3_360 * 12,
      renewalDate: "2027-03-01",
      noticeDate: "2027-02-22",
      daysUntil: 50,
      noticeDaysUntil: 43,
      trialOnly: false,
      estimate: false,
    });
  });

  it("counts a person flagged by several rules once per SKU", () => {
    const item = only({
      findings: [
        userFinding("inactive_90d", "u1", [E3]),
        userFinding("never_active", "u1", [E3]),
        {
          ...userFinding("overlapping_licenses", "u1", []),
          detail: { redundantSkuIds: [E3] },
        },
      ],
    });
    expect(item.reclaimableSeats).toBe(1);
  });

  it("ignores shelfware and plan-hint findings as reclaimable people", () => {
    const item = only({
      findings: [
        {
          rule: "shelfware",
          graphUserId: null,
          skuId: E3,
          detail: { unassigned: 10 },
        },
        {
          rule: "service_plans_disabled",
          graphUserId: null,
          skuId: E3,
          detail: { aggregate: true },
        },
      ],
    });
    expect(item.reclaimableSeats).toBe(0);
    expect(item.estimate).toBe(false);
  });

  it("never reclaims more seats than are assigned", () => {
    const item = only({
      skus: [sku({ prepaidEnabled: 5, consumedUnits: 1 })],
      findings: [
        userFinding("inactive_90d", "u1", [E3]),
        userFinding("inactive_90d", "u2", [E3]),
      ],
    });
    expect(item.reclaimableSeats).toBe(1);
    expect(item.activeSeats).toBe(0);
    expect(item.cutSeats).toBe(5);
  });

  it("clamps the cut to zero for an over-assigned SKU", () => {
    const item = only({
      skus: [sku({ prepaidEnabled: 50, consumedUnits: 60 })],
    });
    expect(item.unassignedSeats).toBe(0);
    expect(item.activeSeats).toBe(60);
    expect(item.cutSeats).toBe(0);
    expect(item.recommendedSeats).toBe(50);
    expect(item.annualSavingsCents).toBeNull();
  });

  it("never claims savings for a trial-only SKU", () => {
    const item = only({
      skus: [sku({ prepaidEnabled: 25, trialUnits: 25, consumedUnits: 3 })],
    });
    expect(item.trialOnly).toBe(true);
    expect(item.paidSeats).toBe(0);
    expect(item.cutSeats).toBe(0);
    expect(item.annualSavingsCents).toBeNull();
    expect(
      buildRenewalPlan(
        input({
          skus: [sku({ prepaidEnabled: 25, trialUnits: 25, consumedUnits: 3 })],
        }),
      ).summary,
    ).toMatchObject({ actionable: 0, annualSavingsCents: 0 });
  });

  it("plans only the paid seats of a SKU with some trial seats", () => {
    const item = only({
      skus: [sku({ prepaidEnabled: 30, trialUnits: 10, consumedUnits: 5 })],
    });
    expect(item.trialOnly).toBe(false);
    expect(item.paidSeats).toBe(20);
    expect(item.cutSeats).toBe(20 - recommendedSeatsOf(5, 5));
  });

  it("shows the seat reduction for an unpriced SKU without claiming money", () => {
    const item = only({ priceCents: () => 0 });
    expect(item.cutSeats).toBe(5);
    expect(item.annualSavingsCents).toBeNull();
    expect(item.unpricedCutSeats).toBe(5);
    const plan = buildRenewalPlan(input({ priceCents: () => 0 }));
    expect(plan.summary).toMatchObject({
      cutSeats: 5,
      annualSavingsCents: 0,
      unpricedCutSeats: 5,
    });
  });

  it("marks the plan as a conservative estimate when usage is concealed", () => {
    expect(only({ usageConcealed: true }).estimate).toBe(true);
    expect(
      only({
        findings: [
          {
            rule: "inactive_90d",
            graphUserId: null,
            skuId: null,
            detail: { aggregate: true },
          },
        ],
      }).estimate,
    ).toBe(true);
    const copilot = buildRenewalPlan(
      input({
        skus: [
          sku(),
          sku({
            skuId: COPILOT,
            skuPartNumber: "Microsoft_365_Copilot",
            displayName: "Copilot",
          }),
        ],
        findings: [
          {
            rule: "copilot_unused",
            graphUserId: null,
            skuId: COPILOT,
            detail: { aggregate: true },
          },
        ],
      }),
    );
    expect(copilot.items.find((i) => i.skuIds[0] === COPILOT)?.estimate).toBe(
      true,
    );
    expect(copilot.items.find((i) => i.skuIds[0] === E3)?.estimate).toBe(false);
  });

  it("skips free SKUs, past renewals and SKUs without a date", () => {
    const plan = buildRenewalPlan(
      input({
        skus: [
          sku({ skuId: FLOW_FREE, skuPartNumber: "FLOW_FREE" }),
          sku({
            skuId: VISIO,
            nextLifecycleAt: new Date("2027-01-09T00:00:00Z"),
          }),
          sku({ skuId: COPILOT, nextLifecycleAt: null }),
        ],
      }),
    );
    expect(plan.items).toEqual([]);
  });

  it("keeps a renewal due today and moves a passed decision date to today", () => {
    const item = only({
      skus: [sku({ nextLifecycleAt: new Date("2027-01-12T00:00:00Z") })],
    });
    expect(item.daysUntil).toBe(2);
    expect(item.noticeDate).toBe("2027-01-10");
    expect(item.noticeDaysUntil).toBe(0);
  });

  it("carries the stored billing term and the monthly alert opt-in", () => {
    const terms = new Map<string, SkuTermSetting>([
      [E3, { term: "monthly", monthlyAlerts: false }],
    ]);
    expect(only({ terms })).toMatchObject({
      term: "monthly",
      monthlyAlerts: false,
      alertsApply: false,
    });
    terms.set(E3, { term: "monthly", monthlyAlerts: true });
    expect(only({ terms })).toMatchObject({
      term: "monthly",
      alertsApply: true,
    });
    expect(only()).toMatchObject({ term: "annual", alertsApply: true });
  });
});

describe("contracts", () => {
  const contract = (overrides: Partial<PlanContract> = {}): PlanContract => ({
    id: "8c1f4b6e-0000-4000-8000-000000000001",
    vendor: "Microsoft",
    contractName: "Enterprise Agreement",
    renewalDate: "2027-04-01",
    noticeDays: 30,
    skuIds: [],
    targetSeats: null,
    ...overrides,
  });

  it("plans linked SKUs under the contract and never twice", () => {
    const plan = buildRenewalPlan(
      input({
        skus: [
          sku(),
          sku({
            skuId: VISIO,
            skuPartNumber: "VISIOCLIENT",
            displayName: "Visio",
            prepaidEnabled: 10,
            consumedUnits: 2,
          }),
        ],
        contracts: [contract({ skuIds: [E3, VISIO, E3] })],
      }),
    );
    expect(plan.items).toHaveLength(1);
    const item = plan.items[0]!;
    expect(item).toMatchObject({
      key: `contract-${contract().id}`,
      kind: "contract",
      skuIds: [E3, VISIO],
      renewalDate: "2027-04-01",
      noticeDate: "2027-03-02",
      paidSeats: 110,
      cutSeats: 5 + (10 - recommendedSeatsOf(2, 5)),
    });
    expect(item.lines).toHaveLength(2);
  });

  it("shows an auto SKU row again once its contract has passed", () => {
    const plan = buildRenewalPlan(
      input({
        contracts: [contract({ skuIds: [E3], renewalDate: "2027-01-01" })],
      }),
    );
    expect(plan.items.map((i) => i.kind)).toEqual(["subscription"]);
  });

  it("uses the target seats and prices the cut at the average seat", () => {
    const item = only({
      skus: [
        sku(),
        sku({
          skuId: VISIO,
          skuPartNumber: "VISIOCLIENT",
          prepaidEnabled: 20,
          consumedUnits: 20,
        }),
      ],
      priceCents: (id) => (id === E3 ? 3_000 : 1_500),
      contracts: [contract({ skuIds: [E3, VISIO], targetSeats: 90 })],
    });
    expect(item.targetSet).toBe(true);
    expect(item.recommendedSeats).toBe(90);
    expect(item.cutSeats).toBe(30);
    const average = (100 * 3_000 + 20 * 1_500) / 120;
    expect(item.annualSavingsCents).toBe(Math.round(30 * average * 12));
  });

  it("clamps a target above paid seats to no cut", () => {
    const item = only({
      contracts: [contract({ skuIds: [E3], targetSeats: 150 })],
    });
    expect(item.cutSeats).toBe(0);
    expect(item.annualSavingsCents).toBeNull();
  });

  it("does not value a target cut when a linked SKU has no price", () => {
    const item = only({
      skus: [
        sku(),
        sku({ skuId: VISIO, skuPartNumber: "VISIOCLIENT", prepaidEnabled: 10 }),
      ],
      priceCents: (id) => (id === E3 ? 3_000 : 0),
      contracts: [contract({ skuIds: [E3, VISIO], targetSeats: 100 })],
    });
    expect(item.cutSeats).toBe(10);
    expect(item.annualSavingsCents).toBeNull();
    expect(item.unpricedCutSeats).toBe(10);
  });

  it("plans a non-Microsoft contract from connector seats and findings", () => {
    const products: PlanVendorProduct[] = [
      {
        key: "adobe:Creative Cloud All Apps",
        vendor: "Adobe",
        product: "Creative Cloud All Apps",
        seats: 20,
        priceCents: 8_000,
      },
      {
        key: "adobe:Acrobat Pro",
        vendor: "Adobe",
        product: "Acrobat Pro",
        seats: 10,
        priceCents: 0,
      },
      {
        key: "zoom:Pro",
        vendor: "Zoom",
        product: "Pro",
        seats: 50,
        priceCents: 1_500,
      },
    ];
    const adobe = (
      email: string,
      list: string[],
      rule: PlanFinding["rule"] = "adobe_orphaned",
    ): PlanFinding => ({
      rule,
      graphUserId: null,
      skuId: null,
      detail: { upn: email, products: list, adobe: true },
    });
    const item = only({
      skus: [],
      vendorProducts: products,
      findings: [
        adobe("A@x.example", ["Creative Cloud All Apps", "Acrobat Pro"]),
        adobe(
          "a@x.example",
          ["Creative Cloud All Apps"],
          "adobe_disabled_in_entra",
        ),
        adobe("b@x.example", ["Creative Cloud All Apps"]),
        adobe("c@x.example", ["Acrobat Pro"]),
      ],
      contracts: [
        contract({ vendor: "Adobe", contractName: "Creative Cloud for teams" }),
      ],
    });
    expect(
      item.lines.map((l) => [l.name, l.paidSeats, l.reclaimableSeats]),
    ).toEqual([
      ["Creative Cloud All Apps", 20, 2],
      ["Acrobat Pro", 10, 2],
    ]);
    const cc = 20 - recommendedSeatsOf(18, 5);
    const acrobat = 10 - recommendedSeatsOf(8, 5);
    expect(item.cutSeats).toBe(cc + acrobat);
    expect(item.annualSavingsCents).toBe(cc * 8_000 * 12);
    expect(item.unpricedCutSeats).toBe(acrobat);
    expect(item.unassignedSeats).toBe(0);
    expect(item.estimate).toBe(false);
  });

  it("plans a SKU once when two upcoming contracts link it", () => {
    const plan = buildRenewalPlan(
      input({
        contracts: [
          contract({ id: "b", renewalDate: "2027-09-01", skuIds: [E3] }),
          contract({ id: "a", renewalDate: "2027-04-01", skuIds: [E3] }),
        ],
      }),
    );
    expect(plan.items.map((i) => i.key)).toEqual(["contract-a"]);
    expect(plan.summary.cutSeats).toBe(5);
    expect(plan.unsizedContracts).toBe(1);
  });

  it("plans another vendor's products once across two contracts", () => {
    const plan = buildRenewalPlan(
      input({
        skus: [],
        vendorProducts: [
          {
            key: "adobe:CC",
            vendor: "Adobe",
            product: "CC",
            seats: 20,
            priceCents: 8_000,
          },
        ],
        contracts: [
          contract({ id: "a", vendor: "Adobe", renewalDate: "2027-03-01" }),
          contract({ id: "b", vendor: "Adobe", renewalDate: "2027-09-01" }),
        ],
      }),
    );
    expect(plan.items).toHaveLength(1);
    expect(plan.summary.cutSeats).toBe(plan.items[0]!.cutSeats);
    expect(plan.unsizedContracts).toBe(1);
  });

  it("keeps trial-only lines out of a paid contract's figures", () => {
    const item = only({
      skus: [
        sku({ prepaidEnabled: 100, consumedUnits: 90 }),
        sku({
          skuId: COPILOT,
          prepaidEnabled: 25,
          trialUnits: 25,
          consumedUnits: 20,
        }),
      ],
      findings: [userFinding("inactive_90d", "u1", [COPILOT])],
      contracts: [contract({ skuIds: [E3, COPILOT] })],
    });
    expect(item).toMatchObject({
      trialOnly: false,
      paidSeats: 100,
      reclaimableSeats: 0,
      activeSeats: 90,
      recommendedSeats: 95,
      cutSeats: 5,
    });
  });

  it("does not call a contract with only expired seats a trial", () => {
    const plan = buildRenewalPlan(
      input({
        skus: [sku({ prepaidEnabled: 0, consumedUnits: 2 })],
        contracts: [contract({ skuIds: [E3] })],
      }),
    );
    expect(plan.items).toEqual([]);
    expect(plan.unsizedContracts).toBe(1);
  });

  it("counts contracts it cannot size instead of inventing seats", () => {
    const plan = buildRenewalPlan(
      input({
        skus: [],
        contracts: [contract(), contract({ id: "x", vendor: "Salesforce" })],
      }),
    );
    expect(plan.items).toEqual([]);
    expect(plan.unsizedContracts).toBe(2);
  });

  it("never treats a Microsoft contract without linked SKUs as covering everything", () => {
    const plan = buildRenewalPlan(input({ contracts: [contract()] }));
    expect(plan.items.map((i) => i.kind)).toEqual(["subscription"]);
    expect(plan.unsizedContracts).toBe(1);
  });
});

describe("sizeLines", () => {
  const line = (overrides: Partial<PlanLine>): PlanLine => ({
    id: "l",
    name: "Line",
    paidSeats: 10,
    unassignedSeats: 0,
    reclaimableSeats: 0,
    activeSeats: 10,
    monthlyPriceCents: 1_000,
    trialOnly: false,
    ...overrides,
  });

  it("cuts each line on its own so over-assignment never offsets idle seats", () => {
    const sized = sizeLines(
      [line({ activeSeats: 20 }), line({ activeSeats: 0 })],
      0,
      null,
    );
    expect(sized.cutSeats).toBe(10);
    expect(sized.annualSavingsCents).toBe(10 * 1_000 * 12);
  });
});

describe("summary, teaser and the overview action", () => {
  const twoRenewals = () =>
    buildRenewalPlan(
      input({
        skus: [
          sku({ nextLifecycleAt: new Date("2027-06-01T00:00:00Z") }),
          sku({
            skuId: VISIO,
            skuPartNumber: "VISIOCLIENT",
            displayName: "Visio",
            prepaidEnabled: 10,
            consumedUnits: 0,
            nextLifecycleAt: new Date("2027-02-01T00:00:00Z"),
          }),
          sku({
            skuId: COPILOT,
            prepaidEnabled: 5,
            consumedUnits: 5,
            nextLifecycleAt: new Date("2027-01-20T00:00:00Z"),
          }),
        ],
        usageConcealed: true,
      }),
    );

  it("sorts by date and totals only renewals with seats to cut", () => {
    const plan = twoRenewals();
    expect(plan.items.map((i) => i.renewalDate)).toEqual([
      "2027-01-20",
      "2027-02-01",
      "2027-06-01",
    ]);
    expect(plan.summary).toMatchObject({
      renewals: 3,
      actionable: 2,
      cutSeats: 15,
      annualSavingsCents: 15 * 3_360 * 12,
      estimate: true,
    });
    expect(plan.summary.next?.skuIds).toEqual([VISIO]);
  });

  it("gives Free real totals without naming any SKU or contract", () => {
    const teaser = teaserOf(twoRenewals());
    expect(teaser).toEqual({
      actionable: 2,
      cutSeats: 15,
      annualSavingsCents: 15 * 3_360 * 12,
      unpricedCutSeats: 0,
      estimate: true,
      nextDaysUntil: 22,
    });
    const json = JSON.stringify(teaser);
    expect(json).not.toMatch(/Visio|E3|VISIOCLIENT|sku-/);
  });

  it("surfaces the earliest renewal within 90 days that has a cut", () => {
    const plan = twoRenewals();
    expect(nextRenewalAction(plan)?.skuIds).toEqual([VISIO]);
    expect(nextRenewalAction(plan, 10)).toBeNull();
    const far = buildRenewalPlan(
      input({
        skus: [sku({ nextLifecycleAt: new Date("2027-06-01T00:00:00Z") })],
      }),
    );
    expect(nextRenewalAction(far)).toBeNull();
  });
});

describe("reclaimableBySku", () => {
  it("reads per-user Copilot findings by their SKU and skips other vendors", () => {
    const { people } = reclaimableBySku([
      { rule: "copilot_unused", graphUserId: "u1", skuId: COPILOT, detail: {} },
      {
        rule: "saas_inactive",
        graphUserId: "u2",
        skuId: null,
        detail: { provider: "zoom", licenses: [{ skuId: E3 }] },
      },
      {
        rule: "inactive_90d",
        graphUserId: "u3",
        skuId: null,
        detail: { licenses: [E3, 7, null] },
      },
    ]);
    expect(people.get(COPILOT)?.size).toBe(1);
    expect(people.get(E3)?.size).toBe(1);
  });
});
