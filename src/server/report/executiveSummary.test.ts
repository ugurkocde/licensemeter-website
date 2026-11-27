import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ExecutiveReportPreview } from "~/components/workspace/ExecutiveReportPreview";
import { buildRenewalPlan, type PlanFinding } from "~/server/renewals/plan";
import type { WasteRuleId } from "~/server/types";
import {
  buildExecutiveSummary,
  executiveTeaserOf,
  MAX_RENEWAL_ROWS,
  MAX_RULE_ROWS,
  type ExecutiveInput,
} from "./executiveSummary";
import { pdfPages, pdfText } from "./pdfText.test-helper";
import { renderExecutiveReportPdf } from "./renderExecutive";

/**
 * The executive report goes to finance and leadership, often forwarded
 * outside IT. It must carry zero user PII: these tests feed findings and a
 * renewal plan full of names, UPNs, emails and user ids, and check that none
 * of them reaches the summary, the preview markup or the rendered PDF.
 */

const NOW = new Date("2026-11-27T10:00:00Z");
const E3 = "05e9a617-0261-4cee-bb44-138d3ef5d965";
const inDays = (days: number) => new Date(NOW.getTime() + days * 86_400_000);

const PII = [
  "Alice Wonderland",
  "alice.wonderland@contoso.example",
  "bob.builder@contoso.example",
  "Bob Builder",
  "carol#EXT#@contoso.onmicrosoft.example",
  "8f2d6c1e-3a4b-4c5d-9e8f-0a1b2c3d4e5f",
  "b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e",
  "+49 170 1234567",
] as const;

/** Findings as the database holds them: titles and details name people. */
const piiFindings = [
  {
    rule: "inactive_90d" as WasteRuleId,
    monthlyImpactCents: 3_600,
    graphUserId: PII[5],
    title: `Inactive for 120 days: ${PII[0]}`,
    detail: { upn: PII[1], displayName: PII[0], mobilePhone: PII[7] },
  },
  {
    rule: "disabled_account_with_license" as WasteRuleId,
    monthlyImpactCents: 3_600,
    graphUserId: PII[6],
    title: `Disabled account still licensed: ${PII[3]}`,
    detail: { upn: PII[2], displayName: PII[3] },
  },
  {
    rule: "licensed_guest" as WasteRuleId,
    monthlyImpactCents: 1_000,
    graphUserId: "guest-1",
    title: `Guest with a license: ${PII[4]}`,
    detail: { upn: PII[4] },
  },
];

const planFindings: PlanFinding[] = piiFindings.map((f) => ({
  rule: f.rule,
  graphUserId: f.graphUserId,
  skuId: null,
  detail: {
    ...f.detail,
    licenses: [{ skuId: E3, name: "Microsoft 365 E3" }],
  },
}));

const plan = buildRenewalPlan({
  skus: [
    {
      skuId: E3,
      skuPartNumber: "SPE_E3",
      displayName: "Microsoft 365 E3",
      prepaidEnabled: 100,
      consumedUnits: 90,
      trialUnits: 0,
      nextLifecycleAt: inDays(40),
    },
  ],
  contracts: [],
  findings: planFindings,
  priceCents: (skuId) => (skuId === E3 ? 3_600 : 0),
  vendorProducts: [],
  terms: new Map(),
  bufferPct: 5,
  usageConcealed: false,
  now: NOW,
});

const input: ExecutiveInput = {
  workspace: "Contoso GmbH",
  currency: "EUR",
  now: NOW,
  monthlySpendCents: 360_000,
  // Extra columns on purpose: the builder must ignore them.
  findings: piiFindings,
  ledger: {
    realizedThisMonth: 7_200,
    runRate: 18_000,
    cumulative: 64_000,
    series: [
      { month: "2026-08", cents: 3_600 },
      { month: "2026-10", cents: 7_200 },
      { month: "2026-11", cents: 7_200 },
    ],
  },
  plan,
  snapshots: [
    { day: "2026-07-31", totalMonthlySpendCents: 1, totalMonthlyWasteCents: 1 },
    {
      day: "2026-09-01",
      totalMonthlySpendCents: 350_000,
      totalMonthlyWasteCents: 9_000,
    },
    {
      day: "2026-09-30",
      totalMonthlySpendCents: 355_000,
      totalMonthlyWasteCents: 8_200,
    },
    {
      day: "2026-11-26",
      totalMonthlySpendCents: 360_000,
      totalMonthlyWasteCents: 8_200,
    },
  ],
};

const expectNoPii = (text: string) => {
  for (const value of PII) expect(text).not.toContain(value);
  // No email address or Entra object id of any kind.
  expect(text).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  expect(text).not.toMatch(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
  );
};

