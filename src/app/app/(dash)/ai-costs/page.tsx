import { and, desc, eq, gte, inArray } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";

import { ButtonLink, Card } from "~/components/ui";
import { SpendChart } from "~/components/workspace/SpendChart";
import { CONNECTOR_LABELS } from "~/lib/connectors";
import { fmtAgo, fmtDate, fmtMoney } from "~/lib/format";
import { hasRole, requireAccess } from "~/server/access";
import { db } from "~/server/db";
import {
  aiSpendDaily,
  saasConnections,
  syncRuns,
  tenantUsers,
} from "~/server/db/schema";
import type { SaasProvider } from "~/server/types";

export const metadata: Metadata = { title: "AI costs" };

/** The connectors that report daily API spend, in display order. */
const AI_PROVIDERS: SaasProvider[] = ["openai", "anthropic"];

/** UTC day string (yyyy-mm-dd) n days before now. aiSpendDaily buckets by UTC day. */
const dayAgo = (days: number): string =>
  new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

export default async function AiCostsPage() {
  const ctx = await requireAccess("viewer");
  const tenantId = ctx.tenant.id;
  const isAdmin = hasRole(ctx, "admin");
  // CSV/scan trials never get syncRuns rows and cannot sync connectors;
  // their freshness signal is the import time on the user snapshots.
  const isTrial = !ctx.tenant.consentedAt && !ctx.tenant.isDemo;

  const [rows, aiConns, lastRun, importedUser] = await Promise.all([
    db.query.aiSpendDaily.findMany({
      where: and(
        eq(aiSpendDaily.tenantId, tenantId),
        gte(aiSpendDaily.day, dayAgo(90)),
      ),
      orderBy: aiSpendDaily.day,
    }),
    db.query.saasConnections.findMany({
      where: and(
        eq(saasConnections.tenantId, tenantId),
        inArray(saasConnections.provider, AI_PROVIDERS),
      ),
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

  const monthPrefix = new Date().toISOString().slice(0, 7);
  const cutoff30 = dayAgo(30);
  const providers = AI_PROVIDERS.filter((p) =>
    rows.some((r) => r.provider === p),
  );

  const totalFor = (
    provider: SaasProvider,
    inWindow: (day: string) => boolean,
  ) =>
    rows
      .filter((r) => r.provider === provider && inWindow(r.day))
      .reduce((sum, r) => sum + r.amountCents, 0);

  const statCards = providers.flatMap((p) => [
    {
      label: `${CONNECTOR_LABELS[p]} this month`,
      value: fmtMoney(totalFor(p, (d) => d.startsWith(monthPrefix)), "USD"),
      sub: "calendar month, UTC",
    },
    {
      label: `${CONNECTOR_LABELS[p]} last 30 days`,
      value: fmtMoney(totalFor(p, (d) => d >= cutoff30), "USD"),
      sub: "rolling window",
    },
  ]);

  // One chart series per provider: spend summed across categories per day.
  const series = providers.map((p) => ({
    label: CONNECTOR_LABELS[p],
    points: [
      ...rows
        .filter((r) => r.provider === p)
        .reduce(
          (m, r) => m.set(r.day, (m.get(r.day) ?? 0) + r.amountCents),
          new Map<string, number>(),
        ),
    ].map(([day, cents]) => ({ day, cents })),
  }));

  // Top categories by last-30-day total across providers; the rest is "Other".
  const byCategory = new Map<
    string,
    { provider: SaasProvider; category: string; cents: number }
  >();
  for (const r of rows) {
    if (r.day < cutoff30) continue;
    const key = `${r.provider}:${r.category}`;
    const entry = byCategory.get(key);
    if (entry) entry.cents += r.amountCents;
    else
      byCategory.set(key, {
        provider: r.provider,
        category: r.category,
        cents: r.amountCents,
      });
  }
  const categories = [...byCategory.values()].sort((a, b) => b.cents - a.cents);
  const topCategories = categories.slice(0, 8);
  const otherCents = categories.slice(8).reduce((sum, c) => sum + c.cents, 0);

  return (
    <div className="mx-auto max-w-5xl">
      <header className="rise rise-1">
        <h1 className="font-display text-3xl tracking-tight">AI costs</h1>
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
      </header>

      {rows.length === 0 && aiConns.length === 0 ? (
        <section className="rise rise-2 mt-8">
          <Card title="Connect an AI provider">
            <div className="flex flex-col gap-4">
              <p className="max-w-2xl text-sm text-ink-soft">
                Connect OpenAI or Anthropic to see what your organization
                spends on their APIs: daily totals by model and line item,
                exactly as billed. The same connector correlates console
                members against Entra ID, so departed people who still hold
                live API keys surface as findings.
              </p>
              {isTrial ? (
                <>
                  <p className="max-w-2xl text-sm text-ink-soft">
                    Connect your Microsoft 365 tenant first, then add the AI
                    connectors.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <ButtonLink href="/app/connect">
                      Connect the read-only sync
                    </ButtonLink>
                  </div>
                </>
              ) : !isAdmin ? (
                <p className="max-w-2xl text-sm text-ink-soft">
                  Connecting needs an admin. Ask a workspace admin to connect{" "}
                  <Link
                    href="/app/settings/openai"
                    className="underline underline-offset-4 hover:text-ink"
                  >
                    OpenAI
                  </Link>{" "}
                  or{" "}
                  <Link
                    href="/app/settings/anthropic"
                    className="underline underline-offset-4 hover:text-ink"
                  >
                    Anthropic
                  </Link>
                  .
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <ButtonLink href="/app/settings/openai">
                    Connect OpenAI
                  </ButtonLink>
                  <ButtonLink href="/app/settings/anthropic">
                    Connect Anthropic
                  </ButtonLink>
                </div>
              )}
            </div>
          </Card>
        </section>
      ) : rows.length === 0 ? (
        <section className="rise rise-2 mt-8">
          <Card title="Connection">
            <p className="text-sm text-ink-soft">
              Connected. The first sync brings in the provider&apos;s cost
              history.
            </p>
          </Card>
        </section>
      ) : (
        <>
          <section className="rise rise-2 mt-8 grid gap-px border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
            {statCards.map((card) => (
              <div key={card.label} className="bg-card p-5">
                <div className="text-[11px] font-medium tracking-[0.16em] text-ink-faint uppercase">
                  {card.label}
                </div>
                <div className="mt-2 font-display text-3xl tracking-tight">
                  {card.value}
                </div>
                <div className="mt-1 text-xs text-ink-soft">{card.sub}</div>
              </div>
            ))}
          </section>

          <SpendChart series={series} />

          <section className="rise rise-4 mt-10">
            <h2 className="text-xs font-medium tracking-[0.18em] text-ink-faint uppercase">
              Top cost categories
            </h2>
            <div className="mt-3 overflow-x-auto border border-line bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] tracking-[0.14em] text-ink-faint uppercase">
                    <th className="px-4 py-3 font-medium">Category</th>
                    <th className="px-4 py-3 font-medium">Provider</th>
                    <th className="px-4 py-3 text-right font-medium">
                      Last 30 days
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {topCategories.map((c) => (
                    <tr
                      key={`${c.provider}:${c.category}`}
                      className="border-b border-line last:border-b-0 hover:bg-canvas"
                    >
                      <td className="px-4 py-3 font-medium">{c.category}</td>
                      <td className="px-4 py-3 text-ink-soft">
                        {CONNECTOR_LABELS[c.provider]}
                      </td>
                      <td className="tnum px-4 py-3 text-right font-mono">
                        {fmtMoney(c.cents, "USD")}
                      </td>
                    </tr>
                  ))}
                  {otherCents > 0 && (
                    <tr className="border-b border-line last:border-b-0 hover:bg-canvas">
                      <td className="px-4 py-3 text-ink-soft">Other</td>
                      <td className="px-4 py-3 text-ink-faint">-</td>
                      <td className="tnum px-4 py-3 text-right font-mono">
                        {fmtMoney(otherCents, "USD")}
                      </td>
                    </tr>
                  )}
                  {topCategories.length === 0 && (
                    <tr>
                      <td
                        colSpan={3}
                        className="px-4 py-8 text-center text-ink-soft"
                      >
                        No spend in the last 30 days.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <p className="rise rise-4 mt-8 mb-8 text-xs text-ink-faint">
        Billed by the providers in USD. Shown as billed, never converted to
        your workspace currency.
      </p>
    </div>
  );
}
