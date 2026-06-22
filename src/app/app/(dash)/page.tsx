import { and, desc, eq, inArray } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";

import { ButtonAnchor, ButtonLink, Card } from "~/components/ui";
import { FindingChip } from "~/components/workspace/FindingChip";
import { OnboardingEmptyState } from "~/components/workspace/OnboardingEmptyState";
import { SyncNowButton } from "~/components/workspace/SyncNowButton";
import { TrendChart } from "~/components/workspace/TrendChart";
import { isDemoMode } from "~/env";
import { fmtAgo, fmtDate, fmtMoney, fmtNumber } from "~/lib/format";
import { ALL_RULES } from "~/lib/rules";
import { requireAccess, hasRole } from "~/server/access";
import { db } from "~/server/db";
import { workspaceHasConnectorOrData } from "~/server/workspaceState";
import { daysUntilDate } from "~/server/digestDelta";
import {
  findings,
  priceBook,
  snapshots,
  syncRuns,
  tenantSkus,
  tenantUsers,
} from "~/server/db/schema";

export const metadata: Metadata = { title: "Overview" };

type SkuRow = typeof tenantSkus.$inferSelect;

const UtilizationBar = ({ sku }: { sku: SkuRow }) => {
  const util =
    sku.prepaidEnabled > 0
      ? Math.min((sku.consumedUnits / sku.prepaidEnabled) * 100, 100)
      : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 bg-line">
        <div className="h-1.5 bg-ink-soft" style={{ width: `${util}%` }} />
      </div>
      <span className="tnum font-mono text-xs text-ink-soft">
        {util.toFixed(0)}%
      </span>
    </div>
  );
};

