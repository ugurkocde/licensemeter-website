import { and, desc, eq, gte, inArray, isNotNull } from "drizzle-orm";

import { env, siteUrl } from "~/env";
import { emailAppUrl } from "~/lib/emailLayout";
import { fmtMoney, workspaceLabel } from "~/lib/format";
import { db } from "~/server/db";
import {
  aiSpendDaily,
  findings,
  snapshots,
  syncRuns,
  tenants,
  tenantSkus,
  vendorRenewals,
  type TenantRow,
} from "~/server/db/schema";
import {
  computeAiSpendDelta,
  computeDigestDelta,
  DELTA_WINDOW_MS,
  renewalDigestLine,
} from "~/server/digestDelta";
import {
  allClearHtml,
  digestHtml,
  reportHtml,
  sendEmail,
  type EmailFooter,
} from "~/server/email";
import {
  claimDelivery,
  completeDelivery,
  deliveryIdempotencyKey,
  failDelivery,
  pruneDeliveries,
} from "~/server/emailLedger";
import { periodKeyFor, type EmailJob } from "~/server/emailPeriods";
import { notifyOps } from "~/server/ops";
import { getBranding } from "~/server/billing/branding";
import { loadEntitlement } from "~/server/entitlementStore";
import { renderWasteReportPdf } from "~/server/report/renderReport";
import { makeMembershipUnsubToken } from "~/server/unsubToken";
import {
  workspaceEmailRecipients,
  type EmailRecipient,
} from "~/server/workspaceEmail";

/**
 * Weekly digest and monthly report, shared delivery rules:
 *  - content is built once per tenant, then every owner/admin gets their own
 *    message (nobody sees another recipient, one bad address affects nobody
 *    else) with a personal unsubscribe link and List-Unsubscribe headers;
 *  - every send is claimed in the delivery ledger first (~/server/emailLedger),
 *    so running a job again only reaches people who did not get this period's
 *    email yet;
 *  - no new tenant is started once the time budget is used up. The remainder
 *    is reported as unprocessedTenants and finished by simply running the job
 *    again.
 */

/** Stop starting tenants here; leaves headroom below the 300 s function limit. */
export const JOB_BUDGET_MS = 240_000;

/** Only syncs this fresh keep a zero-findings tenant in the all-clear loop. */
const RECENT_SYNC_MS = 8 * 24 * 60 * 60 * 1000;

export type JobTotals = {
  /** Tenants eligible for the job in this run. */
  tenants: number;
  sent: number;
  /** Recipients this period's email already went to, or is going to right now. */
  skippedAlreadySent: number;
  skippedOptedOut: number;
  failed: number;
  /** Tenants not started because the time budget ran out. Run the job again. */
  unprocessedTenants: number;
};

export type JobOptions = {
  now?: Date;
  budgetMs?: number;
  /** Monotonic clock for the budget; injectable for tests. */
  clock?: () => number;
};

const EMAIL_LABEL: Record<EmailJob, string> = {
  digest: "weekly digest",
  report: "monthly report",
};

/** Personal, token-signed unsubscribe link for one membership and one job. */
export const membershipUnsubscribeUrl = (
  membershipId: string,
  job: EmailJob,
): string => {
  const t = makeMembershipUnsubToken(membershipId, job, env.AUTH_SECRET);
  return `${siteUrl()}/api/unsubscribe?m=${membershipId}&j=${job}&t=${t}`;
};

type Message = {
  subject: string;
  html: (footer: EmailFooter) => string;
  attachments?: { filename: string; content: string }[];
};

/**
 * Claim, send and record one message per recipient; failures stay isolated.
 * The message is built on the first won claim and reused for everyone after,
 * so a repeated run with nothing left to send never renders a PDF.
 */
