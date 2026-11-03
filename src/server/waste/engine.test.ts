import { describe, expect, it } from "vitest";

import type { UserLicense } from "~/server/types";
import {
  analyzeWaste,
  COPILOT_SKU_ID,
  isShelfwareExempt,
  purchasedSeatsOf,
  spendSeatsOf,
  unpricedSkuCount,
  type WasteInput,
  type WasteUser,
} from "./engine";

const NOW = new Date("2026-06-11T00:00:00Z");
const E3 = "05e9a617-0261-4cee-bb44-138d3ef5d965";
const PRICES = { [E3]: 3670, [COPILOT_SKU_ID]: 2810 };

const lic = (
  skuId: string,
  assignedByGroup: string | null = null,
): UserLicense => ({
  skuId,
  assignedByGroup,
  disabledPlans: [],
  state: "Active",
});

const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

const user = (overrides: Partial<WasteUser>): WasteUser => ({
  graphId: "u-1",
  upn: "user@example.com",
  displayName: "Test User",
  accountEnabled: true,
  userType: "Member",
  createdDateTime: daysAgo(400),
  lastActivity: daysAgo(2),
  copilotLastActivity: null,
  licenses: [lic(E3)],
  ...overrides,
});

const run = (overrides: Partial<WasteInput>) =>
  analyzeWaste({
    users: [],
    skus: [],
    prices: PRICES,
    now: NOW,
    activitySignal: "full",
    copilotSignal: "per-user",
    ...overrides,
  });