export default async function OverviewPage() {
  const ctx = await requireAccess("viewer");
  const tenantId = ctx.tenant.id;

  // Workspace-first onboarding: a workspace that has connected no service yet
  // lands on the dashboard but sees the onboarding empty state (nudge to connect
  // a first service) instead of a dashboard of zeros. Demo always has data.
  if (!ctx.tenant.isDemo && !(await workspaceHasConnectorOrData(tenantId))) {
    return <OnboardingEmptyState demoEnabled={isDemoMode()} />;
  }
  const currency = ctx.tenant.currency;
  // Soft-locked workspaces keep the read-only dashboard but lose exports/sync.
  const locked = !ctx.entitlement.active;
  // CSV/scan trials never get syncRuns rows; their freshness signal is the
  // import time on the user snapshots.
  const isTrial = !ctx.tenant.consentedAt && !ctx.tenant.isDemo;

  const [skus, prices, openFindings, lastRun, importedUser] = await Promise.all([
    db.query.tenantSkus.findMany({ where: eq(tenantSkus.tenantId, tenantId) }),
    db.query.priceBook.findMany({ where: eq(priceBook.tenantId, tenantId) }),
    db.query.findings.findMany({
      where: and(
        eq(findings.tenantId, tenantId),
        inArray(findings.status, ["open", "acknowledged"]),
      ),
      orderBy: desc(findings.monthlyImpactCents),
    }),
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
  ]);

  // Newest 90 days, reversed into ascending order for the chart. Ascending
  // with a limit would pin the window to the oldest days ever collected.
  const history = (
    await db.query.snapshots.findMany({
      where: eq(snapshots.tenantId, tenantId),
      orderBy: desc(snapshots.day),
      limit: 90,
    })
  ).reverse();

  const priceBySku = new Map(prices.map((p) => [p.skuId, p.monthlyPriceCents]));
  const monthlySpend = skus.reduce(
    (sum, s) => sum + s.consumedUnits * (priceBySku.get(s.skuId) ?? 0),
    0,
  );
  const monthlyWaste = openFindings.reduce(
    (sum, f) => sum + f.monthlyImpactCents,
    0,
  );
  const wasteShare = monthlySpend > 0 ? (monthlyWaste / monthlySpend) * 100 : 0;
  const sortedSkus = [...skus].sort(
    (a, b) =>
      b.consumedUnits * (priceBySku.get(b.skuId) ?? 0) -
      a.consumedUnits * (priceBySku.get(a.skuId) ?? 0),
  );

  // The price book is already loaded for the spend figures, so list-price
  // detection costs no extra query. Hidden pre-sync (no rows = no figures).
  const listPricesOnly =
    prices.length > 0 && !prices.some((p) => p.source === "custom");

  // Days until the Microsoft agreement renewal; null when no date is set.
  const renewalDays = daysUntilDate(ctx.tenant.renewalDate, new Date());
  const openCount = openFindings.length;

  // Trial workspaces have no sync button, so do not tell them to run one.
  const emptyInventory = isTrial
    ? "No license data yet. Upload a fresh export to update this workspace."
    : "No license data yet. Run a sync.";

  return (
    <div className="mx-auto max-w-5xl">
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

      <section className="rise rise-2 mt-8 grid gap-px border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: "Monthly license spend",
            value: fmtMoney(monthlySpend, currency),
            sub: `${fmtNumber(
              skus.reduce((s, x) => s + x.consumedUnits, 0),
              currency,
            )} assigned seats`,
            tone: "ink",
            note: null,
          },
          {
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
          },
          {
            label: "Annualized waste",
            value: fmtMoney(monthlyWaste * 12, currency),
            sub: "if nothing changes",
            tone: "waste",
            note: null,
          },
          {
            label: "Open findings",
            value: fmtNumber(openFindings.length, currency),
            sub: `across ${ALL_RULES.length} rules`,
            tone: "ink",
            note: null,
          },
        ].map((card) => (
          <div key={card.label} className="bg-card p-5">
            <div className="text-[11px] font-medium tracking-[0.16em] text-ink-faint uppercase">
              {card.label}
            </div>
            <div
              className={`mt-2 font-display text-3xl tracking-tight ${
                card.tone === "waste" ? "text-waste-text" : "text-ink"
              }`}
            >
              {card.value}
            </div>
            <div className="mt-1 text-xs text-ink-soft">{card.sub}</div>
            {card.note && (
              <div className="mt-1 text-xs text-ink-faint">{card.note}</div>
            )}
          </div>
        ))}
      </section>

      {listPricesOnly && (
        <section className="rise rise-2 mt-6">
          <Card title="Price accuracy">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="max-w-2xl text-sm text-ink-soft">
                Your waste figures use Microsoft list prices. Enter what you
                actually pay for accurate numbers.
              </p>
              <ButtonLink href="/app/licenses">Set your prices</ButtonLink>
            </div>
          </Card>
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

      <section className="rise rise-3 mt-10">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-xs font-medium tracking-[0.18em] text-ink-faint uppercase">
            License inventory
          </h2>
          {!locked && (
            <a
              href="/api/export/licenses"
              className="text-xs text-ink-soft underline-offset-4 hover:text-ink hover:underline"
            >
              Export CSV
            </a>
          )}
        </div>

        {/* Desktop table */}
        <div className="mt-3 hidden overflow-x-auto border border-line bg-card md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] tracking-[0.14em] text-ink-faint uppercase">
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 text-right font-medium">Purchased</th>
                <th className="px-4 py-3 text-right font-medium">Assigned</th>
                <th className="px-4 py-3 text-right font-medium">Unassigned</th>
                <th className="px-4 py-3 font-medium">Utilization</th>
                <th className="px-4 py-3 text-right font-medium">Spend / mo</th>
              </tr>
            </thead>
            <tbody>
              {sortedSkus.map((s) => {
                const price = priceBySku.get(s.skuId) ?? 0;
                const free = s.prepaidEnabled - s.consumedUnits;
                return (
                  <tr
                    key={s.skuId}
                    className="border-b border-line last:border-b-0 hover:bg-canvas"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium">
                        {s.displayName ?? s.skuPartNumber}
                      </div>
                      <div className="font-mono text-[11px] text-ink-faint">
                        {s.skuPartNumber}
                      </div>
                    </td>
                    <td className="tnum px-4 py-3 text-right font-mono">
                      {fmtNumber(s.prepaidEnabled, currency)}
                    </td>
                    <td className="tnum px-4 py-3 text-right font-mono">
                      {fmtNumber(s.consumedUnits, currency)}
                    </td>
                    <td
                      className={`tnum px-4 py-3 text-right font-mono ${
                        free > 0 ? "font-medium text-waste-text" : "text-ink-faint"
                      }`}
                    >
                      {fmtNumber(free, currency)}
                    </td>
                    <td className="px-4 py-3">
                      <UtilizationBar sku={s} />
                    </td>
                    <td className="tnum px-4 py-3 text-right font-mono">
                      {fmtMoney(s.consumedUnits * price, currency)}
                    </td>
                  </tr>
                );
              })}
              {sortedSkus.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-ink-soft">
                    {emptyInventory}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile stacked cards */}
        <ul className="mt-3 flex flex-col gap-3 md:hidden">
          {sortedSkus.map((s) => {
            const price = priceBySku.get(s.skuId) ?? 0;
            const free = s.prepaidEnabled - s.consumedUnits;
            return (
              <li key={s.skuId} className="border border-line bg-card p-4">
                <div className="font-medium">
                  {s.displayName ?? s.skuPartNumber}
                </div>
                <div className="font-mono text-[11px] text-ink-faint">
                  {s.skuPartNumber}
                </div>
                <dl className="tnum mt-3 grid grid-cols-2 gap-x-6 gap-y-2 font-mono text-sm">
                  <div className="flex justify-between gap-2">
                    <dt className="font-sans text-xs text-ink-faint">Purchased</dt>
                    <dd>{fmtNumber(s.prepaidEnabled, currency)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="font-sans text-xs text-ink-faint">Assigned</dt>
                    <dd>{fmtNumber(s.consumedUnits, currency)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="font-sans text-xs text-ink-faint">Unassigned</dt>
                    <dd className={free > 0 ? "font-medium text-waste-text" : ""}>
                      {fmtNumber(free, currency)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="font-sans text-xs text-ink-faint">Spend/mo</dt>
                    <dd>{fmtMoney(s.consumedUnits * price, currency)}</dd>
                  </div>
                </dl>
                <div className="mt-3">
                  <UtilizationBar sku={s} />
                </div>
              </li>
            );
          })}
          {sortedSkus.length === 0 && (
            <li className="border border-line bg-card px-4 py-8 text-center text-sm text-ink-soft">
              {emptyInventory}
            </li>
          )}
        </ul>
      </section>

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
          {openFindings.slice(0, 6).map((f) => (
            <li
              key={f.id}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line px-4 py-3 last:border-b-0"
            >
              <div className="flex min-w-0 items-center gap-3">
                <FindingChip rule={f.rule} detail={f.detail} />
                <span className="truncate text-sm">{f.title}</span>
              </div>
              <span className="tnum shrink-0 font-mono text-sm font-medium text-waste-text">
                {f.monthlyImpactCents > 0
                  ? `${fmtMoney(f.monthlyImpactCents, currency)}/mo`
                  : "-"}
              </span>
            </li>
          ))}
          {openFindings.length === 0 && (
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
