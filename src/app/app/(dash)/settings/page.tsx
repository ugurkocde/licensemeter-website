import { asc, desc, eq } from "drizzle-orm";
import Link from "next/link";

import { CurrencySelect } from "~/components/workspace/CurrencySelect";
import { DangerZone } from "~/components/workspace/DangerZone";
import { DomainJoinControl } from "~/components/workspace/DomainJoinControl";
import { EmailPreferenceToggle } from "~/components/workspace/EmailPreferenceToggle";
import { InactiveDaysForm } from "~/components/workspace/InactiveDaysForm";
import { InviteForm } from "~/components/workspace/InviteForm";
import { JoinRequestActions } from "~/components/workspace/JoinRequestActions";
import { LeakAlertsToggle } from "~/components/workspace/LeakAlertsToggle";
import { MemberActions } from "~/components/workspace/MemberActions";
import { MonthlyReportToggle } from "~/components/workspace/MonthlyReportToggle";
import { ReplayTourButton } from "~/components/workspace/ReplayTourButton";
import { RoleSelect } from "~/components/workspace/RoleSelect";
import { SharedNotificationAddress } from "~/components/workspace/SharedNotificationAddress";
import { Card, Pill } from "~/components/ui";
import { env } from "~/env";
import {
  BLOCK_REASON_LABELS,
  deliveryLabel,
  EMAIL_JOB_LABELS,
} from "~/lib/emailDeliveryLabels";
import { fmtDate, fmtDateTime, workspaceLabel } from "~/lib/format";
import { ROLE_DESCRIPTION } from "~/lib/roles";
import { hasRole, inviteExpiry, requireAccess } from "~/server/access";
import { db } from "~/server/db";
import {
  auditLog,
  emailBlocks,
  emailDeliveries,
  memberships,
  syncRuns,
} from "~/server/db/schema";
import { holdsJoinableDomain, pendingJoinRequests } from "~/server/domainJoin";
import { emailEnabled } from "~/server/email";
import { loadSharedAddress } from "~/server/notificationAddress";
import { syncStepLabel } from "~/lib/activityLabels";

