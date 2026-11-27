import { and, eq, exists, isNotNull, isNull } from "drizzle-orm";

import { siteUrl } from "~/env";
import { workspaceLabel } from "~/lib/format";
import { getBranding } from "~/server/billing/branding";
import { db } from "~/server/db";
import {
  findings,
  reportRecipients,
  tenants,
  tenantSkus,
  type TenantRow,
} from "~/server/db/schema";
import { withTenant } from "~/server/db/tenant";
import { execReportHtml } from "~/server/email";
import { deliverOnce } from "~/server/emailDelivery";
import { reportMonthKey } from "~/server/emailPeriods";
import { hasFeature } from "~/server/entitlement";
import { loadEntitlement } from "~/server/entitlementStore";
import { notifyOps } from "~/server/ops";
import { opsErrorText } from "~/server/opsError";
import { loadExecutiveSummary } from "~/server/report/executiveData";
import {
  perMonth,
  perYear,
  renewalsTotal,
} from "~/server/report/executiveFormat";
import type { ExecutiveSummary } from "~/server/report/executiveSummary";
import { reportFilename } from "~/server/report/filename";
import {
  deliverableRecipients,
  recipientUnsubscribeUrl,
} from "~/server/report/recipients";
import { renderExecutiveReportPdf } from "~/server/report/renderExecutive";
import {
  JOB_BUDGET_MS,
  type JobOptions,
  type JobTotals,
} from "~/server/scheduledEmails";

/**
 * Monthly executive report to finance: on the 1st, every confirmed finance
 * recipient of a Pro or MSP workspace gets the one-page executive savings
 * report as a PDF attachment. Separate from the IT admins' monthly waste
 * report, which is unchanged. Same delivery rules as the scheduled emails:
 * one message per recipient with its own one-click unsubscribe link and
 * List-Unsubscribe headers, claimed in the delivery ledger first (job
 * "exec_report", keyed by the reported month), blocked addresses skipped and
 * a time budget, so running it again never mails anyone twice.
 *
 * A workspace whose plan no longer includes the executive report sends
 * nothing; its recipients stay listed so an admin can remove them.
 */

export type ExecReportJobTotals = JobTotals & {
  /** Workspaces with recipients whose plan has no executive report. */
  skippedNoPlan: number;
  /** Workspaces whose run threw before every recipient was tried. */
  failedTenants: number;
};

