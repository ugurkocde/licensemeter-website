import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { CircleCheck, Search, SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CopyScriptButton } from "~/components/workspace/CopyScriptButton";
import { EmptyState } from "~/components/workspace/EmptyState";
import { FindingChip } from "~/components/workspace/FindingChip";
import { FindingStatusControl } from "~/components/workspace/FindingStatusControl";
import {
  CheckboxHitArea,
  FindingsBulkForm,
  SelectAllFindings,
} from "~/components/workspace/FindingsSelectionBar";
import { PriceAccuracyCard } from "~/components/workspace/PriceAccuracyCard";
import { ButtonAnchor, Pill, buttonClass } from "~/components/ui";
import { fmtDate, fmtMoney } from "~/lib/format";
import { calculatePriceCoverage } from "~/lib/priceCoverage";
import { ALL_RULES, isWasteRule, RULE_META } from "~/lib/rules";
import { hasRole, requireAccess } from "~/server/access";
import { bulkSetFindingStatus } from "~/server/actions";
import { db } from "~/server/db";
import { findings, priceBook } from "~/server/db/schema";
import type { FindingStatus } from "~/server/types";

export const metadata: Metadata = { title: "Findings" };

const PAGE_SIZE = 25;

type FindingRow = typeof findings.$inferSelect;

const StatusPill = ({ status }: { status: FindingStatus }) => (
  <Pill
    tone={
      status === "open"
        ? "brand"
        : status === "acknowledged"
          ? "outline"
          : "moss"
    }
  >
    {status}
  </Pill>
);

const workflowLabel: Record<FindingRow["remediationStatus"], string> = {
  unassigned: "Not planned",
  planned: "Planned",
  requested: "Requested",
  in_progress: "In progress",
};

