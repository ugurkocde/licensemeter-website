import { desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";

import { CopyScriptButton } from "~/components/workspace/CopyScriptButton";
import { FindingChip } from "~/components/workspace/FindingChip";
import {
  CheckboxHitArea,
  FindingsBulkForm,
  SelectAllFindings,
} from "~/components/workspace/FindingsSelectionBar";
import { ButtonAnchor, Pill, buttonClass } from "~/components/ui";
import { fmtDate, fmtMoney } from "~/lib/format";
import { ALL_RULES, isWasteRule, RULE_META } from "~/lib/rules";
import { hasRole, requireAccess } from "~/server/access";
import { bulkSetFindingStatus, setFindingStatus } from "~/server/actions";
import { db } from "~/server/db";
import { findings } from "~/server/db/schema";
import type { FindingStatus } from "~/server/types";

export const metadata: Metadata = { title: "Findings" };

const PAGE_SIZE = 50;

type FindingRow = typeof findings.$inferSelect;

const StatusPill = ({ status }: { status: FindingStatus }) => (
  <Pill
    tone={status === "open" ? "brand" : status === "acknowledged" ? "outline" : "moss"}
  >
    {status}
  </Pill>
);

/**
 * Desktop rows live inside the bulk form, so the per-row action uses
 * formAction (nested forms are invalid HTML); mobile cards get their own form.
 */
const AckButton = ({
  finding,
  standalone = false,
}: {
  finding: FindingRow;
  standalone?: boolean;
}) => {
  const toggle = async () => {
    "use server";
    await setFindingStatus(
      finding.id,
      finding.status === "open" ? "acknowledged" : "open",
    );
  };
  const button = (
    <button
      {...(standalone ? {} : { formAction: toggle })}
      className={buttonClass("micro")}
    >
      {finding.status === "open" ? "Acknowledge" : "Reopen"}
    </button>
  );
  return standalone ? <form action={toggle}>{button}</form> : button;
};

export default async function FindingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireAccess("viewer");
  const sp = await searchParams;
  const ruleParam = typeof sp.rule === "string" && isWasteRule(sp.rule) ? sp.rule : null;
  const showResolved = sp.show === "resolved";
  const isAdmin = hasRole(ctx, "admin");
  const currency = ctx.tenant.currency;

  const allRows = await db.query.findings.findMany({
    where: eq(findings.tenantId, ctx.tenant.id),
    orderBy: desc(findings.monthlyImpactCents),
  });

  const activeRows = allRows.filter((f) => f.status !== "resolved");
  const rows = (showResolved ? allRows.filter((f) => f.status === "resolved") : activeRows).filter(
    (f) => !ruleParam || f.rule === ruleParam,
  );

  const totalByRule = new Map<string, { count: number; impact: number }>();
  for (const f of activeRows) {
    const agg = totalByRule.get(f.rule) ?? { count: 0, impact: 0 };
    agg.count += 1;
    agg.impact += f.monthlyImpactCents;
    totalByRule.set(f.rule, agg);
  }
  const shownImpact = rows.reduce((s, f) => s + f.monthlyImpactCents, 0);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRaw = typeof sp.page === "string" ? parseInt(sp.page, 10) : 1;
  const page = Math.min(
    Math.max(Number.isFinite(pageRaw) ? pageRaw : 1, 1),
    totalPages,
  );
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const filterHref = (rule: string | null, resolved = false, pageNo = 1) => {
    const params = new URLSearchParams();
    if (rule) params.set("rule", rule);
    if (resolved) params.set("show", "resolved");
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

  const emptyMessage = showResolved
    ? "No resolved findings yet."
    : ruleParam
      ? "No findings match this filter."
      : "No open findings. Nothing to reclaim right now.";

  return (
    <div className="mx-auto max-w-5xl">
      <header className="rise rise-1 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl tracking-tight">Findings</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {showResolved
              ? `${rows.length} resolved findings`
              : `${rows.length} findings worth ${fmtMoney(shownImpact, currency)}/mo`}
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

      <nav aria-label="Finding filters" className="rise rise-2 mt-8 flex flex-wrap gap-2">
        <Link
          href={filterHref(null)}
          aria-current={!ruleParam && !showResolved ? "true" : undefined}
          className={`relative px-3 py-1.5 text-xs font-medium after:absolute after:inset-x-0 after:-inset-y-2 after:content-[''] ${
            !ruleParam && !showResolved
              ? "bg-ink text-canvas"
              : "border border-line bg-card text-ink-soft hover:border-ink"
          }`}
        >
          All active ({activeRows.length})
        </Link>
        {visibleRules.map((rule) => {
          const agg = totalByRule.get(rule);
          return (
            <Link
              key={rule}
              href={filterHref(rule)}
              aria-current={
                ruleParam === rule && !showResolved ? "true" : undefined
              }
              className={`relative px-3 py-1.5 text-xs font-medium after:absolute after:inset-x-0 after:-inset-y-2 after:content-[''] ${
                ruleParam === rule && !showResolved
                  ? "bg-ink text-canvas"
                  : "border border-line bg-card text-ink-soft hover:border-ink"
              }`}
            >
              {RULE_META[rule].short} ({agg?.count ?? 0})
            </Link>
          );
        })}
        <Link
          href={filterHref(null, true)}
          aria-current={showResolved ? "true" : undefined}
          className={`relative px-3 py-1.5 text-xs font-medium after:absolute after:inset-x-0 after:-inset-y-2 after:content-[''] ${
            showResolved
              ? "bg-ink text-canvas"
              : "border border-line bg-card text-ink-soft hover:border-ink"
          }`}
        >
          Resolved
        </Link>
      </nav>

      {/* Desktop table (one form: row checkboxes + bulk action) */}
      <FindingsBulkForm
        action={bulkSetFindingStatus}
        showBar={isAdmin && !showResolved && rows.length > 0}
      >
        <div className="overflow-x-auto border border-line bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[11px] tracking-[0.14em] text-ink-faint uppercase">
              {isAdmin && !showResolved && (
                <th scope="col" className="w-8 px-3 py-3">
                  <SelectAllFindings />
                </th>
              )}
              <th scope="col" className="px-4 py-3 font-medium">Rule</th>
              <th scope="col" className="px-4 py-3 font-medium">Finding</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                Impact / mo
              </th>
              <th scope="col" className="px-4 py-3 font-medium">First seen</th>
              <th scope="col" className="px-4 py-3 font-medium">Status</th>
              {isAdmin && !showResolved && (
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
                  className="border-b border-line align-top last:border-b-0 hover:bg-canvas"
                >
                  {isAdmin && !showResolved && (
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
                      {f.graphUserId ? (
                        <Link
                          href={`/app/users/${f.graphUserId}`}
                          className="underline-offset-4 hover:underline"
                        >
                          {f.title}
                        </Link>
                      ) : (
                        f.title
                      )}
                    </div>
                    {detail.upn && (
                      <div className="mt-0.5 font-mono text-[11px] text-ink-faint">
                        {detail.upn}
                      </div>
                    )}
                  </td>
                  <td className="tnum px-4 py-3 text-right font-mono font-medium text-waste-text">
                    {f.monthlyImpactCents > 0
                      ? fmtMoney(f.monthlyImpactCents, currency)
                      : "-"}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-ink-soft">
                    {fmtDate(f.firstSeenAt)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={f.status} />
                  </td>
                  {isAdmin && !showResolved && (
                    <td className="px-4 py-3 text-right">
                      <AckButton finding={f} />
                    </td>
                  )}
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={isAdmin && !showResolved ? 7 : 5}
                  className="px-4 py-10 text-center text-ink-soft"
                >
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </FindingsBulkForm>

      {/* Mobile stacked cards */}
      <ul className="rise rise-3 mt-5 mb-8 flex flex-col gap-3 md:hidden">
        {pageRows.map((f) => {
          const detail = f.detail as { upn?: string };
          return (
            <li key={f.id} className="border border-line bg-card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <FindingChip rule={f.rule} detail={f.detail} />
                <StatusPill status={f.status} />
              </div>
              <div className="mt-2 text-sm font-medium">{f.title}</div>
              {detail.upn && (
                <div className="mt-0.5 font-mono text-[11px] text-ink-faint">
                  {detail.upn}
                </div>
              )}
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="text-xs text-ink-soft">
                  First seen {fmtDate(f.firstSeenAt)}
                </span>
                <span className="tnum font-mono text-sm font-medium text-waste-text">
                  {f.monthlyImpactCents > 0
                    ? `${fmtMoney(f.monthlyImpactCents, currency)}/mo`
                    : "-"}
                </span>
              </div>
              {isAdmin && !showResolved && (
                <div className="mt-3 border-t border-line pt-3">
                  <AckButton finding={f} standalone />
                </div>
              )}
            </li>
          );
        })}
        {rows.length === 0 && (
          <li className="border border-line bg-card px-4 py-10 text-center text-sm text-ink-soft">
            {emptyMessage}
          </li>
        )}
      </ul>

      {rows.length > PAGE_SIZE && (
        <nav
          aria-label="Findings pages"
          className="-mt-4 mb-8 flex flex-wrap items-center justify-between gap-3"
        >
          <span className="tnum text-xs text-ink-soft">
            Showing {(page - 1) * PAGE_SIZE + 1} to{" "}
            {Math.min(page * PAGE_SIZE, rows.length)} of {rows.length}
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
