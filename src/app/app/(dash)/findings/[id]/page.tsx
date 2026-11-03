import { and, eq } from "drizzle-orm";
import { Lightbulb } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Pill } from "~/components/ui";
import { FindingChip } from "~/components/workspace/FindingChip";
import { FindingStatusControl } from "~/components/workspace/FindingStatusControl";
import { FindingWorkflowForm } from "~/components/workspace/FindingWorkflowForm";
import { fmtDate, fmtMoney } from "~/lib/format";
import { hasRole, requireAccess } from "~/server/access";
import { db } from "~/server/db";
import { findings, memberships } from "~/server/db/schema";

export const metadata: Metadata = { title: "Finding workflow" };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const DETAIL_LABELS: Record<string, string> = {
  upn: "User",
  displayName: "Display name",
  lastActivity: "Last activity",
  copilotLastActivity: "Last Copilot activity",
  inactiveDays: "Inactive for",
  accountAgeDays: "Account age",
  purchased: "Paid seats",
  assigned: "Assigned seats",
  unassigned: "Unassigned seats",
  usersWithDisabledPlans: "Affected users",
  topDisabledPlans: "Most often disabled",
  trialSeats: "Trial seats (not counted)",
  inactiveCount: "Inactive seats",
  totalCount: "Total seats",
  hint: "Recommended next step",
  pairs: "Overlapping products",
  licenses: "Assigned products",
};

const DETAIL_ORDER = Object.keys(DETAIL_LABELS);
const detailRank = (key: string) => {
  const rank = DETAIL_ORDER.indexOf(key);
  return rank === -1 ? DETAIL_ORDER.length : rank;
};

/** Per-plan user counts, e.g. topDisabledPlans on service_plans_disabled. */
type PlanCount = { name: string; users: number };
const isPlanCounts = (value: unknown): value is PlanCount[] =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every(
    (item) =>
      item !== null &&
      typeof item === "object" &&
      typeof (item as PlanCount).name === "string" &&
      typeof (item as PlanCount).users === "number",
  );

const TECHNICAL_DETAIL_KEYS = new Set([
  "aggregate",
  "skuId",
  "skuPartNumber",
  "redundantSkuIds",
]);

const formatDetailValue = (key: string, value: unknown) => {
  if (typeof value === "number") {
    return key.endsWith("Days") ? `${value} days` : String(value);
  }
  if (typeof value === "string") {
    if (key.toLowerCase().includes("activity")) return fmtDate(value);
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object") {
          const row = item as Record<string, unknown>;
          if (typeof row.name === "string") return row.name;
          if (
            typeof row.suite === "string" &&
            typeof row.redundant === "string"
          ) {
            return `${row.redundant} is already covered by ${row.suite}`;
          }
          return JSON.stringify(row);
        }
        return String(item);
      })
      .join(", ");
  }
  return JSON.stringify(value);
};

const workflowLabel: Record<string, string> = {
  unassigned: "Not planned",
  planned: "Planned",
  requested: "Remediation requested",
  in_progress: "In progress",
};