export default async function FindingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireAccess("viewer");
  const sp = await searchParams;
  const ruleParam =
    typeof sp.rule === "string" && isWasteRule(sp.rule) ? sp.rule : null;
  const showResolved = sp.show === "resolved";
  const query = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const sort =
    sp.sort === "newest" || sp.sort === "oldest" || sp.sort === "status"
      ? sp.sort
      : "impact";
  const isAdmin = hasRole(ctx, "admin");
  const canAct = isAdmin;
  const currency = ctx.tenant.currency;

  // Status + rule filtering, counts and pagination all run in Postgres so a
  // large tenant never streams every finding into the page. Active findings are
  // open or acknowledged; resolved is a separate view.
  const statusFilter = showResolved
    ? eq(findings.status, "resolved")
    : inArray(findings.status, ["open", "acknowledged"]);
  const listWhere = and(
    eq(findings.tenantId, ctx.tenant.id),
    statusFilter,
    ruleParam ? eq(findings.rule, ruleParam) : undefined,
    query
      ? or(
          ilike(findings.title, `%${query}%`),
          sql`coalesce(${findings.detail}->>'upn', '') ilike ${`%${query}%`}`,
        )
      : undefined,
  );

  // Per-rule active counts drive the filter chips (which always link to the
  // active view), and the headline total/impact for the current filtered set.
  const [activeAgg, totals, prices] = await Promise.all([
    db
      .select({ rule: findings.rule, count: sql<number>`count(*)::int` })
      .from(findings)
      .where(
        and(
          eq(findings.tenantId, ctx.tenant.id),
          inArray(findings.status, ["open", "acknowledged"]),
        ),
      )
      .groupBy(findings.rule),
    db
      .select({
        total: sql<number>`count(*)::int`,
        impact: sql<number>`coalesce(sum(${findings.monthlyImpactCents}), 0)::int`,
      })
      .from(findings)
      .where(listWhere)
      .then((r) => r[0] ?? { total: 0, impact: 0 }),
    db.query.priceBook.findMany({
      where: eq(priceBook.tenantId, ctx.tenant.id),
      columns: { source: true, monthlyPriceCents: true },
    }),
  ]);

  const priceCoverage = calculatePriceCoverage(
    prices.map((price) => ({
      seats: 1,
      priceCents: price.monthlyPriceCents,
      source: price.source,
    })),
  );

  const totalByRule = new Map<string, { count: number }>();
  for (const r of activeAgg) totalByRule.set(r.rule, { count: r.count });
  const activeTotal = activeAgg.reduce((s, r) => s + r.count, 0);
  const rowCount = totals.total;
  const shownImpact = totals.impact;

  const totalPages = Math.max(1, Math.ceil(rowCount / PAGE_SIZE));
  const pageRaw = typeof sp.page === "string" ? parseInt(sp.page, 10) : 1;
  const page = Math.min(
    Math.max(Number.isFinite(pageRaw) ? pageRaw : 1, 1),
    totalPages,
  );
  const pageRows = await db.query.findings.findMany({
    where: listWhere,
    orderBy:
      sort === "newest"
        ? [desc(findings.firstSeenAt), desc(findings.monthlyImpactCents)]
        : sort === "oldest"
          ? [asc(findings.firstSeenAt), desc(findings.monthlyImpactCents)]
          : sort === "status"
            ? [asc(findings.status), desc(findings.monthlyImpactCents)]
            : [desc(findings.monthlyImpactCents), desc(findings.firstSeenAt)],
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });

  const filterHref = (
    rule: string | null,
    resolved = false,
    pageNo = 1,
    queryValue = query,
  ) => {
    const params = new URLSearchParams();
    if (rule) params.set("rule", rule);
    if (resolved) params.set("show", "resolved");
    if (queryValue) params.set("q", queryValue);
    if (sort !== "impact") params.set("sort", sort);
    if (pageNo > 1) params.set("page", String(pageNo));
    const qs = params.toString();
    return `/app/findings${qs ? `?${qs}` : ""}`;
  };
  const pageHref = (pageNo: number) =>
    filterHref(ruleParam, showResolved, pageNo);

  /** Hide zero-count rule chips, but keep an active zero-count filter escapable. */
  const visibleRules = ALL_RULES.filter(
    (rule) => (totalByRule.get(rule)?.count ?? 0) > 0 || rule === ruleParam,
  );

  const filterClass = (selected: boolean) =>
    `inline-flex min-h-11 touch-manipulation items-center rounded-full px-3 py-2 text-xs font-medium transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 ${
      selected
        ? "bg-ink text-canvas"
        : "border border-line bg-card text-ink-soft hover:border-ink hover:text-ink"
    }`;
  const renderFilterLinks = () => (
    <>
      <Link
        href={filterHref(null)}
        aria-current={!ruleParam && !showResolved ? "page" : undefined}
        className={filterClass(!ruleParam && !showResolved)}
      >
        All active ({activeTotal})
      </Link>
      {!showResolved &&
        visibleRules.map((rule) => {
          const agg = totalByRule.get(rule);
          return (
            <Link
              key={rule}
              href={filterHref(rule)}
              aria-current={ruleParam === rule ? "page" : undefined}
              className={filterClass(ruleParam === rule)}
            >
              {RULE_META[rule].short} ({agg?.count ?? 0})
            </Link>
          );
        })}
      <Link
        href={filterHref(null, true)}
        aria-current={showResolved ? "page" : undefined}
        className={filterClass(showResolved)}
      >
        Resolved
      </Link>
    </>
  );

  const activeFilterLabel = showResolved
    ? "Resolved"
    : ruleParam
      ? RULE_META[ruleParam].short
      : "All active";

  const empty = query
    ? { icon: SearchX, heading: "No findings match your search." }
    : showResolved
      ? { icon: CircleCheck, heading: "No resolved findings yet." }
      : ruleParam
        ? { icon: SearchX, heading: "No findings match this filter." }
        : {
            icon: CircleCheck,
            heading: "No open findings.",
            subtext: "Nothing to reclaim right now.",
          };

  return (
    <div className="mx-auto max-w-5xl">
      <header className="rise rise-1 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl tracking-tight">Findings</h1>
          <p className="text-ink-soft mt-1 text-sm">
            {showResolved
              ? `${rowCount} resolved findings`
              : `${rowCount} findings worth ${fmtMoney(shownImpact, currency)}/mo`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <>
              <CopyScriptButton
                url={`/api/export/remediation${ruleParam ? `?rule=${ruleParam}` : ""}`}
              />
              <ButtonAnchor
                href={`/api/export/remediation${ruleParam ? `?rule=${ruleParam}` : ""}`}
              >
                Download .ps1
              </ButtonAnchor>
            </>
          )}
          <ButtonAnchor href="/api/export/findings">Export CSV</ButtonAnchor>
        </div>
      </header>

      <div className="rise rise-2 bg-canvas sticky top-[3.75rem] z-10 -mx-2 mt-6 space-y-3 px-2 py-2 md:static md:mx-0 md:mt-8 md:p-0">
        <form
          role="search"
          className="flex flex-col gap-2 sm:flex-row sm:items-center"
        >
          {ruleParam && <input type="hidden" name="rule" value={ruleParam} />}
          {showResolved && <input type="hidden" name="show" value="resolved" />}
          <label htmlFor="finding-search" className="sr-only">
            Search findings by title or email
          </label>
          <div className="relative min-w-0 flex-1">
            <Search
              aria-hidden="true"
              className="text-ink-faint pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            />
            <input
              id="finding-search"
              name="q"
              type="search"
              defaultValue={query}
              autoComplete="off"
              spellCheck={false}
              placeholder="Search by finding or email…"
              className="border-line-input bg-card text-ink placeholder:text-ink-faint focus-visible:border-brand focus-visible:ring-brand/30 min-h-11 w-full rounded-xl border py-2 pr-3 pl-10 text-sm focus-visible:ring-2"
            />
          </div>
          <label className="sr-only" htmlFor="finding-sort">
            Sort findings
          </label>
          <select
            id="finding-sort"
            name="sort"
            defaultValue={sort}
            autoComplete="off"
            className="border-line-input bg-card text-ink min-h-11 rounded-xl border px-3 py-2 text-sm"
          >
            <option value="impact">Highest impact</option>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="status">Status</option>
          </select>
          <button type="submit" className={buttonClass("secondary")}>
            Search findings
          </button>
          {query && (
            <Link
              href={filterHref(ruleParam, showResolved, 1, "")}
              className="text-ink-soft hover:text-ink focus-visible:ring-brand inline-flex min-h-11 touch-manipulation items-center justify-center px-2 text-sm font-medium underline-offset-4 hover:underline focus-visible:ring-2"
            >
              Clear search
            </Link>
          )}
        </form>

        <details className="border-line bg-card rounded-xl border md:hidden">
          <summary className="text-ink flex min-h-11 cursor-pointer touch-manipulation items-center justify-between gap-3 px-4 py-2 text-sm font-medium">
            Filters
            <span className="text-ink-soft text-xs font-normal">
              {activeFilterLabel}
            </span>
          </summary>
          <nav
            aria-label="Finding filters"
            className="border-line flex flex-wrap gap-2 border-t p-3"
          >
            {renderFilterLinks()}
          </nav>
        </details>
        <nav
          aria-label="Finding filters"
          className="hidden flex-wrap gap-2 md:flex"
        >
          {renderFilterLinks()}
        </nav>
      </div>

      {!priceCoverage.complete && priceCoverage.totalProducts > 0 && (
        <section className="rise rise-3 mt-5">
          <PriceAccuracyCard coverage={priceCoverage} />
        </section>
      )}

      {/* Desktop table (one form: row checkboxes + bulk action) */}
      <FindingsBulkForm
        action={bulkSetFindingStatus}
        showBar={canAct && !showResolved && rowCount > 0}
      >
        <div className="border-line bg-card overflow-x-auto border">
          <table className="w-full text-sm">
            <caption className="sr-only">
              {showResolved
                ? `${rowCount} resolved findings`
                : `${rowCount} active findings worth ${fmtMoney(shownImpact, currency)} per month${ruleParam ? `, filtered to ${RULE_META[ruleParam].label}` : ""}`}
            </caption>
            <thead>
              <tr className="border-line text-ink-faint border-b text-left text-[11px] tracking-[0.14em] uppercase">
                {canAct && !showResolved && (
                  <th scope="col" className="w-8 px-3 py-3">
                    <SelectAllFindings />
                  </th>
                )}
                <th scope="col" className="px-4 py-3 font-medium">
                  Rule
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Finding
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  Impact / mo
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  First seen
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Status
                </th>
                {canAct && !showResolved && (
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    Action
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((f) => {
                const detail = f.detail as { upn?: string };
                return (
                  <tr
                    key={f.id}
                    className="border-line hover:bg-canvas border-b align-top last:border-b-0"
                  >
                    {canAct && !showResolved && (
                      <td className="px-3 py-3">
                        <CheckboxHitArea>
                          <input
                            type="checkbox"
                            name="id"
                            value={f.id}
                            aria-label={`Select ${f.title}`}
                          />
                        </CheckboxHitArea>
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <FindingChip rule={f.rule} detail={f.detail} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">
                        <Link
                          href={`/app/findings/${f.id}`}
                          className="underline-offset-4 hover:underline"
                        >
                          {f.title}
                        </Link>
                      </div>
                      {detail.upn &&
                        (f.graphUserId ? (
                          <Link
                            href={`/app/users/${encodeURIComponent(f.graphUserId)}`}
                            className="text-ink-faint hover:text-ink mt-0.5 inline-flex min-h-8 items-center font-mono text-[11px] underline-offset-4 hover:underline"
                          >
                            {detail.upn} · user profile
                          </Link>
                        ) : (
                          <div className="text-ink-faint mt-0.5 font-mono text-[11px]">
                            {detail.upn}
                          </div>
                        ))}
                    </td>
                    <td className="tnum text-waste-text px-4 py-3 text-right font-mono font-medium">
                      {f.monthlyImpactCents > 0
                        ? fmtMoney(f.monthlyImpactCents, currency)
                        : "-"}
                    </td>
                    <td className="text-ink-soft px-4 py-3 whitespace-nowrap">
                      {fmtDate(f.firstSeenAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-1.5">
                        <StatusPill status={f.status} />
                        {f.remediationStatus !== "unassigned" && (
                          <Pill tone="outline">
                            {workflowLabel[f.remediationStatus]}
                          </Pill>
                        )}
                      </div>
                    </td>
                    {canAct && !showResolved && (
                      <td className="px-4 py-3 text-right">
                        <FindingStatusControl
                          findingId={f.id}
                          initial={
                            f.status === "acknowledged"
                              ? "acknowledged"
                              : "open"
                          }
                        />
                      </td>
                    )}
                  </tr>
                );
              })}
              {rowCount === 0 && (
                <tr>
                  <td colSpan={canAct && !showResolved ? 7 : 5}>
                    <EmptyState icon={empty.icon} heading={empty.heading}>
                      {empty.subtext}
                    </EmptyState>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </FindingsBulkForm>

      {/* Mobile stacked cards: own bulk form so multi-select works on phones. */}
      <FindingsBulkForm
        action={bulkSetFindingStatus}
        showBar={canAct && !showResolved && rowCount > 0}
        className="rise rise-3 mt-5 mb-8 md:hidden"
      >
        {canAct && !showResolved && rowCount > 0 && (
          <div className="text-ink-soft mb-2 flex items-center gap-2 text-sm">
            <SelectAllFindings />
            <span>Select all on this page</span>
          </div>
        )}
        <ul className="flex flex-col gap-3">
          {pageRows.map((f) => {
            const detail = f.detail as { upn?: string };
            return (
              <li key={f.id} className="border-line bg-card border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  {canAct && !showResolved && (
                    <CheckboxHitArea>
                      <input
                        type="checkbox"
                        name="id"
                        value={f.id}
                        aria-label={`Select ${f.title}`}
                      />
                    </CheckboxHitArea>
                  )}
                  <FindingChip rule={f.rule} detail={f.detail} />
                  <StatusPill status={f.status} />
                </div>
                <div className="mt-2 text-sm font-medium">
                  <Link
                    href={`/app/findings/${f.id}`}
                    className="underline-offset-4 hover:underline"
                  >
                    {f.title}
                  </Link>
                </div>
                {detail.upn &&
                  (f.graphUserId ? (
                    <Link
                      href={`/app/users/${encodeURIComponent(f.graphUserId)}`}
                      className="text-ink-faint hover:text-ink mt-1 inline-flex min-h-8 items-center font-mono text-[11px] underline-offset-4 hover:underline"
                    >
                      {detail.upn} · user profile
                    </Link>
                  ) : (
                    <div className="text-ink-faint mt-0.5 font-mono text-[11px]">
                      {detail.upn}
                    </div>
                  ))}
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="text-ink-soft text-xs">
                    First seen {fmtDate(f.firstSeenAt)}
                  </span>
                  <span className="tnum text-waste-text font-mono text-sm font-medium">
                    {f.monthlyImpactCents > 0
                      ? `${fmtMoney(f.monthlyImpactCents, currency)}/mo`
                      : "-"}
                  </span>
                </div>
                {canAct && !showResolved && (
                  <div className="border-line mt-3 border-t pt-3">
                    <FindingStatusControl
                      findingId={f.id}
                      initial={
                        f.status === "acknowledged" ? "acknowledged" : "open"
                      }
                    />
                  </div>
                )}
              </li>
            );
          })}
          {rowCount === 0 && (
            <li className="border-line bg-card border">
              <EmptyState icon={empty.icon} heading={empty.heading}>
                {empty.subtext}
              </EmptyState>
            </li>
          )}
        </ul>
      </FindingsBulkForm>

      {rowCount > PAGE_SIZE && (
        <nav
          aria-label="Findings pages"
          className="-mt-4 mb-8 flex flex-wrap items-center justify-between gap-3"
        >
          <span className="tnum text-ink-soft text-xs">
            Showing {(page - 1) * PAGE_SIZE + 1} to{" "}
            {Math.min(page * PAGE_SIZE, rowCount)} of {rowCount}
          </span>
          <div className="flex items-center gap-2">
            {page > 1 && (
              <Link href={pageHref(page - 1)} className={buttonClass("micro")}>
                ← Previous
              </Link>
            )}
            {page < totalPages && (
              <Link href={pageHref(page + 1)} className={buttonClass("micro")}>
                Next →
              </Link>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}
