import { and, desc, eq, gte, inArray } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";

import { ButtonLink, Card } from "~/components/ui";
import { SpendChart } from "~/components/workspace/SpendChart";
import { SyncNowButton } from "~/components/workspace/SyncNowButton";
import {
  SyncStatusPanel,
  SyncStatusProvider,
  SyncStatusText,
} from "~/components/workspace/SyncStatus";
import { CONNECTOR_LABELS } from "~/lib/connectors";
import { fmtAgo, fmtDate, fmtMoney } from "~/lib/format";
import { syncStatusRun } from "~/lib/syncStatusRun";
import { hasRole, requireAccess } from "~/server/access";
import { db } from "~/server/db";
import {
  aiSpendDaily,
  saasConnections,
  syncRuns,
  tenantUsers,
} from "~/server/db/schema";
import type { SaasProvider } from "~/server/types";
import {
  AI_PREVIEW_PROVIDERS,
  getAiPreview,
  shouldPreviewAi,
} from "~/server/demo/aiPreview";
import { AiSampleNotice } from "~/components/workspace/AiSampleNotice";

export const metadata: Metadata = { title: "AI costs" };

/** The connectors that report daily API spend, in display order. */
const AI_PROVIDERS: SaasProvider[] = ["openai", "anthropic"];

/** UTC day string (yyyy-mm-dd) n days before now. aiSpendDaily buckets by UTC day. */
const dayAgo = (days: number): string =>
  new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