const Capability = ({
  ok,
  label,
  okText,
  warnText,
  hint,
}: {
  ok: boolean | null;
  label: string;
  okText: string;
  warnText: string;
  hint?: string;
}) => (
  <div className="flex items-start gap-3 py-2">
    <span
      aria-hidden="true"
      className={`mt-1 inline-block size-2 shrink-0 rounded-full ${
        ok === null ? "bg-line-strong" : ok ? "bg-moss" : "bg-gold"
      }`}
    />
    <div>
      <div className="text-sm font-medium">{label}</div>
      <div className="text-ink-soft text-sm">
        {ok === null ? "Unknown: run a sync" : ok ? okText : warnText}
      </div>
      {ok === false && hint && (
        <div className="text-ink-faint mt-1 max-w-xl text-xs">{hint}</div>
      )}
    </div>
  </div>
);

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const ctx = await requireAccess("viewer");
  const isAdmin = hasRole(ctx, "admin");
  const isOwner = hasRole(ctx, "owner");
  // Workspace settings are read-only in the shared demo: an admin role there is
  // granted to every visitor, so editable controls would mutate shared state.
  const canEdit = isAdmin && !ctx.tenant.isDemo;
  const inviteEmailsActive = emailEnabled() && !ctx.tenant.isDemo;

  const [
    members,
    runs,
    activity,
    joinRequests,
    joinByDomain,
    deliveries,
    blocks,
    sharedAddress,
  ] = await Promise.all([
    db.query.memberships.findMany({
      where: eq(memberships.tenantId, ctx.tenant.id),
    }),
    db.query.syncRuns.findMany({
      where: eq(syncRuns.tenantId, ctx.tenant.id),
      orderBy: desc(syncRuns.startedAt),
      limit: 8,
    }),
    isAdmin
      ? db.query.auditLog.findMany({
          where: eq(auditLog.tenantId, ctx.tenant.id),
          orderBy: desc(auditLog.createdAt),
          limit: 30,
        })
      : Promise.resolve([]),
    // Access requests and the "Who can join" setting are for owners and
    // admins only. Domain join runs for the one workspace colleagues are
    // matched to (connected to their Microsoft tenant, or holding their
    // company email domain); elsewhere the control would do nothing, so it
    // is not shown.
    isAdmin && !ctx.tenant.isDemo
      ? pendingJoinRequests(db, ctx.tenant.id)
      : Promise.resolve([]),
    isAdmin ? holdsJoinableDomain(db, ctx.tenant) : Promise.resolve(false),
    // Email delivery names recipients, so it is for owners and admins only.
    canEdit
      ? db.query.emailDeliveries.findMany({
          where: eq(emailDeliveries.tenantId, ctx.tenant.id),
          orderBy: desc(emailDeliveries.createdAt),
          limit: 8,
        })
      : Promise.resolve([]),
    canEdit
      ? db.query.emailBlocks.findMany({
          where: eq(emailBlocks.tenantId, ctx.tenant.id),
          orderBy: asc(emailBlocks.email),
        })
      : Promise.resolve([]),
    // The shared notification address names a mailbox, so it stays with the
    // owners and admins of a real workspace.
    canEdit ? loadSharedAddress(ctx.tenant.id) : Promise.resolve(null),
  ]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 pb-8">
      <header className="rise rise-1">
        <h1 className="font-display text-3xl tracking-tight">Settings</h1>
      </header>

      <div className="rise rise-2 flex flex-col gap-6">
        <Card title="Workspace">
          <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-ink-faint">Organization</dt>
              <dd className="mt-0.5 font-medium">
                {ctx.tenant.name ?? "Unknown"}
              </dd>
            </div>
            <div>
              <dt className="text-ink-faint">Tenant ID</dt>
              <dd className="mt-0.5 font-mono text-xs">
                {ctx.tenant.tid ?? "Not connected to Microsoft yet"}
              </dd>
            </div>
            <div>
              <dt className="text-ink-faint">Connected since</dt>
              <dd className="mt-0.5">
                {!ctx.tenant.consentedAt && !ctx.tenant.isDemo
                  ? "Imported workspace, not connected yet"
                  : fmtDate(ctx.tenant.consentedAt)}
              </dd>
            </div>
            <div className="border-line mt-2 border-t pt-4 sm:col-span-2">
              <h3 className="text-ink-faint text-[11px] font-medium tracking-[0.16em] uppercase">
                Data &amp; detection
              </h3>
            </div>
            <div>
              <dt className="text-ink-faint">Currency</dt>
              <dd className="mt-0.5">
                {canEdit ? (
                  <CurrencySelect value={ctx.tenant.currency} />
                ) : (
                  ctx.tenant.currency
                )}
              </dd>
            </div>
            <div>
              <dt className="text-ink-faint">Inactivity threshold</dt>
              <dd className="mt-0.5">
                {canEdit ? (
                  <InactiveDaysForm value={ctx.tenant.inactiveDays} />
                ) : (
                  `${ctx.tenant.inactiveDays} days`
                )}
              </dd>
            </div>
            <div>
              <dt className="text-ink-faint">Contract renewals</dt>
              <dd className="mt-0.5">
                <Link
                  href="/app/renewals"
                  className="hover:text-ink underline underline-offset-4"
                >
                  Manage renewal calendar
                </Link>
              </dd>
            </div>
            <div className="border-line mt-2 border-t pt-4 sm:col-span-2">
              <h3 className="text-ink-faint text-[11px] font-medium tracking-[0.16em] uppercase">
                Notifications &amp; product experience
              </h3>
            </div>
            <div>
              <dt className="text-ink-faint">Leak alert emails</dt>
              <dd className="mt-0.5">
                {canEdit ? (
                  <LeakAlertsToggle initial={ctx.tenant.leakAlerts} />
                ) : ctx.tenant.leakAlerts ? (
                  "On"
                ) : (
                  "Off"
                )}
              </dd>
            </div>
            <div>
              <dt className="text-ink-faint">Monthly PDF report</dt>
              <dd className="mt-0.5">
                {canEdit ? (
                  <MonthlyReportToggle initial={ctx.tenant.monthlyReport} />
                ) : ctx.tenant.monthlyReport ? (
                  "On"
                ) : (
                  "Off"
                )}
              </dd>
            </div>
            <div>
              <dt className="text-ink-faint">Product tour</dt>
              <dd className="mt-0.5">
                <ReplayTourButton storageId={ctx.membership.id} />
              </dd>
            </div>
            {canEdit && (
              <>
                <div className="border-line mt-2 border-t pt-4 sm:col-span-2">
                  <h3 className="text-ink-faint text-[11px] font-medium tracking-[0.16em] uppercase">
                    Email me
                  </h3>
                  <p className="text-ink-soft mt-1 text-sm">
                    Your own copy for this workspace, sent to{" "}
                    {ctx.membership.email}. Other admins decide for themselves.
                  </p>
                </div>
                <div>
                  <dt className="sr-only">Weekly digest email</dt>
                  <dd>
                    <EmailPreferenceToggle
                      job="digest"
                      label="Weekly digest"
                      initial={!ctx.membership.digestOptOut}
                    />
                  </dd>
                </div>
                <div>
                  <dt className="sr-only">Monthly report email</dt>
                  <dd>
                    <EmailPreferenceToggle
                      job="report"
                      label="Monthly report"
                      initial={!ctx.membership.reportOptOut}
                    />
                    {!ctx.tenant.monthlyReport && (
                      <p className="text-ink-faint mt-1 text-xs">
                        Applies once the monthly PDF report is on for this
                        workspace.
                      </p>
                    )}
                  </dd>
                </div>
              </>
            )}
          </dl>
        </Card>

        {canEdit && (
          <Card title="Shared notification address">
            <SharedNotificationAddress
              verifiedEmail={
                sharedAddress?.verifiedAt ? sharedAddress.email : null
              }
              pendingEmail={sharedAddress?.pendingEmail ?? null}
              pendingExpires={
                sharedAddress?.tokenExpiresAt
                  ? fmtDateTime(sharedAddress.tokenExpiresAt)
                  : null
              }
              digest={sharedAddress?.digest ?? true}
              report={sharedAddress?.report ?? true}
              leakAlerts={sharedAddress?.leakAlerts ?? true}
            />
          </Card>
        )}

        {canEdit && (
          <Card title="Email delivery">
            <p className="text-ink-soft text-sm">
              {env.RESEND_WEBHOOK_SECRET
                ? "The weekly digest, the monthly report and leak alerts, with what the mail provider reported back."
                : "Delivery tracking is not available on this installation. Sent only means the mail provider accepted the message, not that it arrived."}
            </p>
            {deliveries.length === 0 ? (
              <p className="text-ink-soft mt-3 text-sm">No emails sent yet.</p>
            ) : (
              <ul className="mt-3 flex flex-col">
                {deliveries.map((d) => (
                  <li
                    key={d.id}
                    className="border-line flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-b py-2 text-sm last:border-b-0"
                  >
                    <span className="min-w-0">
                      <span className="font-medium">
                        {EMAIL_JOB_LABELS[d.job]}
                      </span>
                      <span className="text-ink-faint ml-2 text-xs break-all">
                        {d.recipient}
                      </span>
                    </span>
                    <span className="text-ink-soft text-xs">
                      {deliveryLabel(d)}
                      <span className="text-ink-faint ml-2 font-mono text-[11px] whitespace-nowrap">
                        {fmtDateTime(
                          d.deliveryEventAt ?? d.sentAt ?? d.createdAt,
                        )}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {blocks.length > 0 && (
              <div className="border-line mt-4 border-t pt-4">
                <h3 className="text-sm font-medium">Blocked addresses</h3>
                <p className="text-ink-faint mt-0.5 text-xs">
                  LicenseMeter no longer sends the digest, the report or leak
                  alerts to these addresses, because the mail provider reported
                  a permanent failure.
                </p>
                <ul className="mt-1 flex flex-col">
                  {blocks.map((b) => (
                    <li
                      key={b.email}
                      className="border-line flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-b py-2 text-sm last:border-b-0"
                    >
                      <span className="min-w-0 font-medium break-all">
                        {b.email}
                      </span>
                      <span className="text-ink-soft text-xs">
                        {BLOCK_REASON_LABELS[b.reason]}
                        <span className="text-ink-faint ml-2 font-mono text-[11px] whitespace-nowrap">
                          {fmtDate(b.createdAt)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        )}

        <Card title="Detection capabilities">
          <Capability
            ok={ctx.tenant.hasP1}
            label="Entra ID P1 sign-in activity"
            okText="Per-user last sign-in is available."
            warnText="No Entra ID P1/P2, falling back to usage-report activity."
            hint="Without P1, inactivity detection uses workload reports only, which is slightly less precise."
          />
          <Capability
            ok={
              ctx.tenant.concealedNames === null
                ? null
                : !ctx.tenant.concealedNames
            }
            label="Identifiable usage reports"
            okText="Usage reports include user names. Per-user findings enabled."
            warnText="Report names are concealed (Microsoft default since 2021); usage-based findings are aggregate only."
            hint="A Global Admin can change this in Microsoft 365 admin center > Settings > Org settings > Reports (the change is audit-logged)."
          />
          <Capability
            ok={
              ctx.tenant.copilotSignal === null
                ? null
                : ctx.tenant.copilotSignal !== "none"
            }
            label="Copilot usage data"
            okText="Copilot usage report is readable."
            warnText="No Copilot usage data found (no Copilot licenses, or the report is unavailable)."
          />
        </Card>

        <Card title="Sync history">
          {runs.length === 0 ? (
            <p className="text-ink-soft text-sm">No syncs yet.</p>
          ) : (
            <>
              <ul className="flex flex-col gap-2">
                {runs.map((run) => (
                  <li
                    key={run.id}
                    className="border-line flex flex-wrap items-center justify-between gap-2 border-b pb-2 text-sm last:border-b-0 last:pb-0"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        aria-hidden="true"
                        className={`inline-block size-2 rounded-full ${
                          run.status === "success"
                            ? "bg-moss"
                            : run.status === "running"
                              ? "bg-gold motion-safe:animate-pulse"
                              : run.status === "partial"
                                ? "bg-gold"
                                : "bg-danger"
                        }`}
                      />
                      <span className="font-medium capitalize">
                        {run.status}
                      </span>
                      <span className="text-ink-faint">
                        {fmtDateTime(run.startedAt)}
                      </span>
                    </div>
                    <div className="text-ink-soft min-w-0 font-mono text-[11px] break-words">
                      {run.steps
                        .map(
                          (s) =>
                            `${syncStepLabel(s.step)}${s.count !== undefined ? `: ${s.count}` : ""}${
                              s.status === "ok" ? "" : ` · ${s.status}`
                            }`,
                        )
                        .join(" · ") ||
                        (run.error ?? "")}
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-3 text-right">
                <Link
                  href="/app/settings/sync-history"
                  className="text-ink hover:text-brand-text text-xs font-medium underline-offset-4 hover:underline"
                >
                  View all runs →
                </Link>
              </div>
            </>
          )}
        </Card>

        <Card title="Members">
          <ul className="flex flex-col">
            {members.map((m) => (
              <li
                key={m.id}
                className="border-line flex items-center justify-between gap-3 border-b py-2.5 text-sm last:border-b-0"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">
                    {m.name ?? m.email}
                    {m.id === ctx.membership.id && (
                      <span className="text-ink-faint ml-2 text-xs">(you)</span>
                    )}
                  </div>
                  <div className="text-ink-faint truncate text-xs">
                    {m.email}
                    {/* No object id and no earlier sign-in: an open invite. */}
                    {!m.oid &&
                      !m.workosUserId &&
                      (inviteExpiry(m.createdAt) < new Date()
                        ? " · invite expired"
                        : ` · invited, expires ${fmtDate(inviteExpiry(m.createdAt))}`)}
                    {/* A member from before sign-in moved to Microsoft. */}
                    {!m.oid &&
                      m.workosUserId &&
                      " · has not signed in with Microsoft yet"}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {isAdmin &&
                  !ctx.tenant.isDemo &&
                  m.id !== ctx.membership.id &&
                  (m.role !== "owner" || isOwner) ? (
                    <RoleSelect
                      membershipId={m.id}
                      role={m.role}
                      allowOwner={isOwner}
                    />
                  ) : (
                    <Pill tone="slate" title={ROLE_DESCRIPTION[m.role]}>
                      {m.role}
                    </Pill>
                  )}
                  {isAdmin && !ctx.tenant.isDemo && (
                    <MemberActions
                      membershipId={m.id}
                      canResend={!m.oid && !m.workosUserId}
                      canRemove={m.id !== ctx.membership.id}
                    />
                  )}
                </div>
              </li>
            ))}
          </ul>

          {joinRequests.length > 0 && (
            <div className="border-line mt-4 border-t pt-4">
              <h3 className="text-sm font-medium">Access requests</h3>
              <p className="text-ink-faint mt-0.5 text-xs">
                Colleagues who signed in with a verified company email. Approved
                people start as viewer.
              </p>
              <ul className="mt-1 flex flex-col">
                {joinRequests.map((r) => (
                  <li
                    key={r.id}
                    className="border-line flex items-center justify-between gap-3 border-b py-2.5 text-sm last:border-b-0"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">
                        {r.name ?? r.email}
                      </div>
                      <div className="text-ink-faint truncate text-xs">
                        {r.email} · asked {fmtDate(r.createdAt)}
                      </div>
                    </div>
                    <div className="shrink-0">
                      <JoinRequestActions requestId={r.id} email={r.email} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {joinByDomain && ctx.tenant.domain && (
            <DomainJoinControl
              domain={ctx.tenant.domain}
              initial={ctx.tenant.domainJoinMode}
              canEdit={isOwner}
            />
          )}

          {isAdmin && !ctx.tenant.isDemo && (
            <InviteForm
              allowOwner={isOwner}
              inviteEmailsActive={inviteEmailsActive}
            />
          )}
          {ctx.tenant.isDemo && (
            <p className="text-ink-faint mt-3 text-xs">
              Members are fixed in the demo workspace.
            </p>
          )}
        </Card>

        {isAdmin && (
          <Card title="Activity">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-ink-soft text-sm">Recent workspace changes.</p>
              <div className="flex gap-3 text-xs">
                <Link
                  href="/app/settings/activity"
                  className="hover:text-ink underline"
                >
                  Full activity log
                </Link>
                <a
                  href="/api/export/audit"
                  className="hover:text-ink underline"
                >
                  Export CSV
                </a>
              </div>
            </div>
            {activity.length === 0 ? (
              <p className="text-ink-soft text-sm">No activity recorded yet.</p>
            ) : (
              <ul className="flex flex-col">
                {activity.map((entry) => (
                  <li
                    key={entry.id}
                    className="border-line flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-b py-2 text-sm last:border-b-0"
                  >
                    <span className="min-w-0">
                      <span className="font-medium">
                        {entry.action.replaceAll("_", " ")}
                      </span>
                      <span className="text-ink-faint ml-2 text-xs break-all">
                        {entry.actorEmail ?? entry.actorOid}
                      </span>
                    </span>
                    <span className="text-ink-faint font-mono text-[11px] whitespace-nowrap">
                      {fmtDateTime(entry.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-ink-faint mt-3 text-xs">
              Exports, price changes, membership and sync actions. Kept with the
              workspace, deleted with it.
            </p>
          </Card>
        )}

        {isOwner && !ctx.tenant.isDemo && (
          <DangerZone tenantName={workspaceLabel(ctx.tenant)} />
        )}
        {ctx.tenant.isDemo && (
          <p className="text-ink-faint text-xs">
            This is the demo workspace: synthetic data, refreshed on every sync.
            Connect a real tenant from a Microsoft sign-in to see your own
            numbers.
          </p>
        )}
      </div>
    </div>
  );
}
