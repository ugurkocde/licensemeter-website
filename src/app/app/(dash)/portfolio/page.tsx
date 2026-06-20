import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { OpenWorkspaceButton } from "~/components/workspace/OpenWorkspaceButton";
import { Pill } from "~/components/ui";
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
  if (ctx.workspaces.length < 2) redirect("/app");

  const ids = ctx.workspaces.map((w) => w.id);

  const [tenantRows, findingCounts] = await Promise.all([
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
  ]);

  const rows = await Promise.all(
    ctx.workspaces.map(async (ws) => {
      const tenant = tenantRows.find((t) => t.id === ws.id);
      // CSV/scan trials never get syncRuns rows; show their import date.
      const isTrial = !tenant?.consentedAt && !ws.isDemo;
      const [latest, lastRun, importedUser] = await Promise.all([
        db.query.snapshots.findFirst({
          where: eq(snapshots.tenantId, ws.id),
          orderBy: desc(snapshots.day),
        }),
        db.query.syncRuns.findFirst({
          where: eq(syncRuns.tenantId, ws.id),
          orderBy: desc(syncRuns.startedAt),
        }),
        isTrial
          ? db.query.tenantUsers.findFirst({
              where: eq(tenantUsers.tenantId, ws.id),
              orderBy: desc(tenantUsers.syncedAt),
            })
          : Promise.resolve(undefined),
      ]);
      const importedAt = importedUser?.syncedAt ?? null;
      return {
        ws,
        currency: tenant?.currency ?? "EUR",
        snapshot: latest,
        sync:
          lastRun?.status === "failed" ? (
            <span className="text-danger-text">failed</span>
          ) : isTrial ? (
            importedAt ? `imported ${fmtDate(importedAt)}` : "-"
          ) : (
            fmtAgo(lastRun?.finishedAt ?? null)
          ),
        openFindings: findingCounts.find((c) => c.tenantId === ws.id)?.n ?? 0,
      };
    }),
  );

  const sorted = rows.sort(
    (a, b) =>
      (b.snapshot?.totalMonthlyWasteCents ?? 0) -
      (a.snapshot?.totalMonthlyWasteCents ?? 0),
  );

  return (
    <div className="mx-auto max-w-5xl">
      <header className="rise rise-1">
        <h1 className="font-display text-3xl tracking-tight">Portfolio</h1>
        <p className="mt-1 text-sm text-ink-soft">
          All {ctx.workspaces.length} workspaces you can open, sorted by waste.
        </p>
      </header>

      {/* Desktop table */}
      <div className="rise rise-2 mt-8 mb-8 hidden overflow-x-auto border border-line bg-card md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[11px] tracking-[0.14em] text-ink-faint uppercase">
              <th className="px-4 py-3 font-medium">Workspace</th>
              <th className="px-4 py-3 text-right font-medium">Seats</th>
              <th className="px-4 py-3 text-right font-medium">Spend / mo</th>
              <th className="px-4 py-3 text-right font-medium">Waste / mo</th>
              <th className="px-4 py-3 text-right font-medium">Findings</th>
              <th className="px-4 py-3 font-medium">Last sync</th>
              <th className="px-4 py-3 text-right font-medium" aria-label="Open" />
            </tr>
          </thead>
          <tbody>
            {sorted.map(({ ws, currency, snapshot, sync, openFindings }) => (
              <tr
                key={ws.id}
                className="border-b border-line last:border-b-0 hover:bg-canvas"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{ws.name}</span>
                    {ws.isDemo && <Pill tone="slate">demo</Pill>}
                    {ws.id === ctx.tenant.id && (
                      <span className="text-xs text-ink-faint">(current)</span>
                    )}
                  </div>
                  <div className="text-[11px] tracking-wider text-ink-faint uppercase">
                    {ws.role}
                  </div>
                </td>
                <td className="tnum px-4 py-3 text-right font-mono">
                  {snapshot ? fmtNumber(snapshot.assignedSeats, currency) : "-"}
                </td>
                <td className="tnum px-4 py-3 text-right font-mono">
                  {snapshot
                    ? fmtMoney(snapshot.totalMonthlySpendCents, currency)
                    : "-"}
                </td>
                <td className="tnum px-4 py-3 text-right font-mono font-medium text-waste-text">
                  {snapshot
                    ? fmtMoney(snapshot.totalMonthlyWasteCents, currency)
                    : "-"}
                </td>
                <td className="tnum px-4 py-3 text-right font-mono">
                  {fmtNumber(openFindings, currency)}
                </td>
                <td className="px-4 py-3 text-ink-soft">{sync}</td>
                <td className="px-4 py-3 text-right">
                  <OpenWorkspaceButton tenantId={ws.id} name={ws.name} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile stacked cards */}
      <ul className="rise rise-2 mt-8 mb-8 flex flex-col gap-3 md:hidden">
        {sorted.map(({ ws, currency, snapshot, sync, openFindings }) => (
          <li key={ws.id} className="border border-line bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{ws.name}</span>
                  {ws.isDemo && <Pill tone="slate">demo</Pill>}
                  {ws.id === ctx.tenant.id && (
                    <span className="text-xs text-ink-faint">(current)</span>
                  )}
                </div>
                <div className="text-[11px] tracking-wider text-ink-faint uppercase">
                  {ws.role}
                </div>
              </div>
              <OpenWorkspaceButton tenantId={ws.id} name={ws.name} />
            </div>
            <dl className="tnum mt-3 grid grid-cols-2 gap-x-6 gap-y-2 font-mono text-sm">
              <div className="flex justify-between gap-2">
                <dt className="font-sans text-xs text-ink-faint">Waste/mo</dt>
                <dd className="font-medium text-waste-text">
                  {snapshot
                    ? fmtMoney(snapshot.totalMonthlyWasteCents, currency)
                    : "-"}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="font-sans text-xs text-ink-faint">Spend/mo</dt>
                <dd>
                  {snapshot
                    ? fmtMoney(snapshot.totalMonthlySpendCents, currency)
                    : "-"}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="font-sans text-xs text-ink-faint">Findings</dt>
                <dd>{fmtNumber(openFindings, currency)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="font-sans text-xs text-ink-faint">Last sync</dt>
                <dd className="font-sans">{sync}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
    </div>
  );
}
