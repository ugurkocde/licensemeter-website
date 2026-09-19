import { describe, expect, it } from "vitest";

import {
  LEAK_RULES,
  leakAlertSubject,
  pickLeakFindings,
  summarizeLeakFindings,
} from "~/server/leakAlerts";
import type { WasteRuleId } from "~/server/types";

const finding = (rule: WasteRuleId) => ({
  id: `id-${rule}`,
  rule,
  title: `t-${rule}`,
  monthlyImpactCents: 100,
});

describe("pickLeakFindings", () => {
  it("returns empty for no inserted findings", () => {
    expect(pickLeakFindings([])).toEqual([]);
  });

  it("keeps exactly the offboarding-leak rule class", () => {
    const leaks: WasteRuleId[] = [
      "disabled_account_with_license",
      "adobe_disabled_in_entra",
      "adobe_orphaned",
      "saas_disabled_in_entra",
      "saas_orphaned",
    ];
    const nonLeaks: WasteRuleId[] = [
      "never_active",
      "inactive_90d",
      "shelfware",
      "copilot_unused",
      "licensed_guest",
      "saas_inactive",
      "overlapping_licenses",
      "service_plans_disabled",
    ];
    const picked = pickLeakFindings(
      [...leaks, ...nonLeaks].map((rule) => finding(rule)),
    );
    expect(picked.map((f) => f.rule).sort()).toEqual([...leaks].sort());
    expect([...LEAK_RULES].sort()).toEqual([...leaks].sort());
  });

  it("preserves the full row shape of what it keeps", () => {
    const leak = finding("saas_orphaned");
    expect(pickLeakFindings([leak, finding("shelfware")])).toEqual([leak]);
  });
});

describe("summarizeLeakFindings", () => {
  it("reconciles all 50 findings even when the first ten are zero", () => {
    const rows = Array.from({ length: 50 }, (_, index) => ({
      title: `Finding ${index}`,
      monthlyImpactCents: index < 10 ? 0 : index === 49 ? 4200 : 4100,
    }));
    // 39 * 4100 + 4200 = 164100 cents, the reported headline.
    const summary = summarizeLeakFindings(rows);
    expect(summary.totalCents).toBe(164100);
    expect(summary.items).toHaveLength(10);
    expect(summary.items.every((row) => row.monthlyImpactCents > 0)).toBe(true);
    expect(summary.items[0]!.monthlyImpactCents).toBe(4200);
    expect(summary.shownCents + summary.omittedCents).toBe(summary.totalCents);
    expect(summary.omittedCount).toBe(40);
    expect(summary.zeroCount).toBe(10);
  });

  it("orders equal costs by title so the mail is stable", () => {
    const summary = summarizeLeakFindings([
      { title: "B", monthlyImpactCents: 500 },
      { title: "A", monthlyImpactCents: 500 },
    ]);
    expect(summary.items.map((row) => row.title)).toEqual(["A", "B"]);
  });

  it("handles zero-cost, fewer than ten, and no findings", () => {
    expect(
      summarizeLeakFindings([
        { title: "A", monthlyImpactCents: 0 },
        { title: "B", monthlyImpactCents: 1234 },
      ]),
    ).toMatchObject({
      totalCents: 1234,
      shownCents: 1234,
      omittedCents: 0,
      omittedCount: 0,
      zeroCount: 1,
    });
    expect(summarizeLeakFindings([])).toMatchObject({
      totalCents: 0,
      count: 0,
      omittedCount: 0,
    });
  });
});

describe("leakAlertSubject", () => {
  it("states an estimate, never a measured increase", () => {
    const subject = leakAlertSubject(50, 164100, "EUR", "Example");
    expect(subject).toContain("50 potential license leaks");
    expect(subject).toContain("estimated");
    expect(subject).not.toContain("+");
    expect(leakAlertSubject(1, 0, "EUR", "Example")).toContain(
      "1 potential license leak detected",
    );
  });
});