export default async function AiCostsPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>;
}) {
  const ctx = await requireAccess("viewer");
  const tenantId = ctx.tenant.id;
  const isAdmin = hasRole(ctx, "admin");
  // CSV/scan imports never get syncRuns rows and cannot sync connectors;
  // their freshness signal is the import time on the user snapshots.
  const isImported = !ctx.tenant.consentedAt && !ctx.tenant.isDemo;

  const [storedRows, aiConns, lastRun, importedUser] = await Promise.all([
    db.query.aiSpendDaily.findMany({
      where: and(
        eq(aiSpendDaily.tenantId, tenantId),
        gte(aiSpendDaily.day, dayAgo(90)),
      ),
      orderBy: aiSpendDaily.day,
      // Only the fields the page reduces over; skip ids/timestamps.
      columns: { provider: true, day: true, category: true, amountCents: true },
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
    isImported
      ? db.query.tenantUsers.findFirst({
          where: eq(tenantUsers.tenantId, tenantId),
          orderBy: desc(tenantUsers.syncedAt),
        })
      : Promise.resolve(undefined),
  ]);

  const isPreview = shouldPreviewAi({
    isDemo: ctx.tenant.isDemo,
    requested: (await searchParams).preview === "sample",
    hasConnection: aiConns.length > 0,
    hasData: storedRows.length > 0,
  });
  const rows = isPreview
    ? (await Promise.all(AI_PREVIEW_PROVIDERS.map(getAiPreview))).flatMap(
        (p) => p.spend,
      )
    : storedRows;

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

  const perProviderCards = providers.flatMap((p) => [
    {
      label: `${CONNECTOR_LABELS[p]} this month`,
      value: fmtMoney(
        totalFor(p, (d) => d.startsWith(monthPrefix)),
        "USD",
      ),
      sub: "calendar month, UTC",
    },
    {
      label: `${CONNECTOR_LABELS[p]} last 30 days`,
      value: fmtMoney(
        totalFor(p, (d) => d >= cutoff30),
        "USD",
      ),
      sub: "rolling window",
    },
  ]);

  // Combined headline totals across every connected provider, so the page
  // answers "what do we spend on AI?" without summing the cards by hand. Only
  // shown when more than one provider is connected (otherwise it duplicates the
  // single provider's cards).
  const totalCards =
    providers.length > 1
      ? [
          {
            label: "Total AI spend this month",
            value: fmtMoney(
              providers.reduce(
                (s, p) => s + totalFor(p, (d) => d.startsWith(monthPrefix)),
                0,
              ),
              "USD",
            ),
            sub: "all providers, calendar month",
          },
          {
            label: "Total AI spend last 30 days",
            value: fmtMoney(
              providers.reduce(
                (s, p) => s + totalFor(p, (d) => d >= cutoff30),
                0,
              ),
              "USD",
            ),
            sub: "all providers, rolling window",
          },
        ]
      : [];
  const statCards = [...totalCards, ...perProviderCards];

  // Surface a partial sync (some steps degraded) like the Overview header does.
  const degradedSteps =
    lastRun?.steps.filter(
      (s) => s.status === "warning" || s.status === "failed",
    ).length ?? 0;
  // Admins on a connected workspace with sync enabled get a manual sync, matching the
  // Overview header.
  const canSync = !isPreview && isAdmin && Boolean(ctx.tenant.consentedAt);

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
      <SyncStatusProvider
        initialRun={isPreview ? null : syncStatusRun(lastRun)}
      >
        <header className="rise rise-1 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl tracking-tight">AI costs</h1>
            <p className="text-ink-soft mt-1 text-sm">
              <SyncStatusText>
                {isPreview
                  ? "Explore 60 days of sample OpenAI and Anthropic usage"
                  : lastRun?.status === "running"
                    ? "Sync running…"
                    : isImported
                      ? `Imported ${fmtDate(importedUser?.syncedAt ?? null)}`
                      : `Last synced ${fmtAgo(lastRun?.finishedAt ?? null)}`}
                {!isPreview && lastRun?.status === "failed" && (
                  <span className="text-danger-text ml-2">
                    (last sync failed)
                  </span>
                )}
                {!isPreview && lastRun?.status === "partial" && (
                  <span className="text-gold-text ml-2">
                    (completed with warnings
                    {degradedSteps > 0
                      ? ` · ${degradedSteps} ${degradedSteps === 1 ? "step" : "steps"} degraded`
                      : ""}
                    )
                  </span>
                )}
              </SyncStatusText>
            </p>
          </div>
          {canSync && rows.length > 0 && <SyncNowButton />}
        </header>
        <SyncStatusPanel className="rise mt-5" />
      </SyncStatusProvider>

      {isPreview && (
        <>
          <AiSampleNotice
            exitHref={ctx.tenant.isDemo ? undefined : "/app/ai-costs"}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {AI_PREVIEW_PROVIDERS.map((provider) => (
              <ButtonLink
                key={provider}
                href={`/app/connectors/${provider}${ctx.tenant.isDemo ? "" : "?preview=sample"}`}
              >
                Explore {CONNECTOR_LABELS[provider]} sample
              </ButtonLink>
            ))}
          </div>
        </>
      )}

      {rows.length === 0 && aiConns.length === 0 ? (
        <section className="rise rise-2 mt-8">
          <Card title="Connect an AI provider">
            <div className="flex flex-col gap-4">
              <div>
                <ButtonLink
                  href="/app/ai-costs?preview=sample"
                  variant="secondary"
                >
                  Preview sample data
                </ButtonLink>
              </div>
              <p className="text-ink-soft max-w-2xl text-sm">
                Connect OpenAI or Anthropic to see what your organization spends
                on their APIs: daily totals by model and line item, exactly as
                billed. The same connector correlates console members against
                Entra ID, so departed people who still hold live API keys
                surface as findings.
              </p>
              {isImported ? (
                <>
                  <p className="text-ink-soft max-w-2xl text-sm">
                    Connect your Microsoft 365 tenant first, then add the AI
                    connectors.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <ButtonLink href="/app/connectors/microsoft">
                      Connect the read-only sync
                    </ButtonLink>
                  </div>
                </>
              ) : !isAdmin ? (
                <p className="text-ink-soft max-w-2xl text-sm">
                  Connecting needs an admin. Ask a workspace admin to connect{" "}
                  <Link
                    href="/app/connectors/openai"
                    className="hover:text-ink underline underline-offset-4"
                  >
                    OpenAI
                  </Link>{" "}
                  or{" "}
                  <Link
                    href="/app/connectors/anthropic"
                    className="hover:text-ink underline underline-offset-4"
                  >
                    Anthropic
                  </Link>
                  .
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <ButtonLink href="/app/connectors/openai">
                    Connect OpenAI
                  </ButtonLink>
                  <ButtonLink href="/app/connectors/anthropic">
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
            <div className="flex flex-col gap-3">
              <p className="text-ink-soft text-sm">
                Connected. The first sync brings in each provider&apos;s cost
                history.
              </p>
              <ul className="flex flex-col gap-1 text-sm">
                {aiConns.map((c) => (
                  <li
                    key={c.provider}
                    className="text-ink-soft flex flex-wrap items-center justify-between gap-2"
                  >
                    <Link
                      href={`/app/connectors/${c.provider}`}
                      className="text-ink font-medium underline-offset-4 hover:underline"
                    >
                      {CONNECTOR_LABELS[c.provider] ?? c.provider}
                    </Link>
                    <span className="text-ink-faint text-xs">
                      {c.lastSyncAt
                        ? `last sync ${fmtDate(c.lastSyncAt)} (${c.lastSyncStatus ?? "pending"})`
                        : "first sync pending"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        </section>
      ) : (
        <>
          <section
            className={`rise rise-2 border-line bg-line mt-8 grid gap-px border sm:grid-cols-2 ${statCards.length > 4 ? "lg:grid-cols-3" : ""}`}
          >
            {statCards.map((card) => (
              <div key={card.label} className="bg-card p-5">
                <div className="text-ink-faint text-[11px] font-medium tracking-[0.16em] uppercase">
                  {card.label}
                </div>
                <div className="tnum font-display mt-2 text-3xl tracking-tight">
                  {card.value}
                </div>
                <div className="text-ink-soft mt-1 text-xs">{card.sub}</div>
              </div>
            ))}
          </section>

          <SpendChart series={series} sample={isPreview} />

          <section className="rise rise-4 mt-10">
            <h2 className="text-ink-faint text-xs font-medium tracking-[0.18em] uppercase">
              Top cost categories
            </h2>
            {/* Desktop table */}
            <div className="border-line bg-card mt-3 hidden overflow-x-auto border md:block">
              <table className="w-full text-sm">
                <caption className="sr-only">
                  Top AI cost categories over the last 30 days, in USD
                  {isPreview ? " (sample data)" : ""}.
                </caption>
                <thead>
                  <tr className="border-line text-ink-faint border-b text-left text-[11px] tracking-[0.14em] uppercase">
                    <th scope="col" className="px-4 py-3 font-medium">
                      Category
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Provider
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-right font-medium"
                    >
                      Last 30 days
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {topCategories.map((c) => (
                    <tr
                      key={`${c.provider}:${c.category}`}
                      className="border-line hover:bg-canvas border-b last:border-b-0"
                    >
                      <td className="px-4 py-3 font-medium">{c.category}</td>
                      <td className="text-ink-soft px-4 py-3">
                        {CONNECTOR_LABELS[c.provider]}
                      </td>
                      <td className="tnum px-4 py-3 text-right font-mono">
                        {fmtMoney(c.cents, "USD")}
                      </td>
                    </tr>
                  ))}
                  {otherCents > 0 && (
                    <tr className="border-line hover:bg-canvas border-b last:border-b-0">
                      <td className="text-ink-soft px-4 py-3">Other</td>
                      <td className="text-ink-faint px-4 py-3">-</td>
                      <td className="tnum px-4 py-3 text-right font-mono">
                        {fmtMoney(otherCents, "USD")}
                      </td>
                    </tr>
                  )}
                  {topCategories.length === 0 && (
                    <tr>
                      <td
                        colSpan={3}
                        className="text-ink-soft px-4 py-8 text-center"
                      >
                        No spend in the last 30 days.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile stacked cards */}
            <ul className="mt-3 flex flex-col gap-3 md:hidden">
              {topCategories.map((c) => (
                <li
                  key={`${c.provider}:${c.category}`}
                  className="border-line bg-card flex items-center justify-between gap-3 border p-4"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{c.category}</div>
                    <div className="text-ink-soft text-xs">
                      {CONNECTOR_LABELS[c.provider]}
                    </div>
                  </div>
                  <span className="tnum shrink-0 font-mono text-sm">
                    {fmtMoney(c.cents, "USD")}
                  </span>
                </li>
              ))}
              {otherCents > 0 && (
                <li className="border-line bg-card flex items-center justify-between gap-3 border p-4">
                  <span className="text-ink-soft">Other</span>
                  <span className="tnum shrink-0 font-mono text-sm">
                    {fmtMoney(otherCents, "USD")}
                  </span>
                </li>
              )}
              {topCategories.length === 0 && (
                <li className="border-line bg-card text-ink-soft border px-4 py-8 text-center text-sm">
                  No spend in the last 30 days.
                </li>
              )}
            </ul>
          </section>
        </>
      )}

      <p className="rise rise-4 text-ink-faint mt-8 mb-8 text-xs">
        {isPreview
          ? "Illustrative amounts in USD for demonstration only. These are not actual charges."
          : "Billed by the providers in USD. Shown as billed, never converted to your workspace currency."}
      </p>
    </div>
  );
}
