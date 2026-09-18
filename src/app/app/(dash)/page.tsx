import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";

import { ButtonAnchor, ButtonLink, Card } from "~/components/ui";
import { FindingChip } from "~/components/workspace/FindingChip";
import { InventoryTable } from "~/components/workspace/InventoryTable";
import {
  MetricCards,
  type BreakdownRow,
  type MetricCardData,
} from "~/components/workspace/MetricCards";
import { OnboardingEmptyState } from "~/components/workspace/OnboardingEmptyState";
import { PriceAccuracyCard } from "~/components/workspace/PriceAccuracyCard";
import { SyncNowButton } from "~/components/workspace/SyncNowButton";
import { TrendChart } from "~/components/workspace/TrendChart";
import { Tour } from "~/components/workspace/Tour";
import {
  dataTourSteps,
  welcomeTourSteps,
} from "~/components/workspace/tourSteps";
import { fmtAgo, fmtDate, fmtMoney, fmtNumber } from "~/lib/format";
import { calculatePriceCoverage } from "~/lib/priceCoverage";
import { ALL_RULES, RULE_META } from "~/lib/rules";
import type { WasteRuleId } from "~/server/types";
import { requireAccess, hasRole } from "~/server/access";
import { db } from "~/server/db";
import { workspaceHasConnectorOrData } from "~/server/workspaceState";
import { daysUntilDate } from "~/server/digestDelta";
import { isShelfwareExempt } from "~/server/waste/engine";
import {
  findings,
  priceBook,
  snapshots,
  syncRuns,
  tenantSkus,
  tenantUsers,
  vendorRenewals,
} from "~/server/db/schema";

export const metadata: Metadata = { title: "Overview" };