export default async function FindingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requireAccess("viewer");
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) notFound();
  const [finding, members] = await Promise.all([
    db.query.findings.findFirst({
      where: and(eq(findings.id, id), eq(findings.tenantId, ctx.tenant.id)),
    }),
    db.query.memberships.findMany({
      where: eq(memberships.tenantId, ctx.tenant.id),
      columns: { id: true, name: true, email: true },
    }),
  ]);
  if (!finding) notFound();
  const assignee = members.find(
    (member) => member.id === finding.assigneeMembershipId,
  );
  const canEdit = hasRole(ctx, "admin") && !ctx.tenant.isDemo;
  const allDetails = Object.entries(finding.detail).filter(
    ([, value]) => value !== null && value !== undefined && value !== "",
  );
  // Stored detail is jsonb, whose key order is not the engine's: show the
  // labelled facts in a fixed order and the recommendation as a callout.
  const details = allDetails
    .filter(([key]) => !TECHNICAL_DETAIL_KEYS.has(key) && key !== "hint")
    .sort(([a], [b]) => detailRank(a) - detailRank(b));
  const hint =
    typeof finding.detail.hint === "string" && finding.detail.hint !== ""
      ? finding.detail.hint
      : null;
  const technicalDetails = allDetails.filter(([key]) =>
    TECHNICAL_DETAIL_KEYS.has(key),
  );

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 pb-8">
      <header className="rise rise-1">
        <nav
          aria-label="Breadcrumb"
          className="text-ink-faint text-xs font-medium tracking-[0.18em] uppercase"
        >
          <Link href="/app/findings" className="hover:text-ink hover:underline">
            Findings
          </Link>{" "}
          / <span aria-current="page">Workflow</span>
        </nav>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <FindingChip rule={finding.rule} detail={finding.detail} />
              <Pill tone={finding.status === "resolved" ? "moss" : "brand"}>
                {finding.status}
              </Pill>
              <Pill tone="outline">
                {workflowLabel[finding.remediationStatus] ??
                  finding.remediationStatus}
              </Pill>
            </div>
            <h1 className="font-display mt-3 text-3xl tracking-tight text-pretty">
              {finding.title}
            </h1>
          </div>
          <div className="tnum text-waste-text font-display text-3xl">
            {fmtMoney(finding.monthlyImpactCents, ctx.tenant.currency)}/mo
          </div>
        </div>
      </header>

      <section className="rise rise-2 border-line bg-card border p-5">
        <h2 className="text-ink-faint text-xs font-medium tracking-[0.16em] uppercase">
          Finding details
        </h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-ink-faint text-xs">First seen</dt>
            <dd className="mt-1 text-sm">{fmtDate(finding.firstSeenAt)}</dd>
          </div>
          <div>
            <dt className="text-ink-faint text-xs">Last seen</dt>
            <dd className="mt-1 text-sm">{fmtDate(finding.lastSeenAt)}</dd>
          </div>
          <div>
            <dt className="text-ink-faint text-xs">Assignee</dt>
            <dd className="mt-1 text-sm">
              {assignee?.name ?? assignee?.email ?? "Unassigned"}
            </dd>
          </div>
          {finding.graphUserId && (
            <div>
              <dt className="text-ink-faint text-xs">Affected user</dt>
              <dd className="mt-1 text-sm">
                <Link
                  href={`/app/users/${encodeURIComponent(finding.graphUserId)}`}
                  className="hover:text-brand-text font-medium underline underline-offset-4"
                >
                  Open user profile
                </Link>
              </dd>
            </div>
          )}
          <div>
            <dt className="text-ink-faint text-xs">Due date</dt>
            <dd className="mt-1 text-sm">{fmtDate(finding.dueDate)}</dd>
          </div>
          {finding.ticketUrl && (
            <div className="sm:col-span-2">
              <dt className="text-ink-faint text-xs">External ticket</dt>
              <dd className="mt-1 text-sm break-all">
                <a
                  href={finding.ticketUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-brand-text underline underline-offset-4"
                >
                  {finding.ticketUrl}
                </a>
              </dd>
            </div>
          )}
          {details.map(([key, value]) => (
            <div key={key} className="min-w-0">
              <dt className="text-ink-faint text-xs">
                {DETAIL_LABELS[key] ?? key.replaceAll("_", " ")}
              </dt>
              <dd className="mt-1 text-sm break-words">
                {isPlanCounts(value) ? (
                  <ul className="flex flex-col gap-1">
                    {value.map((plan) => (
                      <li
                        key={plan.name}
                        className="flex items-baseline justify-between gap-3"
                      >
                        <span className="min-w-0">{plan.name}</span>
                        <span className="tnum text-ink-faint shrink-0 text-xs">
                          {plan.users} {plan.users === 1 ? "user" : "users"}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  formatDetailValue(key, value)
                )}
              </dd>
            </div>
          ))}
          {hint && (
            <div className="border-brand/15 bg-brand-soft/60 rounded-xl border px-4 py-3.5 sm:col-span-2">
              <dt className="text-brand-deep flex items-center gap-2 text-xs font-medium">
                <Lightbulb aria-hidden="true" className="size-4 shrink-0" />
                {DETAIL_LABELS.hint}
              </dt>
              <dd className="text-ink mt-1.5 text-sm break-words">{hint}</dd>
            </div>
          )}
        </dl>
        {technicalDetails.length > 0 && (
          <details className="border-line mt-5 border-t pt-3">
            <summary className="text-ink-soft hover:text-ink inline-flex min-h-11 cursor-pointer touch-manipulation items-center text-sm font-medium">
              Technical identifiers
            </summary>
            <dl className="mt-2 grid gap-3 sm:grid-cols-2">
              {technicalDetails.map(([key, value]) => (
                <div key={key} className="min-w-0">
                  <dt className="text-ink-faint text-xs">
                    {key.replaceAll("_", " ")}
                  </dt>
                  <dd className="mt-1 font-mono text-xs break-words">
                    {formatDetailValue(key, value)}
                  </dd>
                </div>
              ))}
            </dl>
          </details>
        )}
        {finding.workflowNote && (
          <div className="border-line mt-5 border-t pt-4">
            <h3 className="text-ink-faint text-xs font-medium uppercase">
              Notes
            </h3>
            <p className="text-ink-soft mt-2 text-sm whitespace-pre-wrap">
              {finding.workflowNote}
            </p>
          </div>
        )}
      </section>

      {canEdit && finding.status !== "resolved" && (
        <section className="rise rise-3 border-line bg-card border p-5">
          <h2 className="text-ink-faint text-xs font-medium tracking-[0.16em] uppercase">
            Ownership &amp; remediation
          </h2>
          <div className="mt-4">
            <FindingWorkflowForm
              findingId={finding.id}
              initial={finding}
              members={members.map((member) => ({
                id: member.id,
                label: member.name
                  ? `${member.name} (${member.email})`
                  : member.email,
              }))}
            />
          </div>
        </section>
      )}

      {ctx.tenant.isDemo && finding.status !== "resolved" && (
        <section className="rise rise-3 border-line bg-card border p-5">
          <h2 className="text-ink-faint text-xs font-medium tracking-[0.16em] uppercase">
            Workflow preview
          </h2>
          <p className="text-ink-soft mt-2 text-sm leading-relaxed">
            In a live workspace, admins can assign an owner, set a due date, add
            an external ticket, leave notes, and move this finding through
            remediation. Demo data is read-only so you can explore safely.
          </p>
        </section>
      )}

      {canEdit && finding.status !== "resolved" && (
        <section className="rise rise-3 border-line bg-card flex flex-wrap items-center justify-between gap-4 border p-5">
          <div>
            <h2 className="font-medium">Detection status</h2>
            <p className="text-ink-soft mt-1 text-sm">
              Acknowledging keeps the finding active; a sync resolves it only
              after the waste condition disappears.
            </p>
          </div>
          <FindingStatusControl
            findingId={finding.id}
            initial={finding.status}
          />
        </section>
      )}
    </div>
  );
}
