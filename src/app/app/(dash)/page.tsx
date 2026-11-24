import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { AccessRequestCards } from "~/components/workspace/AccessRequestCards";
import { AccessGrantedNotice } from "~/components/workspace/AccessGrantedNotice";
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
import { UnpricedNotice } from "~/components/workspace/UnpricedNotice";
import { SyncNowButton } from "~/components/workspace/SyncNowButton";
import {
  SyncStatusPanel,
  SyncStatusProvider,
  SyncStatusText,
} from "~/components/workspace/SyncStatus";
import { TrendChart } from "~/components/workspace/TrendChart";
import { Tour } from "~/components/workspace/Tour";
import {
  dataTourSteps,
  welcomeTourSteps,
} from "~/components/workspace/tourSteps";
import { fmtAgo, fmtDate, fmtMoney, fmtNumber } from "~/lib/format";
import { calculatePriceCoverage } from "~/lib/priceCoverage";
import { syncStatusRun } from "~/lib/syncStatusRun";
import { ALL_RULES, RULE_META } from "~/lib/rules";
import { upgradePath } from "~/lib/upgrade";
import type { WasteRuleId } from "~/server/types";
import { requireAccess, hasRole } from "~/server/access";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import {
  findOrganizationWorkspaceHint,
  accessRequestNoticesOf,
  ownAccessRequest,
} from "~/server/domainJoin";
import { workspaceHasConnectorOrData } from "~/server/workspaceState";
import { daysUntilDate } from "~/server/digestDelta";
import { loadWasteHistory } from "~/server/historyStore";
import {
  isShelfwareExempt,
  paidSeatsOf,
  unpricedSkuCount,
} from "~/server/waste/engine";
import {
  findings,
  syncRuns,
  tenantUsers,
  vendorRenewals,
} from "~/server/db/schema";

import { loadRecentSavings } from "~/server/savings/ledger";
import {
  comparableWaste,
  findingSource,
  priceConfidence,
  vendorLabel,
} from "~/server/waste/spend";
import { loadLicenseSpend } from "~/server/waste/spendStore";
import { hasFeature } from "~/server/entitlement";
import {
  PriceConfidenceBadge,
  PriceConfidenceLocked,
} from "~/components/workspace/PriceConfidence";