describe("disabled_account_with_license", () => {
  it("flags disabled accounts and sums all license prices", () => {
    const findings = run({
      users: [
        user({
          accountEnabled: false,
          licenses: [lic(E3), lic(COPILOT_SKU_ID)],
        }),
      ],
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.rule).toBe("disabled_account_with_license");
    expect(findings[0]!.monthlyImpactCents).toBe(3670 + 2810);
  });

  it("does not double-flag a disabled user via inactivity or copilot rules", () => {
    const findings = run({
      users: [
        user({
          accountEnabled: false,
          lastActivity: daysAgo(200),
          licenses: [lic(COPILOT_SKU_ID)],
        }),
      ],
    });
    expect(findings.map((f) => f.rule)).toEqual([
      "disabled_account_with_license",
    ]);
  });

  it("ignores unlicensed disabled accounts", () => {
    expect(
      run({ users: [user({ accountEnabled: false, licenses: [] })] }),
    ).toHaveLength(0);
  });
});

describe("licensed_guest", () => {
  it("flags enabled guests with licenses", () => {
    const findings = run({ users: [user({ userType: "Guest" })] });
    expect(findings.map((f) => f.rule)).toEqual(["licensed_guest"]);
    expect(findings[0]!.monthlyImpactCents).toBe(3670);
  });

  it("reports a disabled guest only as a disabled account", () => {
    const findings = run({
      users: [user({ userType: "Guest", accountEnabled: false })],
    });
    expect(findings.map((f) => f.rule)).toEqual([
      "disabled_account_with_license",
    ]);
  });
});

describe("never_active", () => {
  it("flags licensed users with no activity after the grace period", () => {
    const findings = run({
      users: [user({ lastActivity: null, createdDateTime: daysAgo(45) })],
    });
    expect(findings.map((f) => f.rule)).toEqual(["never_active"]);
  });

  it("grants new accounts a 30-day grace period", () => {
    expect(
      run({
        users: [user({ lastActivity: null, createdDateTime: daysAgo(10) })],
      }),
    ).toHaveLength(0);
  });

  it("flags users without a creation date who never became active", () => {
    const findings = run({
      users: [user({ lastActivity: null, createdDateTime: null })],
    });
    expect(findings.map((f) => f.rule)).toEqual(["never_active"]);
  });
});

describe("inactive_90d", () => {
  it("flags users inactive for more than 90 days", () => {
    const findings = run({ users: [user({ lastActivity: daysAgo(91) })] });
    expect(findings.map((f) => f.rule)).toEqual(["inactive_90d"]);
    expect(findings[0]!.detail.inactiveDays).toBe(91);
  });

  it("does not flag at exactly 90 days or below", () => {
    expect(run({ users: [user({ lastActivity: daysAgo(90) })] })).toHaveLength(
      0,
    );
    expect(run({ users: [user({ lastActivity: daysAgo(89) })] })).toHaveLength(
      0,
    );
  });

  it("skips per-user inactivity rules without an activity signal", () => {
    const findings = run({
      activitySignal: "none",
      users: [
        user({ lastActivity: null, createdDateTime: daysAgo(100) }),
        user({ graphId: "u-2", lastActivity: daysAgo(200) }),
      ],
    });
    expect(findings).toHaveLength(0);
  });

  it("emits an aggregate finding when identities are concealed", () => {
    const findings = run({
      activitySignal: "none",
      usageAggregate: { inactiveCount: 7, totalCount: 100 },
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.rule).toBe("inactive_90d");
    expect(findings[0]!.graphUserId).toBeNull();
    expect(findings[0]!.monthlyImpactCents).toBe(0);
  });
});

describe("copilot_unused", () => {
  it("flags copilot seats with no usage", () => {
    const findings = run({
      users: [user({ licenses: [lic(E3), lic(COPILOT_SKU_ID)] })],
    });
    expect(findings.map((f) => f.rule)).toEqual(["copilot_unused"]);
    expect(findings[0]!.monthlyImpactCents).toBe(2810);
  });

  it("flags stale copilot usage but not recent usage", () => {
    const stale = run({
      users: [
        user({
          licenses: [lic(COPILOT_SKU_ID)],
          copilotLastActivity: daysAgo(70),
        }),
      ],
    });
    expect(stale.map((f) => f.rule)).toEqual(["copilot_unused"]);

    const recent = run({
      users: [
        user({
          licenses: [lic(COPILOT_SKU_ID)],
          copilotLastActivity: daysAgo(20),
        }),
      ],
    });
    expect(recent).toHaveLength(0);
  });

  it("computes aggregate copilot impact when identities are concealed", () => {
    const findings = run({
      copilotSignal: "aggregate",
      copilotAggregate: { inactiveCount: 5, totalCount: 25 },
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.monthlyImpactCents).toBe(5 * 2810);
  });
});

describe("overlapping_licenses", () => {
  const EXO_P1 = "4b9405b0-7788-4568-add1-99614e613b69";
  const E5 = "06ebc4ee-1bb5-47dd-8120-11324bc54e06";
  const PBI = "f8a1db68-be16-40ed-86d5-cb42ce701560";

  it("prices the redundant standalone next to a suite", () => {
    const findings = run({
      prices: { ...PRICES, [EXO_P1]: 370 },
      users: [user({ licenses: [lic(E3), lic(EXO_P1)] })],
    });
    expect(findings.map((f) => f.rule)).toEqual(["overlapping_licenses"]);
    expect(findings[0]!.monthlyImpactCents).toBe(370);
  });

  it("collects multiple redundant SKUs under one finding", () => {
    const findings = run({
      prices: { [E5]: 5750, [EXO_P1]: 370, [PBI]: 1310 },
      users: [user({ licenses: [lic(E5), lic(EXO_P1), lic(PBI)] })],
    });
    const overlap = findings.find((f) => f.rule === "overlapping_licenses")!;
    expect(overlap.monthlyImpactCents).toBe(370 + 1310);
  });

  it("does not fire without an overlap", () => {
    const findings = run({ users: [user({ licenses: [lic(E3)] })] });
    expect(
      findings.filter((f) => f.rule === "overlapping_licenses"),
    ).toHaveLength(0);
  });

  it("skips users already flagged by inactivity rules", () => {
    const EXO = "4b9405b0-7788-4568-add1-99614e613b69";
    const findings = run({
      users: [
        user({ licenses: [lic(E3), lic(EXO)], lastActivity: daysAgo(200) }),
      ],
    });
    expect(findings.map((f) => f.rule)).toEqual(["inactive_90d"]);
  });
});

describe("service_plans_disabled", () => {
  it("aggregates suites with disabled plans, impact zero", () => {
    const findings = run({
      users: [
        user({
          licenses: [
            {
              skuId: E3,
              assignedByGroup: null,
              disabledPlans: ["a", "b"],
              state: "Active",
            },
          ],
        }),
        user({
          graphId: "u-2",
          licenses: [
            {
              skuId: E3,
              assignedByGroup: null,
              disabledPlans: ["a"],
              state: "Active",
            },
          ],
        }),
      ],
    });
    const agg = findings.filter((f) => f.rule === "service_plans_disabled");
    expect(agg).toHaveLength(1);
    expect(agg[0]!.detail.usersWithDisabledPlans).toBe(2);
    expect(agg[0]!.monthlyImpactCents).toBe(0);
  });
});

describe("configurable inactivity threshold", () => {
  it("uses the workspace threshold instead of the default", () => {
    const at40 = run({
      inactiveDays: 30,
      users: [user({ lastActivity: daysAgo(40) })],
    });
    expect(at40.map((f) => f.rule)).toEqual(["inactive_90d"]);

    const default40 = run({ users: [user({ lastActivity: daysAgo(40) })] });
    expect(default40).toHaveLength(0);
  });
});

describe("shelfware", () => {
  it("prices unassigned seats per SKU", () => {
    const findings = run({
      skus: [
        {
          skuId: E3,
          skuPartNumber: "SPE_E3",
          prepaidEnabled: 100,
          consumedUnits: 90,
        },
      ],
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.rule).toBe("shelfware");
    expect(findings[0]!.monthlyImpactCents).toBe(10 * 3670);
  });

  it("ignores free, viral and capacity-style SKUs", () => {
    const findings = run({
      skus: [
        {
          skuId: "win-store",
          skuPartNumber: "WINDOWS_STORE",
          prepaidEnabled: 1_000_000,
          consumedUnits: 0,
        },
        {
          skuId: "flow-free",
          skuPartNumber: "FLOW_FREE",
          prepaidEnabled: 10_000,
          consumedUnits: 1,
        },
        {
          skuId: "capacity-sku",
          skuPartNumber: "SOME_FUTURE_CAPACITY_SKU",
          prepaidEnabled: 50_000,
          consumedUnits: 3,
        },
      ],
    });
    expect(findings).toHaveLength(0);
  });

  it("is silent when every seat is assigned", () => {
    expect(
      run({
        skus: [
          {
            skuId: E3,
            skuPartNumber: "SPE_E3",
            prepaidEnabled: 50,
            consumedUnits: 50,
          },
        ],
      }),
    ).toHaveLength(0);
  });
});

describe("purchasedSeatsOf", () => {
  it("excludes free/viral/capacity SKUs (real tenant: 26 paid seats)", () => {
    // The five subscribedSkus a live 25-user tenant actually reports. The naive
    // sum is 1,010,026; only DEVELOPERPACK_E5 (25) + EMS (1) are real seats.
    const seats = purchasedSeatsOf([
      { skuPartNumber: "Microsoft_Intune_Suite", prepaidEnabled: 0 },
      { skuPartNumber: "WINDOWS_STORE", prepaidEnabled: 1_000_000 },
      { skuPartNumber: "FLOW_FREE", prepaidEnabled: 10_000 },
      { skuPartNumber: "DEVELOPERPACK_E5", prepaidEnabled: 25 },
      { skuPartNumber: "EMS", prepaidEnabled: 1 },
    ]);
    expect(seats).toBe(26);
  });

  it("drops capacity-style allotments at or above the threshold", () => {
    expect(
      purchasedSeatsOf([
        { skuPartNumber: "SPE_E5", prepaidEnabled: 100 },
        { skuPartNumber: "SOME_FUTURE_CAPACITY_SKU", prepaidEnabled: 50_000 },
      ]),
    ).toBe(100);
  });

  it("is zero for an empty tenant", () => {
    expect(purchasedSeatsOf([])).toBe(0);
  });
});

describe("isShelfwareExempt (dashboard license inventory filter)", () => {
  it("hides Microsoft's free/viral/capacity sentinels", () => {
    expect(isShelfwareExempt("WINDOWS_STORE", 1_000_000)).toBe(true);
    expect(isShelfwareExempt("FLOW_FREE", 10_000)).toBe(true);
  });

  it("keeps real purchased SKUs (the rows worth showing)", () => {
    // Same live 25-user tenant: EMS, Developerpack E5 and the over-assigned
    // Intune Suite are real licenses and stay in the inventory table.
    expect(isShelfwareExempt("EMS", 1)).toBe(false);
    expect(isShelfwareExempt("DEVELOPERPACK_E5", 25)).toBe(false);
    expect(isShelfwareExempt("Microsoft_Intune_Suite", 0)).toBe(false);
  });

  it("treats any 5,000+ seat allotment as capacity plumbing", () => {
    expect(isShelfwareExempt("SOME_FUTURE_CAPACITY_SKU", 5_000)).toBe(true);
    expect(isShelfwareExempt("SOME_FUTURE_CAPACITY_SKU", 4_999)).toBe(false);
  });
});

const PHONE_RESOURCE = "440eaaa8-b3e0-484b-a8be-62870b9ba70a"; // free, catalog
const ROOMS_BASIC = "6af4b3d6-14bb-4a2a-960c-6c902aad34f3"; // free, catalog
const UNKNOWN_SKU = "00000000-0000-0000-0000-00000000abcd";

describe("users holding only known-free licenses", () => {
  const cases: [string, Partial<WasteUser>][] = [
    ["disabled", { accountEnabled: false }],
    ["never active", { lastActivity: null }],
    ["inactive", { lastActivity: daysAgo(200) }],
    ["guest", { userType: "Guest" }],
  ];

  it.each(cases)("get no finding when %s", (_label, overrides) => {
    const findings = run({
      users: [
        user({
          ...overrides,
          licenses: [lic(PHONE_RESOURCE), lic(ROOMS_BASIC)],
        }),
      ],
    });
    expect(findings).toEqual([]);
  });

  it("recognises free SKUs outside the catalog by their part number", () => {
    const viral = "11111111-2222-3333-4444-555555555555";
    const findings = run({
      users: [user({ accountEnabled: false, licenses: [lic(viral)] })],
      skus: [
        {
          skuId: viral,
          skuPartNumber: "Dynamics_365_Sales_Premium_Viral_Trial",
          prepaidEnabled: 10_000,
          consumedUnits: 1,
        },
      ],
    });
    expect(findings).toEqual([]);
  });

  it("still flags a user whose other license is unknown-priced", () => {
    const findings = run({
      users: [
        user({
          accountEnabled: false,
          licenses: [lic(PHONE_RESOURCE), lic(UNKNOWN_SKU)],
        }),
      ],
    });
    expect(findings.map((f) => f.rule)).toEqual([
      "disabled_account_with_license",
    ]);
    // Unknown price is 0 until entered; the price notice covers the gap.
    expect(findings[0]!.monthlyImpactCents).toBe(0);
  });

  it("still flags a user with a paid license next to a free one", () => {
    const findings = run({
      users: [
        user({
          lastActivity: null,
          licenses: [lic(PHONE_RESOURCE), lic(E3)],
        }),
      ],
    });
    expect(findings.map((f) => f.rule)).toEqual(["never_active"]);
    expect(findings[0]!.monthlyImpactCents).toBe(3670);
  });
});

describe("admin exclusions", () => {
  const disabled = (graphId: string, upn: string, displayName: string) =>
    user({ graphId, upn, displayName, accountEnabled: false });

  it("skips matching accounts by upn or display name, case-insensitively", () => {
    const findings = run({
      exclusions: ["SVC-*", "*@rooms.contoso.com", "*_queue*"],
      users: [
        disabled("u-1", "svc-backup@contoso.com", "Backup service"),
        disabled("u-2", "board@ROOMS.contoso.com", "Board room"),
        disabled("u-3", "callflow@contoso.com", "Sales_Queue_EU"),
        disabled("u-4", "alex@contoso.com", "Alex Wilber"),
      ],
    });
    expect(findings.map((f) => f.graphUserId)).toEqual(["u-4"]);
  });

  it("treats a pattern without * as an exact match", () => {
    const findings = run({
      exclusions: ["alex@contoso.com"],
      users: [
        disabled("u-1", "alex@contoso.com", "Alex"),
        disabled("u-2", "alex@contoso.com.example", "Alex Two"),
      ],
    });
    expect(findings.map((f) => f.graphUserId)).toEqual(["u-2"]);
  });

  it("covers every per-user rule, not only inactivity", () => {
    const findings = run({
      exclusions: ["user@*"],
      users: [
        user({ licenses: [lic(COPILOT_SKU_ID)], copilotLastActivity: null }),
      ],
    });
    expect(findings).toEqual([]);
  });
});

describe("trial seats", () => {
  const sku = (
    prepaidEnabled: number,
    consumedUnits: number,
    trialUnits = 0,
  ) => ({
    skuId: E3,
    skuPartNumber: "SPE_E3",
    prepaidEnabled,
    consumedUnits,
    trialUnits,
  });

  it("prices only idle paid seats as shelfware", () => {
    const findings = run({ skus: [sku(125, 90, 25)] });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.detail).toMatchObject({
      purchased: 100,
      trialSeats: 25,
      unassigned: 10,
    });
    expect(findings[0]!.monthlyImpactCents).toBe(10 * 3670);
  });

  it("yields no shelfware for a SKU that is fully on trial", () => {
    expect(run({ skus: [sku(25, 0, 25)] })).toEqual([]);
  });

  it("does not count trial seats as purchased", () => {
    expect(
      purchasedSeatsOf([
        { skuPartNumber: "SPE_E3", prepaidEnabled: 125, trialUnits: 25 },
      ]),
    ).toBe(100);
  });

  it("does not count assignments on trial seats as spend", () => {
    expect(spendSeatsOf(sku(125, 110, 25))).toBe(100);
    expect(spendSeatsOf(sku(25, 20, 25))).toBe(0);
    // Without trials an over-assigned SKU keeps Microsoft's consumed count.
    expect(spendSeatsOf(sku(10, 12))).toBe(12);
  });
});

describe("service_plans_disabled downgrade hint", () => {
  const TEAMS = "57ff2da0-773e-42df-b2af-ffb7a2317929";
  const EXCHANGE = "efb87545-963c-4e0d-99df-69c6916d9eb0";
  const SWAY = "a23b959c-7ce8-4e57-9140-b90eb88a9e97";
  const UNNAMED = "99999999-0000-0000-0000-000000000001";
  const withPlans = (graphId: string, disabledPlans: string[]) =>
    user({
      graphId,
      licenses: [
        { skuId: E3, assignedByGroup: null, disabledPlans, state: "Active" },
      ],
    });

  it("names the three plans disabled for the most users", () => {
    const findings = run({
      users: [
        withPlans("u-1", [TEAMS, EXCHANGE, SWAY, UNNAMED]),
        withPlans("u-2", [TEAMS, EXCHANGE, SWAY]),
        withPlans("u-3", [TEAMS, SWAY]),
        withPlans("u-4", [TEAMS]),
      ],
    });
    const [agg] = findings.filter((f) => f.rule === "service_plans_disabled");
    expect(agg!.dedupeKey).toBe(`service_plans_disabled|aggregate|${E3}`);
    expect(agg!.title).toBe(
      "4 users have service plans disabled on Microsoft 365 E3 (most often Microsoft Teams, Sway, Exchange Online (Plan 2))",
    );
    expect(agg!.detail.topDisabledPlans).toEqual([
      { planId: TEAMS, name: "Microsoft Teams", users: 4 },
      { planId: SWAY, name: "Sway", users: 3 },
      { planId: EXCHANGE, name: "Exchange Online (Plan 2)", users: 2 },
    ]);
    expect(agg!.detail.hint).toContain("a smaller SKU may fit");
    expect(agg!.monthlyImpactCents).toBe(0);
  });

  it("falls back to the plan id when no friendly name is known", () => {
    const [agg] = run({ users: [withPlans("u-1", [UNNAMED])] }).filter(
      (f) => f.rule === "service_plans_disabled",
    );
    expect(agg!.detail.topDisabledPlans).toEqual([
      { planId: UNNAMED, name: UNNAMED, users: 1 },
    ]);
  });
});

describe("assigned trial licenses", () => {
  const e3 = (
    prepaidEnabled: number,
    consumedUnits: number,
    trialUnits = 0,
  ) => ({
    skuId: E3,
    skuPartNumber: "SPE_E3",
    prepaidEnabled,
    consumedUnits,
    trialUnits,
  });
  const copilot = (consumedUnits: number, trialUnits: number) => ({
    skuId: COPILOT_SKU_ID,
    skuPartNumber: "Microsoft_365_Copilot",
    prepaidEnabled: 25,
    consumedUnits,
    trialUnits,
  });
  const disabledE3 = user({ accountEnabled: false });

  it("prices a disabled user on a trial-only SKU at 0", () => {
    const [finding] = run({ users: [disabledE3], skus: [e3(25, 1, 25)] });
    expect(finding!.rule).toBe("disabled_account_with_license");
    expect(finding!.monthlyImpactCents).toBe(0);
    expect(finding!.detail.licenses).toEqual([
      expect.objectContaining({ skuId: E3, monthlyPriceCents: 0 }),
    ]);
  });

  it("prices trial-only Copilot at 0, per user and in aggregate", () => {
    const perUser = run({
      users: [user({ licenses: [lic(COPILOT_SKU_ID)] })],
      skus: [copilot(10, 25)],
    });
    expect(perUser.map((f) => [f.rule, f.monthlyImpactCents])).toEqual([
      ["copilot_unused", 0],
    ]);
    const aggregate = run({
      copilotSignal: "aggregate",
      copilotAggregate: { inactiveCount: 4, totalCount: 10 },
      skus: [copilot(10, 25)],
    });
    expect(aggregate[0]!.monthlyImpactCents).toBe(0);
  });

  it("spreads the paid spend of a mixed SKU over every assignment", () => {
    // 100 paid + 25 trial seats, 110 assigned: 100 payable of 110.
    const users = Array.from({ length: 110 }, (_, i) =>
      user({ graphId: `u-${i}`, accountEnabled: false }),
    );
    const findings = run({ users, skus: [e3(125, 110, 25)] });
    const each = Math.floor((3670 * 100) / 110);
    expect(findings).toHaveLength(110);
    expect(new Set(findings.map((f) => f.monthlyImpactCents))).toEqual(
      new Set([each]),
    );
    const total = findings.reduce((sum, f) => sum + f.monthlyImpactCents, 0);
    expect(total).toBeLessThanOrEqual(100 * 3670);
  });

  it("prices overlapping trial licenses at their assignment price", () => {
    const EXCHANGE_P1 = "4b9405b0-7788-4568-add1-99614e613b69";
    const [finding] = run({
      prices: { ...PRICES, [EXCHANGE_P1]: 370 },
      users: [user({ licenses: [lic(E3), lic(EXCHANGE_P1)] })],
      skus: [
        {
          skuId: EXCHANGE_P1,
          skuPartNumber: "EXCHANGESTANDARD",
          prepaidEnabled: 5,
          consumedUnits: 1,
          trialUnits: 5,
        },
      ],
    });
    expect(finding!.rule).toBe("overlapping_licenses");
    expect(finding!.monthlyImpactCents).toBe(0);
  });

  it("leaves SKUs without trial seats exactly as before", () => {
    const users = [
      disabledE3,
      user({ graphId: "u-2", licenses: [lic(COPILOT_SKU_ID)] }),
    ];
    const withSkus = run({
      users,
      skus: [e3(10, 12), { ...copilot(5, 0), prepaidEnabled: 5 }],
    });
    const without = run({ users });
    expect(withSkus.map((f) => f.monthlyImpactCents)).toEqual([3670, 2810]);
    expect(without.map((f) => f.monthlyImpactCents)).toEqual([3670, 2810]);
  });
});

describe("over-assigned trial SKUs", () => {
  const seats = (
    prepaidEnabled: number,
    consumedUnits: number,
    trialUnits = 0,
  ) => ({
    skuId: E3,
    skuPartNumber: "SPE_E3",
    prepaidEnabled,
    consumedUnits,
    trialUnits,
  });

  it("never invents paid spend on a trial-only SKU", () => {
    expect(spendSeatsOf(seats(25, 30, 25))).toBe(0);
    expect(purchasedSeatsOf([seats(25, 30, 25)])).toBe(0);
    expect(
      unpricedSkuCount(
        [
          {
            ...seats(25, 30, 25),
            skuId: "unknown",
            skuPartNumber: "NEW_ADDON",
          },
        ],
        () => 0,
      ),
    ).toBe(0);
    expect(run({ skus: [seats(25, 30, 25)] })).toEqual([]);
  });

  it("caps a mixed SKU's spend at its paid seats", () => {
    expect(spendSeatsOf(seats(125, 140, 25))).toBe(100);
    expect(spendSeatsOf(seats(125, 60, 25))).toBe(60);
  });

  it("keeps Microsoft's consumed count when there are no trial seats", () => {
    expect(spendSeatsOf(seats(10, 12))).toBe(12);
    expect(spendSeatsOf(seats(10, 8))).toBe(8);
  });
});
