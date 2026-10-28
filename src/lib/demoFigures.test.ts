import { describe, expect, it } from "vitest";

import { adobePriceKey, analyzeAdobeWaste } from "~/server/adobe/analyze";
import { DemoAdobeClient } from "~/server/adobe/client";
import { DemoGraphClient } from "~/server/graph/demoGraph";
import { skuDefaultPriceCents } from "~/server/graph/skuCatalog";
import { analyzeSaasWaste } from "~/server/saas/analyze";
import {
  DEMO_SAAS_PRICES,
  demoSaasClient,
  SAAS_PROVIDERS,
} from "~/server/saas/registry";
import { meteringDemo } from "~/server/metering/demo";
import { summarize } from "~/server/metering/summary";
import { joinSignals } from "~/server/sync/join";
import { analyzeWaste, type WasteFinding } from "~/server/waste/engine";
import type { WasteRuleId } from "~/server/types";
import { DEMO_FIGURES } from "./demoFigures";

/* Mirrors the DEMO_ADOBE_PRICES prefill in runSync.ts, which cannot be
 * imported here because it lives next to the db-coupled sync code. */
const ADOBE_PRICES: Record<string, number> = {
  [adobePriceKey("Creative Cloud All Apps")]: 7100,
  [adobePriceKey("Acrobat Pro")]: 2000,
  [adobePriceKey("Photoshop")]: 2400,
};

/** Per-workspace inactivity threshold; the demo tenant keeps the schema default. */
const INACTIVE_DAYS = 90;

/**
 * Recomputes the demo tenant analysis exactly as runSync does for demo
 * workspaces: fixture clients, default price book, joined signals, all three
 * analyzers. No database involved: every input is deterministic.
 */
const recompute = async () => {
  const client = new DemoGraphClient();
  const [orgName, skus, graphUsers, usageRows, copilotRows] = await Promise.all(
    [
      client.getOrganizationName(),
      client.getSubscribedSkus(),
      client.listUsers({ includeSignInActivity: true }),
      client.getActiveUserDetail("D90"),
      client.getCopilotUsage("D90"),
    ],
  );

  const joined = joinSignals({
    graphUsers,
    usageRows,
    copilotRows,
    hasP1: true,
  });
  const prices: Record<string, number> = {
    ...Object.fromEntries(
      skus.map((s) => [s.skuId, skuDefaultPriceCents(s.skuId)]),
    ),
    ...ADOBE_PRICES,
    ...DEMO_SAAS_PRICES,
  };
  const now = new Date();

  const graphFindings = analyzeWaste({
    users: joined.users,
    skus: skus.map((s) => ({
      skuId: s.skuId,
      skuPartNumber: s.skuPartNumber,
      prepaidEnabled: s.prepaidUnits.enabled,
      consumedUnits: s.consumedUnits,
    })),
    prices,
    now,
    activitySignal: joined.activitySignal,
    copilotSignal: joined.copilotSignal,
    usageAggregate: joined.usageAggregate,
    copilotAggregate: joined.copilotAggregate,
    inactiveDays: INACTIVE_DAYS,
  });

  const identities = joined.users.map((u) => ({
    graphId: u.graphId,
    upn: u.upn,
    displayName: u.displayName,
    accountEnabled: u.accountEnabled,
  }));
  const adobeFindings = analyzeAdobeWaste(
    await new DemoAdobeClient().getUsers(),
    identities,
    prices,
  );
  const saasFindings: WasteFinding[] = [];
  for (const provider of SAAS_PROVIDERS) {
    saasFindings.push(
      ...analyzeSaasWaste(
        provider,
        await demoSaasClient(provider).getSeats(),
        identities,
        prices,
        { inactiveDays: INACTIVE_DAYS, now },
      ),
    );
  }

  const findings = graphFindings.concat(adobeFindings, saasFindings);
  const monthlySpendCents = skus.reduce(
    (sum, s) => sum + s.consumedUnits * (prices[s.skuId] ?? 0),
    0,
  );
  return { orgName, users: graphUsers.length, findings, monthlySpendCents };
};

const sumByRules = (findings: WasteFinding[], rules: WasteRuleId[]): number =>
  findings
    .filter((f) => rules.includes(f.rule))
    .reduce((sum, f) => sum + f.monthlyImpactCents, 0);

describe("DEMO_FIGURES matches the recomputed demo tenant analysis", () => {
  it("tenant identity", async () => {
    const { orgName, users } = await recompute();
    expect(orgName).toBe(DEMO_FIGURES.orgName);
    expect(users).toBe(DEMO_FIGURES.users);
  });

  it("totals", async () => {
    const { findings, monthlySpendCents } = await recompute();
    expect(findings.reduce((s, f) => s + f.monthlyImpactCents, 0)).toBe(
      DEMO_FIGURES.monthlyWasteCents,
    );
    expect(monthlySpendCents).toBe(DEMO_FIGURES.monthlySpendCents);
    expect(findings).toHaveLength(DEMO_FIGURES.findingsCount);
  });

  it("offboarding-leak counts", async () => {
    const { findings } = await recompute();
    expect(
      findings.filter((f) => f.rule === "disabled_account_with_license"),
    ).toHaveLength(DEMO_FIGURES.leaverCount);
    const crossVendor = new Set(
      findings
        .filter(
          (f) =>
            f.rule === "adobe_disabled_in_entra" ||
            f.rule === "saas_disabled_in_entra",
        )
        .map((f) => f.graphUserId),
    );
    expect(crossVendor.size).toBe(DEMO_FIGURES.crossVendorLeaverCount);
  });

  it("ledger-card categories cover every finding and sum to the total", async () => {
    const { findings } = await recompute();
    const byCategory = {
      leavers: sumByRules(findings, [
        "disabled_account_with_license",
        "adobe_disabled_in_entra",
        "saas_disabled_in_entra",
      ]),
      orphaned: sumByRules(findings, ["adobe_orphaned", "saas_orphaned"]),
      idle: sumByRules(findings, [
        "inactive_90d",
        "never_active",
        "saas_inactive",
      ]),
      copilotUnused: sumByRules(findings, ["copilot_unused"]),
      shelfware: sumByRules(findings, ["shelfware"]),
      guests: sumByRules(findings, ["licensed_guest"]),
    };
    expect(byCategory).toEqual(DEMO_FIGURES.byCategory);
    expect(Object.values(byCategory).reduce((a, b) => a + b, 0)).toBe(
      DEMO_FIGURES.monthlyWasteCents,
    );
  });

  it("sample Software Metering report at the default 60-day period", () => {
    // Same generator and summary the demo workspace renders, at the period
    // loadMetering falls back to when no metering connection exists.
    const now = new Date("2026-10-27T12:00:00Z");
    const { report, collectors } = meteringDemo(now);
    const summary = summarize(report, collectors, 60, now);
    const metering = DEMO_FIGURES.metering;
    expect(summary.devices).toBe(metering.devices);
    expect(summary.health.reporting).toBe(metering.fullCoverageDevices);
    expect(summary.notStarted).toBe(metering.notStartedPairs);
    expect(
      summary.apps
        .filter((app) => app.entry.programs.length > 0)
        .map((app) => ({
          name: app.entry.name,
          installed: app.installed,
          started: app.started,
          notStarted: app.notStarted,
        })),
    ).toEqual(metering.apps);
    expect(
      summary.apps
        .filter((app) => app.entry.programs.length === 0)
        .map((app) => app.entry.name),
    ).toEqual([metering.unmeteredApp]);
  });
});
