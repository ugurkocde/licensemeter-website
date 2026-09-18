import { and, desc, inArray, sql } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";

import { OpenWorkspaceButton } from "~/components/workspace/OpenWorkspaceButton";
import { Card, Pill, buttonClass } from "~/components/ui";
import { normalizeCurrencyCents } from "~/lib/currency";
import { fmtAgo, fmtDate, fmtMoney, fmtNumber } from "~/lib/format";
import { requireAccess } from "~/server/access";
import { db } from "~/server/db";
import {
  findings,
  snapshots,
  syncRuns,
  tenants,
  tenantUsers,
} from "~/server/db/schema";

export const metadata: Metadata = { title: "Portfolio" };

/**
 * MSP/consultant view: every workspace this user can open, with the numbers
 * that matter for a QBR: seats, spend, waste, open findings, sync health.
 */
export default async function PortfolioPage() {
  const ctx = await requireAccess("viewer");
  if (ctx.workspaces.length < 2) {
    return (
      <div className="mx-auto max-w-3xl pb-8">
        <header className="rise rise-1">
          <h1 className="font-display text-3xl tracking-tight">Portfolio</h1>
          <p className="text-ink-soft mt-2 max-w-2xl text-sm leading-relaxed">
            Portfolio reporting appears once you belong to two or more
            workspaces. Your current workspace is ready on the overview.
          </p>
        </header>
        <div className="rise rise-2 mt-8">
          <Card title="One workspace connected">
            <p className="text-ink-soft text-sm">
              Portfolio reporting appears once you belong to two or more
              workspaces. Ask a client to invite you to their workspace, or
              connect one client tenant per account.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/app" className={buttonClass("primary")}>
                Open Overview
              </Link>
              <Link href="/app/connectors" className={buttonClass("secondary")}>
                Open Connectors
              </Link>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  const ids = ctx.workspaces.map((w) => w.id);

  // All per-workspace data is fetched set-based (one query each, distinct-on the
  // latest row per tenant) rather than three queries per workspace; the old
  // shape was ~3N round-trips for an MSP with N clients.
  const [tenantRows, findingCounts, snaps, runs, imports] = await Promise.all([
    db.query.tenants.findMany({ where: inArray(tenants.id, ids) }),
    db
      .select({
        tenantId: findings.tenantId,
        n: sql<number>`count(*)::int`,
      })
      .from(findings)
      .where(
        and(
          inArray(findings.tenantId, ids),
          inArray(findings.status, ["open", "acknowledged"]),
        ),
      )
      .groupBy(findings.tenantId),
    db
      .selectDistinctOn([snapshots.tenantId], {
        tenantId: snapshots.tenantId,
        seats: snapshots.purchasedSeats,
        spendCents: snapshots.totalMonthlySpendCents,
        wasteCents: snapshots.totalMonthlyWasteCents,
      })
      .from(snapshots)
      .where(inArray(snapshots.tenantId, ids))
      .orderBy(snapshots.tenantId, desc(snapshots.day)),
    db
      .selectDistinctOn([syncRuns.tenantId], {
        tenantId: syncRuns.tenantId,
        status: syncRuns.status,
        finishedAt: syncRuns.finishedAt,
      })
      .from(syncRuns)
      .where(inArray(syncRuns.tenantId, ids))
      .orderBy(syncRuns.tenantId, desc(syncRuns.startedAt)),
    db
      .selectDistinctOn([tenantUsers.tenantId], {
        tenantId: tenantUsers.tenantId,
        syncedAt: tenantUsers.syncedAt,
      })
      .from(tenantUsers)
      .where(inArray(tenantUsers.tenantId, ids))
      .orderBy(tenantUsers.tenantId, desc(tenantUsers.syncedAt)),
  ]);

  const tenantById = new Map(tenantRows.map((t) => [t.id, t]));
  const findingsById = new Map(findingCounts.map((c) => [c.tenantId, c.n]));
  const snapById = new Map(snaps.map((s) => [s.tenantId, s]));
  const runById = new Map(runs.map((r) => [r.tenantId, r]));
  const importById = new Map(imports.map((i) => [i.tenantId, i.syncedAt]));

  const rows = ctx.workspaces.map((ws) => {
    const tenant = tenantById.get(ws.id);
    // CSV/scan imports never get syncRuns rows; show their import date.
    const isImported = !tenant?.consentedAt && !ws.isDemo;
    const lastRun = runById.get(ws.id);
    const importedAt = isImported ? (importById.get(ws.id) ?? null) : null;
    const syncFailed = lastRun?.status === "failed";
    // Plain data, not JSX, so the row stays serializable; the cell decides tone.
    const syncText = syncFailed
      ? "failed"
      : isImported
        ? importedAt
          ? `imported ${fmtDate(importedAt)}`
          : "-"
        : fmtAgo(lastRun?.finishedAt ?? null);
    return {
      ws,
      currency: tenant?.currency ?? "EUR",
      currencyRatePpm: tenant?.currencyRatePpm ?? 1_000_000,
      snapshot: snapById.get(ws.id),
      isImported,
      syncFailed,
      syncText,
      openFindings: findingsById.get(ws.id) ?? 0,
    };
  });

  const reportingCurrency = ctx.tenant.currency;
  const reportingRatePpm = ctx.tenant.currencyRatePpm;
  const normalizedRows = rows.map((row) => ({
    ...row,
    reportingSpendCents: row.snapshot
      ? normalizeCurrencyCents(
          row.snapshot.spendCents,
          row.currencyRatePpm,
          reportingRatePpm,
        )
      : null,
    reportingWasteCents: row.snapshot
      ? normalizeCurrencyCents(
          row.snapshot.wasteCents,
          row.currencyRatePpm,
          reportingRatePpm,
        )
      : null,
  }));

  const sorted = normalizedRows.sort(
    (a, b) => (b.reportingWasteCents ?? 0) - (a.reportingWasteCents ?? 0),
  );

  const withSnap = sorted.filter((r) => r.snapshot);
  const totals = withSnap.reduce(
    (acc, r) => ({
      spendCents: acc.spendCents + (r.reportingSpendCents ?? 0),
      wasteCents: acc.wasteCents + (r.reportingWasteCents ?? 0),
    }),
    { spendCents: 0, wasteCents: 0 },
  );
  const totalFindings = rows.reduce((s, r) => s + r.openFindings, 0);

  return (
    <div className="mx-auto max-w-5xl">
      <header className="rise rise-1">
        <h1 className="font-display text-3xl tracking-tight">Portfolio</h1>
        <p className="text-ink-soft mt-1 text-sm">
          All {ctx.workspaces.length} workspaces, normalized to{" "}
          {reportingCurrency}
          and sorted by waste.
        </p>
      </header>

      {withSnap.length > 0 && (
        <section className="rise rise-2 border-line bg-line mt-8 grid gap-px border sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              label: "Monthly spend",
              value: fmtMoney(totals.spendCents, reportingCurrency),
            },
            {
              label: "Monthly waste",
              value: fmtMoney(totals.wasteCents, reportingCurrency),
              waste: true,
            },
            { label: "Open findings", value: fmtNumber(totalFindings) },
          ].map((c) => (
            <div key={c.label} className="bg-card p-5">
              <div className="text-ink-faint text-[11px] font-medium tracking-[0.16em] uppercase">
                {c.label}
              </div>
              <div
                className={`tnum font-display mt-2 text-2xl tracking-tight ${
                  c.waste ? "text-waste-text" : ""
                }`}
              >
                {c.value}
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Desktop table */}
      <div className="rise rise-2 border-line bg-card mt-8 mb-8 hidden overflow-x-auto border md:block">
        <table className="w-full text-sm">
          <caption className="sr-only">
            Workspaces you can open with seats, spend, waste, open findings and
            sync status.
          </caption>
          <thead>
            <tr className="border-line text-ink-faint border-b text-left text-[11px] tracking-[0.14em] uppercase">
              <th scope="col" className="px-4 py-3 font-medium">
                Workspace
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                Seats
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                Spend / mo
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                Waste / mo
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                Findings
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Last sync
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-right font-medium"
                aria-label="Open"
              />
            </tr>
          </thead>
          <tbody>
            {sorted.map(
              ({
                ws,
                currency,
                snapshot,
                isImported,
                syncFailed,
                syncText,
                openFindings,
                reportingSpendCents,
                reportingWasteCents,
              }) => (
                <tr
                  key={ws.id}
                  className="border-line hover:bg-canvas border-b last:border-b-0"
                >
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{ws.name}</span>
                      {ws.isDemo && <Pill tone="slate">demo</Pill>}
                      {isImported && <Pill tone="gold">imported</Pill>}
                      {ws.id === ctx.tenant.id && (
                        <span className="text-ink-faint text-xs">
                          (current)
                        </span>
                      )}
                    </div>
                    <div className="text-ink-faint text-[11px] tracking-wider uppercase">
                      {ws.role}
                    </div>
                  </td>
                  <td className="tnum px-4 py-3 text-right font-mono">
                    {snapshot ? fmtNumber(snapshot.seats, currency) : "-"}
                  </td>
                  <td className="tnum px-4 py-3 text-right font-mono">
                    {snapshot ? (
                      <>
                        {fmtMoney(snapshot.spendCents, currency)}
                        {currency !== reportingCurrency && (
                          <div className="text-ink-faint text-[11px]">
                            {fmtMoney(
                              reportingSpendCents ?? 0,
                              reportingCurrency,
                            )}
                          </div>
                        )}
                      </>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="tnum text-waste-text px-4 py-3 text-right font-mono font-medium">
                    {snapshot ? (
                      <>
                        {fmtMoney(snapshot.wasteCents, currency)}
                        {currency !== reportingCurrency && (
                          <div className="text-ink-faint text-[11px] font-normal">
                            {fmtMoney(
                              reportingWasteCents ?? 0,
                              reportingCurrency,
                            )}
                          </div>
                        )}
                      </>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="tnum px-4 py-3 text-right font-mono">
                    {fmtNumber(openFindings)}
                  </td>
                  <td
                    className={`px-4 py-3 ${syncFailed ? "text-danger-text" : "text-ink-soft"}`}
                  >
                    {syncText}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <OpenWorkspaceButton tenantId={ws.id} name={ws.name} />
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile stacked cards */}
      <ul className="rise rise-2 mt-8 mb-8 flex flex-col gap-3 md:hidden">
        {sorted.map(
          ({
            ws,
            currency,
            snapshot,
            isImported,
            syncFailed,
            syncText,
            openFindings,
            reportingSpendCents,
            reportingWasteCents,
          }) => (
            <li key={ws.id} className="border-line bg-card border p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{ws.name}</span>
                    {ws.isDemo && <Pill tone="slate">demo</Pill>}
                    {isImported && <Pill tone="gold">imported</Pill>}
                    {ws.id === ctx.tenant.id && (
                      <span className="text-ink-faint text-xs">(current)</span>
                    )}
                  </div>
                  <div className="text-ink-faint text-[11px] tracking-wider uppercase">
                    {ws.role}
                  </div>
                </div>
                <OpenWorkspaceButton tenantId={ws.id} name={ws.name} />
              </div>
              <dl className="tnum mt-3 grid grid-cols-2 gap-x-6 gap-y-2 font-mono text-sm">
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-faint font-sans text-xs">Seats</dt>
                  <dd>
                    {snapshot ? fmtNumber(snapshot.seats, currency) : "-"}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-faint font-sans text-xs">Findings</dt>
                  <dd>{fmtNumber(openFindings)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-faint font-sans text-xs">Spend/mo</dt>
                  <dd>
                    {snapshot
                      ? fmtMoney(reportingSpendCents ?? 0, reportingCurrency)
                      : "-"}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-faint font-sans text-xs">Waste/mo</dt>
                  <dd className="text-waste-text font-medium">
                    {snapshot
                      ? fmtMoney(reportingWasteCents ?? 0, reportingCurrency)
                      : "-"}
                  </dd>
                </div>
                <div className="col-span-2 flex justify-between gap-2">
                  <dt className="text-ink-faint font-sans text-xs">
                    Last sync
                  </dt>
                  <dd
                    className={`font-sans ${syncFailed ? "text-danger-text" : ""}`}
                  >
                    {syncText}
                  </dd>
                </div>
              </dl>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