export const metadata: Metadata = { title: "Overview" };

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ accessRequest?: string }>;
}) {
  const ctx = await requireAccess("viewer");
  const tenantId = ctx.tenant.id;
  const params = await searchParams;
  const successRequest =
    !ctx.user.isDemo && z.guid().safeParse(params.accessRequest).success
      ? await ownAccessRequest(db, ctx.user.oid, params.accessRequest!)
      : null;
  const confirmation =
    successRequest?.role && successRequest.tenantId === tenantId ? (
      <AccessGrantedNotice
        key={successRequest.id}
        workspaceName={successRequest.tenantName ?? "your company’s workspace"}
        role={successRequest.role}
      />
    ) : null;

  // Workspace-first onboarding: a workspace that has connected no service yet
  // lands on the dashboard but sees the onboarding empty state (nudge to connect
  // a first service) instead of a dashboard of zeros. Demo always has data.
  const hasConnectorOrData =
    ctx.tenant.isDemo || (await workspaceHasConnectorOrData(tenantId));
  if (!hasConnectorOrData) {
    const requests = ctx.user.isDemo
      ? []
      : await accessRequestNoticesOf(db, ctx.user.oid);
    if (requests.length)
      return (
        <>
          {confirmation}
          <AccessRequestCards requests={requests} />
        </>
      );
    // A colleague who was not let into their organization's workspace lands
    // here; say so instead of leaving them to wonder where the data is.
    const session = await auth();
    const organizationHint = session
      ? await findOrganizationWorkspaceHint(
          db,
          {
            oid: ctx.user.oid,
            tid: ctx.user.tid,
            email:
              session.user.emailProven === true
                ? (session.user.email ?? "").trim().toLowerCase()
                : "",
            emailVerified: session.user.emailProven === true,
          },
          ctx.workspaces.map((w) => w.id),
        )
      : null;
    return (
      <>
        {confirmation}
        <OnboardingEmptyState organizationHint={organizationHint} />
        {!organizationHint && ctx.membership.welcomeTourAt === null && (
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
    { skus, prices, spend },
    topFindings,
    ruleAgg,
    lastRun,
    importedUser,
    wasteHistory,
    resolvedSavings,
    upcomingRenewals,
  ] = await Promise.all([
    loadLicenseSpend(tenantId),
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
        provider: sql<string | null>`${findings.detail}->>'provider'`,
        count: sql<number>`count(*)::int`,
        cents: sql<number>`coalesce(sum(${findings.monthlyImpactCents}), 0)::int`,
      })
      .from(findings)
      .where(openFindingsWhere)
      .groupBy(findings.rule, sql`${findings.detail}->>'provider'`),
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
    // Every day inside the plan's history window, newest first, reversed
    // below into ascending order for the chart.
    loadWasteHistory(tenantId, ctx.entitlement),
    loadRecentSavings(tenantId, currency),
    db.query.vendorRenewals.findMany({
      where: and(
        eq(vendorRenewals.tenantId, tenantId),
        gte(vendorRenewals.renewalDate, new Date().toISOString().slice(0, 10)),
      ),
      orderBy: asc(vendorRenewals.renewalDate),
      limit: 3,
    }),
  ]);

  const history = [...wasteHistory.rows].reverse();

  const priceBySku = new Map(prices.map((p) => [p.skuId, p.monthlyPriceCents]));

  // Real, purchased SKUs only. Microsoft auto-provisions free/viral/capacity
  // sentinels (WINDOWS_STORE's 1,000,000 prepaid units, FLOW_FREE, etc.) into
  // every tenant; they carry no cost and only add noise. Excluding them here
  // (the same exemption the waste engine and seat-tier gate already use) keeps
  // the spend total, the assigned-seat count and the inventory table all
  // reconciled to one set of SKUs.
  const realSkus = skus.filter(
    (s) => !isShelfwareExempt(s.skuPartNumber, s.skuId),
  );

  const spendBySku = new Map(spend.rows.map((row) => [row.skuId, row.cents]));
  const monthlySpend = spend.totalCents;
  const monthlyWaste = ruleAgg.reduce((sum, r) => sum + r.cents, 0);
  const wasteShare =
    monthlySpend > 0
      ? (comparableWaste(monthlyWaste, monthlySpend) / monthlySpend) * 100
      : 0;
  const confidence = hasFeature(ctx.entitlement, "savingsLedger")
    ? priceConfidence(spend)
    : null;

  // Inventory rows for the dashboard table, sorted client-side (default: spend
  // descending). Pre-shaped here so the client component stays serializable.
  const inventoryRows = realSkus.map((s) => ({
    skuId: s.skuId,
    name: s.displayName ?? s.skuPartNumber,
    partNumber: s.skuPartNumber,
    purchased: paidSeatsOf(s),
    assigned: s.consumedUnits,
    spendCents: spendBySku.get(s.skuId) ?? 0,
  }));

  const priceRowsBySku = new Map(prices.map((p) => [p.skuId, p]));
  const priceCoverage = calculatePriceCoverage(
    confidence
      ? spend.rows
      : realSkus.map((s) => {
          const price = priceRowsBySku.get(s.skuId);
          return {
            seats:
              s.trialUnits > 0
                ? Math.min(s.consumedUnits, paidSeatsOf(s))
                : s.consumedUnits,
            priceCents: price?.monthlyPriceCents ?? 0,
            source: price?.source,
          };
        }),
  );
  const unpricedSkus = unpricedSkuCount(
    realSkus,
    (skuId) => priceBySku.get(skuId) ?? 0,
  );

  const nextRenewal = upcomingRenewals[0] ?? null;
  const renewalDays = daysUntilDate(
    nextRenewal?.renewalDate ?? null,
    new Date(),
  );
  const noticeDaysUntil =
    renewalDays === null ? null : renewalDays - (nextRenewal?.noticeDays ?? 0);
  const renewalRules = ruleAgg.filter(({ rule, provider }) => {
    const vendor = vendorLabel(findingSource({ rule, detail: { provider } }));
    return vendor.toLowerCase() === nextRenewal?.vendor.trim().toLowerCase();
  });
  const renewalCount = renewalRules.reduce((sum, row) => sum + row.count, 0);
  const renewalWaste = renewalRules.reduce((sum, row) => sum + row.cents, 0);
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
  const purchasedSeats = spend.rows.reduce((sum, row) => sum + row.seats, 0);

  // Spend by product: zero-cost SKUs (free/viral sentinels) drop out, leaving
  // only rows that actually contribute to monthly spend.
  const spendRows: BreakdownRow[] = spend.rows
    .filter((row) => row.cents > 0)
    .sort((a, b) => b.cents - a.cents)
    .map((row) => ({
      label:
        row.vendor === "microsoft"
          ? (realSkus.find((sku) => sku.skuId === row.skuId)?.displayName ??
            row.name)
          : `${vendorLabel(row.vendor)} · ${row.name}`,
      sub: `${fmtNumber(row.seats, currency)} × ${fmtMoney(row.priceCents, currency)}`,
      value: fmtMoney(row.cents, currency),
    }));

  // Findings grouped by rule, the shared basis for the waste, annualized-waste
  // and open-findings breakdowns.
  const byRule = new Map<WasteRuleId, { count: number; cents: number }>();
  for (const r of ruleAgg) {
    const previous = byRule.get(r.rule);
    byRule.set(r.rule, {
      count: (previous?.count ?? 0) + r.count,
      cents: (previous?.cents ?? 0) + r.cents,
    });
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
      sub: `${fmtNumber(purchasedSeats, currency)} paid or active seats`,
      note: confidence ? (
        <PriceConfidenceBadge confidence={confidence} />
      ) : (
        <PriceConfidenceLocked />
      ),
      tone: "ink",
      explainer:
        "Purchased Microsoft seats and active seats at other vendors × their monthly prices.",
      detail: {
        formula:
          "Purchased Microsoft seats include idle seats and exclude trials and free products. Other vendors use active entitlements where purchased totals are unavailable. API usage charges are separate.",
        source:
          "Seat counts come from your latest sync or import. Prices come from your price book.",
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
          Includes list estimates or unpriced seats.{" "}
          <Link
            href="/app/licenses"
            className="hover:text-ink underline underline-offset-4"
          >
            Set your actual prices
          </Link>
        </>
      ) : null,
      explainer:
        "Open findings across all providers, as a share of paid seat spend across the same providers.",
      detail: {
        formula:
          "Each open or acknowledged finding carries the monthly cost of the wasted seat. Monthly waste is the sum of those costs, grouped here by the rule that flagged them.",
        source:
          "Findings are raised during sync by the detection rules; resolved findings are excluded. The share is capped at 100% when findings from an older sync exceed the current seat spend.",
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
      label: "Realized savings (30d)",
      value: fmtMoney(resolvedSavings.cents, currency),
      sub: `${fmtNumber(resolvedSavings.reclaimed, currency)} reclaimed, ${fmtNumber(resolvedSavings.noLongerFlagged, currency)} no longer flagged`,
      tone: "ink",
      note: (
        <Link className="underline underline-offset-4" href="/app/savings">
          Savings ledger
        </Link>
      ),
      explainer:
        "Monthly value of licenses removed and purchased seats reduced in the last 30 days, while the savings are still active.",
      detail: {
        formula:
          "Adds the monthly value of licenses removed and purchased seats reduced in the last 30 days. A reopened finding stops contributing.",
        source:
          "A sync or a fresh seat import must confirm the change. Removing a license frees a seat for reuse. Reducing purchases lowers seat commitments. Other resolutions are counted separately.",
        columns: ["Measure", "Value"],
        rows: [
          {
            label: "Reclaimed findings",
            value: fmtNumber(resolvedSavings.reclaimed, currency),
          },
          {
            label: "No longer flagged",
            value: fmtNumber(resolvedSavings.noLongerFlagged, currency),
          },
          ...(resolvedSavings.reasonNotRecorded > 0
            ? [
                {
                  label: "Reason not recorded",
                  value: fmtNumber(resolvedSavings.reasonNotRecorded, currency),
                },
              ]
            : []),
        ],
        totalLabel: "Realized monthly value",
        totalValue: fmtMoney(resolvedSavings.cents, currency),
      },
    },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      {confirmation}
      {ctx.membership.dataTourAt === null && (
        <Tour
          phase="data"
          storageId={ctx.membership.id}
          steps={dataTourSteps}
          finalButtonLabel="Done"
        />
      )}
      {/* The sync status covers the header line, Sync now and the slot below
          the header: live progress, then a confirmation or the problem. */}
      <SyncStatusProvider initialRun={syncStatusRun(lastRun)}>
        <header className="rise rise-1 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl tracking-tight">Overview</h1>
            <p className="text-ink-soft mt-1 text-sm">
              <SyncStatusText>
                {lastRun?.status === "running"
                  ? "Sync running…"
                  : isImported
                    ? `Imported ${fmtDate(importedUser?.syncedAt ?? null)}`
                    : `Last synced ${fmtAgo(lastRun?.finishedAt ?? null)}`}
                {lastRun?.status === "failed" && (
                  <span className="text-danger-text ml-2">
                    (last sync failed)
                  </span>
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
              </SyncStatusText>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ButtonAnchor href="/api/export/report">PDF report</ButtonAnchor>
            {/* Imported workspaces (consentedAt null) have no Graph access: a
                  manual sync could only fail. Demo tenants have consentedAt set. */}
            {hasRole(ctx, "admin") && ctx.tenant.consentedAt && (
              <SyncNowButton />
            )}
          </div>
        </header>
        <SyncStatusPanel className="rise mt-5" />
      </SyncStatusProvider>

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
                    {fmtNumber(renewalCount, currency)} open{" "}
                    {renewalCount === 1 ? "finding" : "findings"} for this
                    vendor worth{" "}
                    <span className="text-waste-text font-medium">
                      {fmtMoney(renewalWaste, currency)}/mo
                    </span>
                    .{" "}
                    {renewalCount > 0
                      ? "Review these seats before renewing."
                      : ""}
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

      {unpricedSkus > 0 && (
        <section className="rise rise-2 mt-6">
          <UnpricedNotice count={unpricedSkus} />
        </section>
      )}

      {!confidence &&
        !priceCoverage.complete &&
        priceCoverage.totalProducts > 0 && (
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
        windowUpgradeHref={
          wasteHistory.cutOff ? upgradePath("history24") : undefined
        }
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