export default async function OverviewPage() {
  const ctx = await requireAccess("viewer");
  const tenantId = ctx.tenant.id;

  // Workspace-first onboarding: a workspace that has connected no service yet
  // lands on the dashboard but sees the onboarding empty state (nudge to connect
  // a first service) instead of a dashboard of zeros. Demo always has data.
  const hasConnectorOrData =
    ctx.tenant.isDemo || (await workspaceHasConnectorOrData(tenantId));
  if (!hasConnectorOrData) {
    return (
      <>
        <OnboardingEmptyState />
        {ctx.membership.welcomeTourAt === null && (
          <Tour
            phase="welcome"
            storageId={ctx.membership.id}
            steps={welcomeTourSteps}
            finalButtonLabel="Got it"
          />
        )}
      </>
    );
  }
  const currency = ctx.tenant.currency;
  // CSV/scan imports never get syncRuns rows; their freshness signal is the
  // import time on the user snapshots.
  const isImported = !ctx.tenant.consentedAt && !ctx.tenant.isDemo;

  const openFindingsWhere = and(
    eq(findings.tenantId, tenantId),
    inArray(findings.status, ["open", "acknowledged"]),
  );

  const [
    skus,
    prices,
    topFindings,
    ruleAgg,
    lastRun,
    importedUser,
    historyDesc,
    resolvedSavings,
    upcomingRenewals,
  ] = await Promise.all([
    db.query.tenantSkus.findMany({ where: eq(tenantSkus.tenantId, tenantId) }),
    db.query.priceBook.findMany({ where: eq(priceBook.tenantId, tenantId) }),
    // Only the rows the dashboard actually renders ("Largest open findings").
    // Headline figures come from the grouped aggregate below, so a large
    // tenant never streams every finding row into the page.
    db.query.findings.findMany({
      where: openFindingsWhere,
      orderBy: desc(findings.monthlyImpactCents),
      limit: 6,
    }),
    // Per-rule count + impact, summed in Postgres. Drives the metric cards
    // and every breakdown table without loading individual finding rows.
    db
      .select({
        rule: findings.rule,
        count: sql<number>`count(*)::int`,
        cents: sql<number>`coalesce(sum(${findings.monthlyImpactCents}), 0)::int`,
      })
      .from(findings)
      .where(openFindingsWhere)
      .groupBy(findings.rule),
    db.query.syncRuns.findFirst({
      where: eq(syncRuns.tenantId, tenantId),
      orderBy: desc(syncRuns.startedAt),
    }),
    isImported
      ? db.query.tenantUsers.findFirst({
          where: eq(tenantUsers.tenantId, tenantId),
          orderBy: desc(tenantUsers.syncedAt),
        })
      : Promise.resolve(undefined),
    // Newest 90 days, reversed below into ascending order for the chart.
    // Ascending with a limit would pin the window to the oldest days ever
    // collected.
    db.query.snapshots.findMany({
      where: eq(snapshots.tenantId, tenantId),
      orderBy: desc(snapshots.day),
      limit: 90,
    }),
    db
      .select({
        count: sql<number>`count(*)::int`,
        cents: sql<number>`coalesce(sum(${findings.monthlyImpactCents}), 0)::int`,
      })
      .from(findings)
      .where(
        and(
          eq(findings.tenantId, tenantId),
          eq(findings.status, "resolved"),
          gte(findings.resolvedAt, new Date(Date.now() - 30 * 86_400_000)),
        ),
      )
      .then((rows) => rows[0] ?? { count: 0, cents: 0 }),
    db.query.vendorRenewals.findMany({
      where: and(
        eq(vendorRenewals.tenantId, tenantId),
        gte(vendorRenewals.renewalDate, new Date().toISOString().slice(0, 10)),
      ),
      orderBy: asc(vendorRenewals.renewalDate),
      limit: 3,
    }),
  ]);

  const history = [...historyDesc].reverse();

  const priceBySku = new Map(prices.map((p) => [p.skuId, p.monthlyPriceCents]));

  // Real, purchased SKUs only. Microsoft auto-provisions free/viral/capacity
  // sentinels (WINDOWS_STORE's 1,000,000 prepaid units, FLOW_FREE, etc.) into
  // every tenant; they carry no cost and only add noise. Excluding them here
  // (the same exemption the waste engine and seat-tier gate already use) keeps
  // the spend total, the assigned-seat count and the inventory table all
  // reconciled to one set of SKUs.
  const realSkus = skus.filter(
    (s) => !isShelfwareExempt(s.skuPartNumber, s.prepaidEnabled),
  );

  const monthlySpend = realSkus.reduce(
    (sum, s) => sum + s.consumedUnits * (priceBySku.get(s.skuId) ?? 0),
    0,
  );
  const monthlyWaste = ruleAgg.reduce((sum, r) => sum + r.cents, 0);
  const wasteShare = monthlySpend > 0 ? (monthlyWaste / monthlySpend) * 100 : 0;

  // Inventory rows for the dashboard table, sorted client-side (default: spend
  // descending). Pre-shaped here so the client component stays serializable.
  const inventoryRows = realSkus.map((s) => ({
    skuId: s.skuId,
    name: s.displayName ?? s.skuPartNumber,
    partNumber: s.skuPartNumber,
    purchased: s.prepaidEnabled,
    assigned: s.consumedUnits,
    spendCents: s.consumedUnits * (priceBySku.get(s.skuId) ?? 0),
  }));

  const priceRowsBySku = new Map(prices.map((p) => [p.skuId, p]));
  const priceCoverage = calculatePriceCoverage(
    realSkus.map((s) => {
      const price = priceRowsBySku.get(s.skuId);
      return {
        seats: s.consumedUnits,
        priceCents: price?.monthlyPriceCents ?? 0,
        source: price?.source,
      };
    }),
  );

  const nextRenewal = upcomingRenewals[0] ?? null;
  const renewalDays = daysUntilDate(
    nextRenewal?.renewalDate ?? null,
    new Date(),
  );
  const noticeDaysUntil =
    renewalDays === null ? null : renewalDays - (nextRenewal?.noticeDays ?? 0);
  const openCount = ruleAgg.reduce((sum, r) => sum + r.count, 0);

  // A partial sync finished but some steps degraded to warnings/failures (e.g.
  // a usage report was unavailable). Surface the count so admins know figures
  // may be incomplete without digging into the sync log.
  const degradedSteps =
    lastRun?.steps.filter(
      (s) => s.status === "warning" || s.status === "failed",
    ).length ?? 0;

  // Imported workspaces have no sync button, so do not tell them to run one.
  const emptyInventory = isImported
    ? "No license data yet. Upload a fresh export to update this workspace."
    : "No license data yet. Run a sync.";

  // Drill-down rows for each metric card. Each breakdown is derived from the
  // exact same inputs as the headline figure, so the rows always sum to the
  // number on the card.
  const assignedSeats = realSkus.reduce((s, x) => s + x.consumedUnits, 0);

  // Spend by product: zero-cost SKUs (free/viral sentinels) drop out, leaving
  // only rows that actually contribute to monthly spend.
  const spendRows: BreakdownRow[] = realSkus
    .map((s) => ({
      sku: s,
      price: priceBySku.get(s.skuId) ?? 0,
      cents: s.consumedUnits * (priceBySku.get(s.skuId) ?? 0),
    }))
    .filter((r) => r.cents > 0)
    .sort((a, b) => b.cents - a.cents)
    .map((r) => ({
      label: r.sku.displayName ?? r.sku.skuPartNumber,
      sub: `${fmtNumber(r.sku.consumedUnits, currency)} × ${fmtMoney(
        r.price,
        currency,
      )}`,
      value: fmtMoney(r.cents, currency),
    }));

  // Findings grouped by rule, the shared basis for the waste, annualized-waste
  // and open-findings breakdowns.
  const byRule = new Map<WasteRuleId, { count: number; cents: number }>();
  for (const r of ruleAgg) {
    byRule.set(r.rule, { count: r.count, cents: r.cents });
  }
  const ruleEntries = [...byRule.entries()].sort(
    (a, b) => b[1].cents - a[1].cents || b[1].count - a[1].count,
  );
  const ruleLabel = (r: WasteRuleId) => RULE_META[r]?.label ?? r;

  const wasteRows: BreakdownRow[] = ruleEntries.map(([rule, agg]) => ({
    label: ruleLabel(rule),
    sub: `${fmtNumber(agg.count, currency)} ${agg.count === 1 ? "finding" : "findings"}`,
    value: fmtMoney(agg.cents, currency),
    tone: agg.cents > 0 ? "waste" : "ink",
  }));
  const annualRows: BreakdownRow[] = ruleEntries.map(([rule, agg]) => ({
    label: ruleLabel(rule),
    sub: `${fmtMoney(agg.cents, currency)}/mo × 12`,
    value: fmtMoney(agg.cents * 12, currency),
    tone: agg.cents > 0 ? "waste" : "ink",
  }));
  const findingRows: BreakdownRow[] = ruleEntries.map(([rule, agg]) => ({
    label: ruleLabel(rule),
    sub: agg.cents > 0 ? `${fmtMoney(agg.cents, currency)}/mo` : undefined,
    value: fmtNumber(agg.count, currency),
  }));

  const listPriceFootnote = !priceCoverage.complete
    ? `${priceCoverage.customProducts} of ${priceCoverage.totalProducts} product prices use contract values; remaining figures are estimates or unpriced.`
    : undefined;

  const metricCards: MetricCardData[] = [
    {
      key: "spend",
      label: "Monthly license spend",
      value: fmtMoney(monthlySpend, currency),
      sub: `${fmtNumber(assignedSeats, currency)} assigned seats`,
      tone: "ink",
      explainer:
        "Assigned seats × the monthly price of each product, summed across your license inventory.",
      detail: {
        formula:
          "For every product we multiply the seats assigned to people by that product's monthly price, then add them up.",
        source:
          "Seat counts come from your latest sync; prices come from your price book (your custom price, or the Microsoft list price as a fallback).",
        columns: ["Product (seats × price)", "Spend / mo"],
        rows: spendRows,
        totalLabel: "Total monthly spend",
        totalValue: fmtMoney(monthlySpend, currency),
        emptyText: "No priced license data yet.",
      },
    },
    {
      key: "waste",
      label: "Monthly waste",
      value: fmtMoney(monthlyWaste, currency),
      sub: `${wasteShare.toFixed(1)}% of spend`,
      tone: "waste",
      note: !priceCoverage.complete ? (
        <>
          Estimated at list prices.{" "}
          <Link
            href="/app/licenses"
            className="hover:text-ink underline underline-offset-4"
          >
            Set your actual prices
          </Link>
        </>
      ) : null,
      explainer:
        "The monthly cost of every open finding added together. This is the spend you could reclaim.",
      detail: {
        formula:
          "Each open or acknowledged finding carries the monthly cost of the wasted seat. Monthly waste is the sum of those costs, grouped here by the rule that flagged them.",
        source:
          "Findings are raised during sync by the detection rules; resolved findings are excluded. Costs reuse the same prices as monthly spend.",
        columns: ["Rule", "Impact / mo"],
        rows: wasteRows,
        totalLabel: "Total monthly waste",
        totalValue: fmtMoney(monthlyWaste, currency),
        emptyText: "No open findings, nothing flagged as waste.",
        footnote: listPriceFootnote,
      },
    },
    {
      key: "annual",
      label: "Annualized waste",
      value: fmtMoney(monthlyWaste * 12, currency),
      sub: "if nothing changes",
      tone: "waste",
      explainer:
        "Monthly waste projected over a full year: monthly waste × 12.",
      detail: {
        formula:
          "Monthly waste × 12 months. A projection of what the open findings cost over a year if nothing is reclaimed.",
        source: "Same findings as monthly waste, each multiplied by twelve.",
        columns: ["Rule", "Impact / yr"],
        rows: annualRows,
        totalLabel: "Total annualized waste",
        totalValue: fmtMoney(monthlyWaste * 12, currency),
        emptyText: "No open findings, nothing flagged as waste.",
        footnote: listPriceFootnote,
      },
    },
    {
      key: "findings",
      label: "Open findings",
      value: fmtNumber(openCount, currency),
      sub: `across ${ALL_RULES.length} rules`,
      tone: "ink",
      explainer:
        "How many findings are currently open or acknowledged, across all detection rules.",
      detail: {
        formula:
          "A count of every finding whose status is open or acknowledged. Resolved findings drop out of the count.",
        source: `Findings are raised during sync by ${ALL_RULES.length} detection rules. Each rule flags a distinct kind of license waste.`,
        columns: ["Rule", "Open"],
        rows: findingRows,
        totalLabel: "Total open findings",
        totalValue: fmtNumber(openCount, currency),
        emptyText: "No open findings.",
        footnote: `${ruleEntries.length} of ${ALL_RULES.length} rules currently have open findings.`,
      },
    },
    {
      key: "savings",
      label: "Verified savings (30d)",
      value: fmtMoney(resolvedSavings.cents, currency),
      sub: `${fmtNumber(resolvedSavings.count, currency)} confirmed ${resolvedSavings.count === 1 ? "resolution" : "resolutions"}`,
      tone: "ink",
      explainer:
        "Monthly recurring waste that disappeared after a later sync confirmed the affected license was reclaimed.",
      detail: {
        formula:
          "Monthly impact from findings automatically resolved during the last 30 days.",
        source:
          "A later sync must confirm the waste condition no longer exists; acknowledging a finding does not count as savings.",
        columns: ["Measure", "Value"],
        rows: [
          {
            label: "Annualized recurring savings",
            sub: `${fmtMoney(resolvedSavings.cents, currency)}/mo × 12`,
            value: fmtMoney(resolvedSavings.cents * 12, currency),
          },
        ],
        totalLabel: "Verified monthly savings",
        totalValue: fmtMoney(resolvedSavings.cents, currency),
        emptyText: "No findings were confirmed resolved in the last 30 days.",
      },
    },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      {ctx.membership.dataTourAt === null && (
        <Tour
          phase="data"
          storageId={ctx.membership.id}
          steps={dataTourSteps}
          finalButtonLabel="Done"
        />
      )}
      <header className="rise rise-1 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl tracking-tight">Overview</h1>
          <p className="text-ink-soft mt-1 text-sm">
            {lastRun?.status === "running"
              ? "Sync running…"
              : isImported
                ? `Imported ${fmtDate(importedUser?.syncedAt ?? null)}`
                : `Last synced ${fmtAgo(lastRun?.finishedAt ?? null)}`}
            {lastRun?.status === "failed" && (
              <span className="text-danger-text ml-2">(last sync failed)</span>
            )}
            {lastRun?.status === "partial" && (
              <span className="text-gold-text ml-2">
                (completed with warnings
                {degradedSteps > 0
                  ? ` · ${fmtNumber(degradedSteps, currency)} ${
                      degradedSteps === 1 ? "step" : "steps"
                    } degraded`
                  : ""}
                )
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ButtonAnchor href="/api/export/report">PDF report</ButtonAnchor>
          {/* Imported workspaces (consentedAt null) have no Graph access: a
                  manual sync could only fail. Demo tenants have consentedAt set. */}
          {hasRole(ctx, "admin") && ctx.tenant.consentedAt && <SyncNowButton />}
        </div>
      </header>

      {!ctx.tenant.consentedAt && !ctx.tenant.isDemo && (
        <section className="rise rise-2 mt-8">
          <Card title="Imported workspace">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="text-ink-soft max-w-2xl text-sm">
                Figures come from your last instant scan or CSV upload. Connect
                the read-only sync for nightly updates, leak alerts and trends.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <ButtonLink variant="primary" href="/app/connectors/microsoft">
                  Connect the read-only sync
                </ButtonLink>
                <ButtonAnchor href="/api/scan/start">
                  Re-run instant scan
                </ButtonAnchor>
                <ButtonLink href="/app/connect/csv">
                  Upload fresh exports
                </ButtonLink>
              </div>
            </div>
          </Card>
        </section>
      )}

      {renewalDays !== null && renewalDays < 0 && (
        <p className="rise rise-2 text-ink-faint mt-8 text-sm">
          Renewal date passed:{" "}
          <Link
            href="/app/renewals"
            className="hover:text-ink underline underline-offset-4"
          >
            update it in Renewals
          </Link>
          .
        </p>
      )}
      {renewalDays !== null &&
        noticeDaysUntil !== null &&
        renewalDays >= 0 &&
        noticeDaysUntil <= 90 && (
          <section className="rise rise-2 mt-8">
            <Card title="Renewal window">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="font-display text-2xl tracking-tight">
                    {renewalDays === 0
                      ? "Renewal today"
                      : `${nextRenewal?.vendor}: renewal in ${renewalDays} ${renewalDays === 1 ? "day" : "days"}`}
                  </div>
                  <p className="text-ink-soft mt-1 text-sm">
                    {nextRenewal?.contractName}.{" "}
                    {fmtNumber(openCount, currency)} open{" "}
                    {openCount === 1 ? "finding" : "findings"} worth{" "}
                    <span className="text-waste-text font-medium">
                      {fmtMoney(monthlyWaste, currency)}/mo
                    </span>
                    . Reclaim these seats before you re-commit.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <ButtonLink href="/app/findings">Review findings</ButtonLink>
                  <ButtonLink href="/app/renewals">Renewal calendar</ButtonLink>
                </div>
              </div>
            </Card>
          </section>
        )}

      <MetricCards cards={metricCards} />

      {!priceCoverage.complete && priceCoverage.totalProducts > 0 && (
        <section className="rise rise-2 mt-6">
          <PriceAccuracyCard coverage={priceCoverage} />
        </section>
      )}

      <section className="rise rise-3 mt-8">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <h2 className="text-ink-faint text-xs font-medium tracking-[0.18em] uppercase">
              Next best actions
            </h2>
            <p className="text-ink-soft mt-1 text-sm">
              Highest-value open findings to review first.
            </p>
          </div>
          <Link
            href="/app/findings"
            className="text-ink-soft hover:text-ink text-xs underline-offset-4 hover:underline"
          >
            All findings →
          </Link>
        </div>
        <ul className="border-line bg-card mt-3 border">
          {topFindings.map((f) => (
            <li key={f.id} className="border-line border-b last:border-b-0">
              <Link
                href={`/app/findings/${f.id}`}
                className="group hover:bg-canvas flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <FindingChip rule={f.rule} detail={f.detail} />
                  <span className="truncate text-sm underline-offset-4 group-hover:underline">
                    {f.title}
                  </span>
                </div>
                <span className="tnum text-waste-text shrink-0 font-mono text-sm font-medium">
                  {f.monthlyImpactCents > 0
                    ? `${fmtMoney(f.monthlyImpactCents, currency)}/mo`
                    : "-"}
                </span>
              </Link>
            </li>
          ))}
          {topFindings.length === 0 && (
            <li className="text-ink-soft px-4 py-8 text-center text-sm">
              No open findings. Either the tenant is spotless or the first sync
              has not finished yet.
            </li>
          )}
        </ul>
      </section>

      <TrendChart
        currency={currency}
        points={history.map((s) => ({
          day: s.day,
          spendCents: s.totalMonthlySpendCents,
          wasteCents: s.totalMonthlyWasteCents,
        }))}
      />

      <InventoryTable
        rows={inventoryRows}
        currency={currency}
        emptyText={emptyInventory}
      />
    </div>
  );
}