describe("buildExecutiveSummary", () => {
  const summary = buildExecutiveSummary(input);

  it("totals spend, capped waste, the ledger and the renewal window", () => {
    expect(summary.spend).toEqual({
      monthlyCents: 360_000,
      annualCents: 4_320_000,
    });
    expect(summary.waste.monthlyCents).toBe(8_200);
    expect(summary.waste.annualCents).toBe(98_400);
    expect(summary.waste.openFindings).toBe(3);
    expect(summary.waste.byRule.map((r) => r.label)).toEqual([
      "Disabled account still licensed",
      expect.any(String),
      expect.any(String),
    ]);
    expect(summary.savings).toEqual({
      realizedThisMonthCents: 7_200,
      runRateCents: 18_000,
      annualRunRateCents: 216_000,
      cumulativeCents: 64_000,
    });
    expect(summary.renewals.count).toBe(1);
    const [action] = summary.renewals.actions;
    expect(action).toMatchObject({
      label: "Microsoft 365 E3",
      vendor: "Microsoft",
      paidSeats: 100,
      daysUntil: 40,
    });
    expect(action!.cutSeats).toBeGreaterThan(0);
    expect(summary.renewals.annualSavingsCents).toBe(
      action!.annualSavingsCents,
    );
  });

  it("builds a 6-month trend from each month's last snapshot", () => {
    expect(summary.trend.map((p) => p.month)).toEqual([
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
      "2026-10",
      "2026-11",
    ]);
    const sep = summary.trend[3]!;
    expect(sep).toEqual({
      month: "2026-09",
      spendCents: 355_000,
      wasteCents: 8_200,
      realizedCents: 0,
    });
    expect(summary.trend[4]!.wasteCents).toBeNull();
    expect(summary.trend[5]!.realizedCents).toBe(7_200);
  });

  it("leaves out renewals past 90 days and caps the rows that fit on a page", () => {
    const many = {
      ...plan,
      items: Array.from({ length: 9 }, (_, i) => ({
        ...plan.items[0]!,
        key: `sku-${i}`,
        daysUntil: i * 15,
        noticeDaysUntil: i * 15 - 7,
      })),
    };
    const s = buildExecutiveSummary({ ...input, plan: many });
    // Days 0 and 105, 120 are out: notice passed, or beyond the window.
    expect(s.renewals.count).toBe(6);
    expect(s.renewals.actions.map((a) => a.daysUntil)).toEqual([
      15, 30, 45, 60, 75, 90,
    ]);
    const crowded = buildExecutiveSummary({
      ...input,
      plan: { ...plan, items: Array(12).fill(plan.items[0]!) },
    });
    expect(crowded.renewals.count).toBe(12);
    expect(crowded.renewals.actions).toHaveLength(MAX_RENEWAL_ROWS);

    const rules: WasteRuleId[] = [
      "never_active",
      "inactive_90d",
      "shelfware",
      "copilot_unused",
      "licensed_guest",
      "adobe_orphaned",
      "saas_inactive",
      "overlapping_licenses",
      "disabled_account_with_license",
      "saas_orphaned",
    ];
    const r = buildExecutiveSummary({
      ...input,
      findings: rules.map((rule, i) => ({
        rule,
        monthlyImpactCents: (i + 1) * 100,
      })),
    });
    expect(r.waste.byRule).toHaveLength(MAX_RULE_ROWS);
    expect(r.waste.byRule.at(-1)).toEqual({
      label: "Other rules",
      count: 3,
      monthlyCents: 600,
    });
  });

  it("gives Free headline totals only", () => {
    const teaser = executiveTeaserOf(summary);
    expect(teaser.savings).toBeNull();
    expect(teaser.waste.byRule).toEqual([]);
    expect(teaser.renewals.actions).toEqual([]);
    expect(teaser.renewals.count).toBe(1);
    expect(teaser.trend.every((p) => p.realizedCents === null)).toBe(true);
    const markup = renderToStaticMarkup(
      createElement(ExecutiveReportPreview, { summary: teaser, teaser: true }),
    );
    expect(markup).not.toContain("Microsoft 365 E3");
  });
});

describe("executive report privacy", () => {
  const summary = buildExecutiveSummary(input);

  it("keeps user PII out of the summary data", () => {
    // The plan itself read the people to size the cut; the summary must not.
    expect(JSON.stringify(plan)).not.toContain(PII[1]);
    expectNoPii(JSON.stringify(summary));
    expectNoPii(JSON.stringify(executiveTeaserOf(summary)));
  });

  it("keeps user PII out of the live preview", () => {
    const markup = renderToStaticMarkup(
      createElement(ExecutiveReportPreview, { summary }),
    );
    expect(markup).toContain("Microsoft 365 E3");
    expectNoPii(markup);
  });

  it("renders exactly one A4 page without user PII", async () => {
    const pdf = await renderExecutiveReportPdf(summary);
    const text = pdfText(pdf);
    // Positive controls: the extractor reads the page text.
    expect(text).toContain("Executive savings report");
    expect(text).toContain("Contoso GmbH");
    expect(text).toContain("Microsoft 365 E3");
    expectNoPii(text);
    expectNoPii(pdf.toString("latin1"));

    const pages = pdfPages(pdf);
    expect(pages).toHaveLength(1);
    const [width, height] = pages[0]!;
    expect(width).toBeCloseTo(595.28, 1);
    expect(height).toBeCloseTo(841.89, 1);
  });

  it("stays on one page at the row limits, with white-label branding", async () => {
    const long = "Microsoft 365 E5 (no Teams) with a very long contract name";
    const crowded = buildExecutiveSummary({
      ...input,
      plan: {
        ...plan,
        items: Array.from({ length: 12 }, (_, i) => ({
          ...plan.items[0]!,
          key: `sku-${i}`,
          label: `${long} ${i}`,
        })),
      },
      findings: (
        [
          "never_active",
          "inactive_90d",
          "shelfware",
          "copilot_unused",
          "licensed_guest",
          "adobe_orphaned",
          "saas_inactive",
          "overlapping_licenses",
          "disabled_account_with_license",
          "saas_orphaned",
        ] as WasteRuleId[]
      ).map((rule) => ({ rule, monthlyImpactCents: 123_456 })),
    });
    const pdf = await renderExecutiveReportPdf(crowded, {
      name: "Northwind IT",
      color: "#ffe600",
      logo: null,
    });
    expect(pdfPages(pdf)).toHaveLength(1);
    expect(pdfText(pdf)).toContain("Prepared by Northwind IT");
  });
});
