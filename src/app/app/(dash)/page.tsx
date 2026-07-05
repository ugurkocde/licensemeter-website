import { and, desc, eq, inArray, sql } from "drizzle-orm";
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
            steps={welcomeTourSteps}
            finalButtonLabel="Got it"
          />
        )}
      </>
    );
  }
  const currency = ctx.tenant.currency;
  // Soft-locked workspaces keep the read-only dashboard but lose exports/sync.
  const locked = !ctx.entitlement.active;
  // CSV/scan trials never get syncRuns rows; their freshness signal is the
  // import time on the user snapshots.
  const isTrial = !ctx.tenant.consentedAt && !ctx.tenant.isDemo;

  const openFindingsWhere = and(
    eq(findings.tenantId, tenantId),
    inArray(findings.status, ["open", "acknowledged"]),
  );

  const [skus, prices, topFindings, ruleAgg, lastRun, importedUser, historyDesc] =
    await Promise.all([
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
      isTrial
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
    ]);

  const history = [...historyDesc].reverse();

  const priceBySku = new Map(prices.map((p) => [p.skuId, p.monthlyPriceCents]));

  // Real, purchased SKUs only. Microsoft auto-provisions free/viral/capacity
  // sentinels (WINDOWS_STORE's 1,000,000 prepaid units, FLOW_FREE, etc.) into
  // every tenant; they carry no cost and only add noise. Excluding them here —
  // the same exemption the waste engine and seat-tier gate already use — keeps
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

  // The price book is already loaded for the spend figures, so list-price
  // detection costs no extra query. Hidden pre-sync (no rows = no figures).
  const listPricesOnly =
    prices.length > 0 && !prices.some((p) => p.source === "custom");

  // Days until the Microsoft agreement renewal; null when no date is set.
  const renewalDays = daysUntilDate(ctx.tenant.renewalDate, new Date());
  const openCount = ruleAgg.reduce((sum, r) => sum + r.count, 0);

  // A partial sync finished but some steps degraded to warnings/failures (e.g.
  // a usage report was unavailable). Surface the count so admins know figures
  // may be incomplete without digging into the sync log.
  const degradedSteps =
    lastRun?.steps.filter(
      (s) => s.status === "warning" || s.status === "failed",
    ).length ?? 0;

  // Trial workspaces have no sync button, so do not tell them to run one.
  const emptyInventory = isTrial
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

  const listPriceFootnote = listPricesOnly
    ? "Figures use Microsoft list prices. Set your actual prices on the Licenses page for exact numbers."
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
      note: listPricesOnly ? (
        <>
          Estimated at list prices.{" "}
          <Link
            href="/app/licenses"
            className="underline underline-offset-4 hover:text-ink"
          >
            Set your actual prices
          </Link>
        </>
      ) : null,
      explainer:
        "The monthly cost of every open finding added together — this is the spend you could reclaim.",
      detail: {
        formula:
          "Each open or acknowledged finding carries the monthly cost of the wasted seat. Monthly waste is the sum of those costs, grouped here by the rule that flagged them.",
        source:
          "Findings are raised during sync by the detection rules; resolved findings are excluded. Costs reuse the same prices as monthly spend.",
        columns: ["Rule", "Impact / mo"],
        rows: wasteRows,
        totalLabel: "Total monthly waste",
        totalValue: fmtMoney(monthlyWaste, currency),
        emptyText: "No open findings — nothing flagged as waste.",
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
        source:
          "Same findings as monthly waste, each multiplied by twelve.",
        columns: ["Rule", "Impact / yr"],
        rows: annualRows,
        totalLabel: "Total annualized waste",
        totalValue: fmtMoney(monthlyWaste * 12, currency),
        emptyText: "No open findings — nothing flagged as waste.",
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
  ];

  return (
    <div className="mx-auto max-w-5xl">
      {ctx.membership.dataTourAt === null && (
        <Tour phase="data" steps={dataTourSteps} finalButtonLabel="Done" />
      )}
      <header className="rise rise-1 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl tracking-tight">Overview</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {lastRun?.status === "running"
              ? "Sync running…"
              : isTrial
                ? `Imported ${fmtDate(importedUser?.syncedAt ?? null)}`
                : `Last synced ${fmtAgo(lastRun?.finishedAt ?? null)}`}
            {lastRun?.status === "failed" && (
              <span className="ml-2 text-danger-text">(last sync failed)</span>
            )}
            {lastRun?.status === "partial" && (
              <span className="ml-2 text-gold-text">
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
          {locked ? (
            <ButtonLink href="/app/billing">Upgrade to export</ButtonLink>
          ) : (
            <>
              <ButtonAnchor href="/api/export/report">PDF report</ButtonAnchor>
              {/* Trial workspaces (consentedAt null) have no Graph access: a
                  manual sync could only fail. Demo tenants have consentedAt set. */}
              {hasRole(ctx, "admin") && ctx.tenant.consentedAt && <SyncNowButton />}
            </>
          )}
        </div>
      </header>

      {!ctx.tenant.consentedAt && !ctx.tenant.isDemo && (
        <section className="rise rise-2 mt-8">
          <Card title="Trial workspace">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="max-w-2xl text-sm text-ink-soft">
                Figures come from your last instant scan or CSV upload.
                Connect the read-only sync for nightly updates, leak alerts
                and trends.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <ButtonLink variant="primary" href="/app/settings/microsoft">
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
        <p className="rise rise-2 mt-8 text-sm text-ink-faint">
          Renewal date passed:{" "}
          <Link
            href="/app/settings"
            className="underline underline-offset-4 hover:text-ink"
          >
            update it in Settings
          </Link>
          .
        </p>
      )}
      {renewalDays !== null && renewalDays >= 0 && renewalDays <= 90 && (
        <section className="rise rise-2 mt-8">
          <Card title="Renewal window">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="font-display text-2xl tracking-tight">
                  {renewalDays === 0
                    ? "Renewal today"
                    : `Renewal in ${renewalDays} ${renewalDays === 1 ? "day" : "days"}`}
                </div>
                <p className="mt-1 text-sm text-ink-soft">
                  {fmtNumber(openCount, currency)} open{" "}
                  {openCount === 1 ? "finding" : "findings"} worth{" "}
                  <span className="font-medium text-waste-text">
                    {fmtMoney(monthlyWaste, currency)}/mo
                  </span>
                  . Reclaim these seats before you re-commit.
                </p>
              </div>
              <ButtonLink href="/app/findings">Review findings</ButtonLink>
            </div>
          </Card>
        </section>
      )}

      <MetricCards cards={metricCards} />

      {listPricesOnly && (
        <section className="rise rise-2 mt-6">
          <PriceAccuracyCard />
        </section>
      )}

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
        locked={locked}
        emptyText={emptyInventory}
      />

      <section className="rise rise-4 mt-10 mb-8">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-xs font-medium tracking-[0.18em] text-ink-faint uppercase">
            Largest open findings
          </h2>
          <Link
            href="/app/findings"
            className="text-xs text-ink-soft underline-offset-4 hover:text-ink hover:underline"
          >
            All findings →
          </Link>
        </div>
        <ul className="mt-3 border border-line bg-card">
          {topFindings.map((f) => (
            <li key={f.id} className="border-b border-line last:border-b-0">
              <Link
                href={
                  f.graphUserId
                    ? `/app/users/${f.graphUserId}`
                    : `/app/findings?rule=${f.rule}`
                }
                className="group flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 hover:bg-canvas"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <FindingChip rule={f.rule} detail={f.detail} />
                  <span className="truncate text-sm underline-offset-4 group-hover:underline">
                    {f.title}
                  </span>
                </div>
                <span className="tnum shrink-0 font-mono text-sm font-medium text-waste-text">
                  {f.monthlyImpactCents > 0
                    ? `${fmtMoney(f.monthlyImpactCents, currency)}/mo`
                    : "-"}
                </span>
              </Link>
            </li>
          ))}
          {topFindings.length === 0 && (
            <li className="px-4 py-8 text-center text-sm text-ink-soft">
              No open findings. Either the tenant is spotless or the first sync
              has not finished yet.
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}