const MONTH_LABEL = new Intl.DateTimeFormat("en-GB", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** "November 2026" for the ledger's "2026-11". */
export const execMonthLabel = (periodKey: string): string =>
  MONTH_LABEL.format(new Date(`${periodKey}-01T00:00:00Z`));

/** The cover note's figure rows. Every one comes from the summary. */
export const execReportRows = (
  s: ExecutiveSummary,
): { label: string; value: string }[] => [
  { label: "License spend", value: perMonth(s.spend.monthlyCents, s.currency) },
  { label: "Open waste", value: perMonth(s.waste.monthlyCents, s.currency) },
  ...(s.savings
    ? [
        {
          label: "Realized savings run rate",
          value: perYear(s.savings.annualRunRateCents, s.currency),
        },
      ]
    : []),
  {
    label: `Renewal actions in the next ${s.renewals.windowDays} days`,
    value: `${s.renewals.count} (${renewalsTotal(s)})`,
  },
];

const emptyTotals = (tenantCount: number): ExecReportJobTotals => ({
  tenants: tenantCount,
  sent: 0,
  skippedAlreadySent: 0,
  skippedOptedOut: 0,
  skippedBlocked: 0,
  failed: 0,
  unprocessedTenants: 0,
  skippedNoPlan: 0,
  failedTenants: 0,
});

type Built = {
  subject: string;
  rows: { label: string; value: string }[];
  attachment: { filename: string; content: string };
};

const reportForTenant = async (
  tenant: TenantRow,
  now: Date,
  periodKey: string,
  totals: ExecReportJobTotals,
): Promise<void> => {
  const entitlement = await loadEntitlement(tenant, now);
  if (!hasFeature(entitlement, "execReport")) {
    totals.skippedNoPlan++;
    return;
  }
  const [recipients, anySku, anyFinding] = await Promise.all([
    deliverableRecipients(tenant.id, "finance"),
    // Never mail a report of nothing but zeros, like the monthly report.
    db.query.tenantSkus.findFirst({
      where: eq(tenantSkus.tenantId, tenant.id),
      columns: { skuId: true },
    }),
    db.query.findings.findFirst({
      where: eq(findings.tenantId, tenant.id),
      columns: { id: true },
    }),
  ]);
  if (recipients.length === 0 || (!anySku && !anyFinding)) return;

  let built: Promise<Built> | undefined;
  const build = async (): Promise<Built> => {
    const [summary, branding] = await withTenant(db, tenant.id, () =>
      Promise.all([
        loadExecutiveSummary(tenant, entitlement, now),
        getBranding(tenant, entitlement),
      ]),
    );
    const pdf = await renderExecutiveReportPdf(summary, branding);
    return {
      subject: `Executive savings report for ${execMonthLabel(periodKey)}: ${workspaceLabel(tenant)}`,
      rows: execReportRows(summary),
      attachment: {
        // Named after the reported month, like the subject.
        filename: reportFilename(
          tenant,
          new Date(`${periodKey}-01T00:00:00Z`),
          "executive-report",
        ),
        content: pdf.toString("base64"),
      },
    };
  };

  for (const recipient of recipients) {
    const outcome = await deliverOnce(
      {
        tenantId: tenant.id,
        job: "exec_report",
        periodKey,
        recipient: recipient.email,
      },
      async () => {
        const message = await (built ??= build());
        const unsubscribeUrl = recipientUnsubscribeUrl(recipient.id, "finance");
        return {
          subject: message.subject,
          html: execReportHtml({
            tenantName: workspaceLabel(tenant),
            month: execMonthLabel(periodKey),
            rows: message.rows,
            appUrl: siteUrl(),
            unsubscribeUrl,
          }),
          headers: {
            "List-Unsubscribe": `<${unsubscribeUrl}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
          attachments: [message.attachment],
        };
      },
    );
    totals[outcome]++;
  }
};

/**
 * Monthly run, the day after the IT admins' report. Safe to repeat at any
 * time: the ledger holds one row per workspace, month and recipient.
 */
export const runExecReportJob = async (
  opts: JobOptions = {},
): Promise<ExecReportJobTotals> => {
  const clock = opts.clock ?? Date.now;
  const budgetMs = opts.budgetMs ?? JOB_BUDGET_MS;
  const start = clock();
  const now = opts.now ?? new Date();
  const periodKey = reportMonthKey(now);
  // Only workspaces with at least one confirmed, subscribed finance
  // recipient; the demo workspace never emails anyone outside it.
  const candidates = await db
    .select()
    .from(tenants)
    .where(
      and(
        eq(tenants.isDemo, false),
        exists(
          db
            .select({ id: reportRecipients.id })
            .from(reportRecipients)
            .where(
              and(
                eq(reportRecipients.tenantId, tenants.id),
                eq(reportRecipients.kind, "finance"),
                isNotNull(reportRecipients.verifiedAt),
                isNull(reportRecipients.unsubscribedAt),
              ),
            ),
        ),
      ),
    );
  const totals = emptyTotals(candidates.length);
  for (const [i, tenant] of candidates.entries()) {
    if (clock() - start > budgetMs) {
      totals.unprocessedTenants = candidates.length - i;
      break;
    }
    try {
      await reportForTenant(tenant, now, periodKey, totals);
    } catch (err) {
      totals.failedTenants++;
      void notifyOps(
        `executive report to finance failed for workspace ${tenant.id}: ${opsErrorText(err)}`,
        { key: `exec_report:${tenant.id}`, cooldownMs: 60 * 60 * 1000 },
      );
    }
  }
  if (
    totals.unprocessedTenants > 0 ||
    totals.failed > 0 ||
    totals.failedTenants > 0
  ) {
    void notifyOps(
      `executive report run for ${periodKey} is incomplete: ${totals.failed} failed send(s), ${totals.failedTenants} failed tenant(s), ${totals.unprocessedTenants} unprocessed tenant(s). Run /api/cron/exec-report again to finish; delivered emails are not sent twice.`,
      { key: "exec_report:incomplete", cooldownMs: 60 * 60 * 1000 },
    );
  }
  return totals;
};