const deliver = async (
  tenant: TenantRow,
  job: EmailJob,
  periodKey: string,
  recipients: EmailRecipient[],
  build: () => Promise<Message>,
  totals: JobTotals,
): Promise<void> => {
  let built: Promise<Message> | undefined;
  for (const recipient of recipients) {
    const key = {
      tenantId: tenant.id,
      job,
      periodKey,
      recipient: recipient.email,
    };
    const claim = await claimDelivery(key);
    if (!claim.won) {
      // "failed" here means the retries are used up; "claimed" means another
      // run is sending to this person right now.
      if (claim.status === "failed") totals.failed++;
      else totals.skippedAlreadySent++;
      continue;
    }
    try {
      const message = await (built ??= build());
      const unsubscribeUrl = membershipUnsubscribeUrl(
        recipient.membershipId,
        job,
      );
      const delivered = await sendEmail({
        to: [recipient.email],
        subject: message.subject,
        html: message.html({
          workspaceName: workspaceLabel(tenant),
          emailLabel: EMAIL_LABEL[job],
          unsubscribeUrl,
          settingsUrl: emailAppUrl(siteUrl(), "/app/settings"),
        }),
        headers: {
          "List-Unsubscribe": `<${unsubscribeUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
        attachments: message.attachments,
        idempotencyKey: deliveryIdempotencyKey(key),
      });
      if (!delivered) throw new Error("email is not configured");
      await completeDelivery(claim.id);
      totals.sent++;
    } catch (err) {
      totals.failed++;
      await failDelivery(claim.id, err).catch((ledgerErr: unknown) => {
        console.error("[email] ledger update failed", ledgerErr);
      });
    }
  }
};

/** Walk the tenants within the time budget and report what is left over. */
const runJob = async (
  job: EmailJob,
  candidates: TenantRow[],
  opts: JobOptions,
  perTenant: (
    tenant: TenantRow,
    now: Date,
    periodKey: string,
    totals: JobTotals,
  ) => Promise<void>,
): Promise<JobTotals> => {
  const clock = opts.clock ?? Date.now;
  const budgetMs = opts.budgetMs ?? JOB_BUDGET_MS;
  const start = clock();
  const now = opts.now ?? new Date();
  const periodKey = periodKeyFor(job, now);
  const totals: JobTotals = {
    tenants: candidates.length,
    sent: 0,
    skippedAlreadySent: 0,
    skippedOptedOut: 0,
    failed: 0,
    unprocessedTenants: 0,
  };

  for (const [i, tenant] of candidates.entries()) {
    if (clock() - start > budgetMs) {
      totals.unprocessedTenants = candidates.length - i;
      break;
    }
    try {
      await perTenant(tenant, now, periodKey, totals);
    } catch (err) {
      void notifyOps(
        `${job === "digest" ? "digest" : "monthly report"} failed for tenant ${workspaceLabel(tenant)}: ${err instanceof Error ? err.message : String(err)}`,
        { key: `${job}:${tenant.id}`, cooldownMs: 60 * 60 * 1000 },
      );
    }
  }

  if (totals.unprocessedTenants > 0 || totals.failed > 0) {
    void notifyOps(
      `${job} run for ${periodKey} is incomplete: ${totals.failed} failed send(s), ${totals.unprocessedTenants} unprocessed tenant(s). Run /api/cron/${job} again to finish; delivered emails are not sent twice.`,
      { key: `${job}:incomplete`, cooldownMs: 60 * 60 * 1000 },
    );
  }
  return totals;
};

/**
 * Weekly digest. Leads with the 7-day delta; tenants with zero open findings
 * get a short all-clear instead of silence (silence right after everything is
 * fixed reads like the product stopped working, a churn signal). A tenant
 * that is skipped because there is nothing to say writes no ledger rows.
 */
export const runDigestJob = async (
  opts: JobOptions = {},
): Promise<JobTotals> => {
  const candidates = await db.query.tenants.findMany({
    where: eq(tenants.isDemo, false),
  });
  return runJob("digest", candidates, opts, digestForTenant);
};

const digestForTenant = async (
  tenant: TenantRow,
  now: Date,
  periodKey: string,
  totals: JobTotals,
): Promise<void> => {
  // Covers both 7-day buckets of computeAiSpendDelta; UTC-pinned like the
  // yyyy-mm-dd day column it is compared against.
  const aiSpendSince = new Date(now.getTime() - 2 * DELTA_WINDOW_MS)
    .toISOString()
    .slice(0, 10);
  const [audience, open, resolvedRecent, latest, aiSpendRows, renewals] =
    await Promise.all([
      workspaceEmailRecipients(tenant.id, "digest"),
      db.query.findings.findMany({
        where: and(
          eq(findings.tenantId, tenant.id),
          inArray(findings.status, ["open", "acknowledged"]),
        ),
        orderBy: desc(findings.monthlyImpactCents),
      }),
      db.query.findings.findMany({
        where: and(
          eq(findings.tenantId, tenant.id),
          // status filter keeps this disjoint from the open/acknowledged
          // query above: a reopened finding can carry a stale resolvedAt.
          eq(findings.status, "resolved"),
          isNotNull(findings.resolvedAt),
          gte(findings.resolvedAt, new Date(now.getTime() - DELTA_WINDOW_MS)),
        ),
      }),
      db.query.snapshots.findFirst({
        where: eq(snapshots.tenantId, tenant.id),
        orderBy: desc(snapshots.day),
      }),
      db.query.aiSpendDaily.findMany({
        where: and(
          eq(aiSpendDaily.tenantId, tenant.id),
          gte(aiSpendDaily.day, aiSpendSince),
        ),
        columns: { day: true, amountCents: true },
      }),
      db.query.vendorRenewals.findMany({
        where: and(
          eq(vendorRenewals.tenantId, tenant.id),
          gte(vendorRenewals.renewalDate, now.toISOString().slice(0, 10)),
        ),
        columns: {
          vendor: true,
          contractName: true,
          renewalDate: true,
          noticeDays: true,
        },
      }),
    ]);

  if (audience.recipients.length === 0 && audience.optedOut === 0) return;

  const delta = computeDigestDelta([...open, ...resolvedRecent], now);
  const renewalLine = renewalDigestLine(renewals, now);
  // AI API spend is metered in USD by the providers and never converted,
  // so the line is formatted in USD regardless of the workspace currency.
  let aiSpendLine: string | undefined;
  if (aiSpendRows.length > 0) {
    const { last7Cents, prior7Cents } = computeAiSpendDelta(aiSpendRows, now);
    const diff = last7Cents - prior7Cents;
    const vsPrior =
      prior7Cents > 0
        ? ` (${diff >= 0 ? "+" : "-"}${fmtMoney(Math.abs(diff), "USD")} vs prior week)`
        : "";
    aiSpendLine = `AI API spend last 7 days: ${fmtMoney(last7Cents, "USD")}${vsPrior}, billed in USD.`;
  }
  const tenantLabel = tenant.name ?? "your tenant";
  const tenantName = workspaceLabel(tenant);

  let message: Message;
  if (open.length === 0) {
    // All clear, but only for tenants that actually synced recently.
    // A stale tenant with no data would get a hollow "all clear" forever.
    const recentSync = await db.query.syncRuns.findFirst({
      where: and(
        eq(syncRuns.tenantId, tenant.id),
        // "partial" counts: connector hiccups still leave the M365 data
        // fresh, and a flaky connector must not mute the all-clear forever.
        inArray(syncRuns.status, ["success", "partial"]),
        isNotNull(syncRuns.finishedAt),
        gte(syncRuns.finishedAt, new Date(now.getTime() - RECENT_SYNC_MS)),
      ),
    });
    if (!recentSync) return;

    message = {
      subject: `LicenseMeter: all clear in ${tenantLabel}`,
      html: (footer) =>
        allClearHtml({
          tenantName,
          resolvedCount: delta.resolvedCount,
          resolvedImpact: fmtMoney(delta.resolvedCents, tenant.currency),
          renewalLine: renewalLine
            ? `${renewalLine}. You go in clean.`
            : undefined,
          aiSpendLine,
          appUrl: siteUrl(),
          footer,
        }),
    };
  } else {
    const wasteCents = latest?.totalMonthlyWasteCents ?? 0;
    const openCents = open.reduce((s, f) => s + f.monthlyImpactCents, 0);
    // New findings lead the subject; otherwise fall back to the standing
    // totals. With unpriced SKUs the waste is 0. Lead with the findings
    // count instead of an underwhelming zero.
    const subject =
      delta.newCount > 0
        ? `LicenseMeter: ${delta.newCount} new finding${delta.newCount === 1 ? "" : "s"}, +${fmtMoney(delta.newCents, tenant.currency)}/mo in ${tenantLabel}`
        : wasteCents > 0
          ? `LicenseMeter: ${fmtMoney(wasteCents, tenant.currency)}/mo wasted in ${tenantLabel}`
          : `LicenseMeter: ${open.length} open findings in ${tenantLabel}`;

    message = {
      subject,
      html: (footer) =>
        digestHtml({
          tenantName,
          currency: tenant.currency,
          monthlySpend: fmtMoney(
            latest?.totalMonthlySpendCents ?? 0,
            tenant.currency,
          ),
          monthlyWaste: fmtMoney(
            latest?.totalMonthlyWasteCents ?? 0,
            tenant.currency,
          ),
          openFindings: open.length,
          topFindings: open.slice(0, 5).map((f) => ({
            title: f.title,
            impact: fmtMoney(f.monthlyImpactCents, tenant.currency),
          })),
          delta: {
            newCount: delta.newCount,
            newImpact: fmtMoney(delta.newCents, tenant.currency),
            resolvedCount: delta.resolvedCount,
            resolvedImpact: fmtMoney(delta.resolvedCents, tenant.currency),
          },
          renewalLine: renewalLine
            ? `${renewalLine}, with ${open.length} open finding${open.length === 1 ? "" : "s"} worth ${fmtMoney(openCents, tenant.currency)}/mo to reclaim before you re-commit.`
            : undefined,
          aiSpendLine,
          appUrl: siteUrl(),
          footer,
        }),
    };
  }

  totals.skippedOptedOut += audience.optedOut;
  await deliver(
    tenant,
    "digest",
    periodKey,
    audience.recipients,
    () => Promise.resolve(message),
    totals,
  );
};

/**
 * Monthly PDF waste report, for workspaces that opted in via Settings. Runs on
 * the 1st right after the nightly sync, so the numbers are hours old at most.
 * Imported workspaces (consentedAt null) are included: their imported data is
 * valid and the report is the retention hook. But tenants with no stored data
 * at all are skipped. The PDF is rendered once per tenant and attached to
 * every recipient's own message. Ends with the ledger housekeeping.
 */
export const runReportJob = async (
  opts: JobOptions = {},
): Promise<JobTotals> => {
  const candidates = await db.query.tenants.findMany({
    where: and(eq(tenants.isDemo, false), eq(tenants.monthlyReport, true)),
  });
  const totals = await runJob("report", candidates, opts, reportForTenant);
  try {
    await pruneDeliveries(opts.now);
  } catch (err) {
    console.error("[email] ledger housekeeping failed", err);
  }
  return totals;
};

const reportForTenant = async (
  tenant: TenantRow,
  _now: Date,
  periodKey: string,
  totals: JobTotals,
): Promise<void> => {
  const [audience, anySku, anyFinding] = await Promise.all([
    workspaceEmailRecipients(tenant.id, "report"),
    // Cheap emptiness probes: never render a PDF of nothing but zeros.
    db.query.tenantSkus.findFirst({
      where: eq(tenantSkus.tenantId, tenant.id),
      columns: { skuId: true },
    }),
    db.query.findings.findFirst({
      where: eq(findings.tenantId, tenant.id),
      columns: { id: true },
    }),
  ]);

  if (!anySku && !anyFinding) return;
  totals.skippedOptedOut += audience.optedOut;
  if (audience.recipients.length === 0) return;

  const build = async (): Promise<Message> => {
    // White-label branding of the MSP account, for a covered client workspace
    // only. Workspaces outside an MSP account never pay for the lookups, and
    // the plan decides: an expired or over-quantity workspace gets the
    // LicenseMeter report.
    const branding = tenant.mspAccountId
      ? await getBranding(tenant, await loadEntitlement(tenant))
      : null;
    const pdf = await renderWasteReportPdf(tenant.id, branding);
    const tenantLabel = tenant.name ?? "your tenant";
    // With unpriced SKUs the waste is 0. Lead with the findings count
    // instead of an underwhelming zero (same fallback as the digest).
    const subject =
      pdf.monthlyWasteCents > 0
        ? `LicenseMeter monthly report: ${fmtMoney(pdf.monthlyWasteCents, tenant.currency)}/mo waste in ${tenantLabel}`
        : `LicenseMeter monthly report: ${pdf.openFindings} open findings in ${tenantLabel}`;
    return {
      subject,
      html: (footer) =>
        reportHtml({
          tenantName: workspaceLabel(tenant),
          monthlySpend: fmtMoney(pdf.monthlySpendCents, tenant.currency),
          monthlyWaste: fmtMoney(pdf.monthlyWasteCents, tenant.currency),
          openFindings: pdf.openFindings,
          appUrl: siteUrl(),
          footer,
        }),
      attachments: [
        { filename: pdf.filename, content: pdf.buffer.toString("base64") },
      ],
    };
  };

  await deliver(
    tenant,
    "report",
    periodKey,
    audience.recipients,
    build,
    totals,
  );
};
