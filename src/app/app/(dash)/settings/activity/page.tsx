import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";

import { ButtonAnchor, buttonClass } from "~/components/ui";
import { fmtDateTime } from "~/lib/format";
import { auditActionLabel, auditDetailLabel } from "~/lib/activityLabels";
import { requireAccess } from "~/server/access";
import { db } from "~/server/db";
import { auditLog } from "~/server/db/schema";
import type { AuditAction } from "~/server/types";

export const metadata: Metadata = { title: "Activity log" };
const PAGE_SIZE = 40;

const detailValue = (value: unknown): string =>
  typeof value === "string" ||
  typeof value === "number" ||
  typeof value === "boolean"
    ? String(value)
    : JSON.stringify(value);

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireAccess("admin");
  const sp = await searchParams;
  const query = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const action = typeof sp.action === "string" ? sp.action.slice(0, 80) : "";
  const where = and(
    eq(auditLog.tenantId, ctx.tenant.id),
    action ? eq(auditLog.action, action as AuditAction) : undefined,
    query
      ? or(
          ilike(auditLog.actorEmail, `%${query}%`),
          ilike(auditLog.action, `%${query}%`),
          sql`${auditLog.detail}::text ilike ${`%${query}%`}`,
        )
      : undefined,
  );
  const [count, actionRows] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(auditLog)
      .where(where)
      .then((rows) => rows[0]?.n ?? 0),
    db
      .selectDistinct({ action: auditLog.action })
      .from(auditLog)
      .where(eq(auditLog.tenantId, ctx.tenant.id))
      .orderBy(auditLog.action),
  ]);
  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const rawPage =
    typeof sp.page === "string" ? Number.parseInt(sp.page, 10) : 1;
  const page = Math.min(
    Math.max(Number.isFinite(rawPage) ? rawPage : 1, 1),
    totalPages,
  );
  const entries = await db.query.auditLog.findMany({
    where,
    orderBy: desc(auditLog.createdAt),
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });
  const pageHref = (next: number) => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (action) params.set("action", action);
    if (next > 1) params.set("page", String(next));
    return `/app/settings/activity?${params.toString()}`;
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 pb-8">
      <header className="rise rise-1 flex flex-wrap items-end justify-between gap-4">
        <div>
          <nav
            aria-label="Breadcrumb"
            className="text-ink-faint text-xs uppercase"
          >
            <Link
              href="/app/settings"
              className="hover:text-ink hover:underline"
            >
              Settings
            </Link>{" "}
            / <span aria-current="page">Activity</span>
          </nav>
          <h1 className="font-display mt-2 text-3xl tracking-tight">
            Activity log
          </h1>
          <p className="text-ink-soft mt-1 text-sm">{count} matching events.</p>
        </div>
        <ButtonAnchor href="/api/export/audit">Export audit CSV</ButtonAnchor>
      </header>

      <form className="rise rise-2 border-line bg-card grid gap-3 border p-4 sm:grid-cols-[1fr_16rem_auto] sm:items-end">
        <label className="flex flex-col gap-1 text-xs font-medium">
          Search actor or change detail
          <input
            type="search"
            name="q"
            defaultValue={query}
            autoComplete="off"
            placeholder="Email, SKU, member or value…"
            className="border-line-input bg-card min-h-11 border px-3 py-2 text-sm font-normal"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium">
          Action
          <select
            name="action"
            defaultValue={action}
            autoComplete="off"
            className="border-line-input bg-card min-h-11 border px-3 py-2 text-sm font-normal"
          >
            <option value="">All actions</option>
            {actionRows.map((row) => (
              <option key={row.action} value={row.action}>
                {auditActionLabel(row.action)}
              </option>
            ))}
          </select>
        </label>
        <button className={buttonClass("secondary")}>Apply filters</button>
      </form>

      <ol className="rise rise-2 flex flex-col gap-3">
        {entries.map((entry) => {
          const details = Object.entries(entry.detail);
          return (
            <li key={entry.id} className="border-line bg-card border p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <span className="font-medium">
                    {auditActionLabel(entry.action)}
                  </span>
                  <span className="text-ink-faint ml-2 text-xs break-all">
                    {entry.actorEmail ?? entry.actorOid}
                  </span>
                </div>
                <time className="text-ink-faint font-mono text-xs">
                  {fmtDateTime(entry.createdAt)}
                </time>
              </div>
              {details.length > 0 && (
                <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
                  {details.map(([key, value]) => (
                    <div key={key} className="min-w-0 text-xs">
                      <dt className="text-ink-faint">
                        {auditDetailLabel(key)}
                      </dt>
                      <dd className="mt-0.5 font-mono break-words">
                        {detailValue(value)}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </li>
          );
        })}
        {entries.length === 0 && (
          <li className="border-line bg-card text-ink-soft border border-dashed px-4 py-10 text-center text-sm">
            No activity matches these filters.
          </li>
        )}
      </ol>

      {count > PAGE_SIZE && (
        <nav
          aria-label="Activity pages"
          className="flex items-center justify-between gap-3"
        >
          <span className="text-ink-soft text-xs">
            Showing {(page - 1) * PAGE_SIZE + 1}–
            {Math.min(page * PAGE_SIZE, count)} of {count}
          </span>
          <div className="flex gap-2">
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
