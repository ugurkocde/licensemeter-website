import { and, eq } from "drizzle-orm";

import { siteUrl } from "~/env";
import { emailAppUrl } from "~/lib/emailLayout";
import { fmtMoney, fmtNumber, workspaceLabel } from "~/lib/format";
import { db } from "~/server/db";
import { tenants, type TenantRow } from "~/server/db/schema";
import { renewalAlertHtml } from "~/server/email";
import { deliverOnce } from "~/server/emailDelivery";
import { hasFeature } from "~/server/entitlement";
import { loadEntitlement } from "~/server/entitlementStore";
import { notifyOps } from "~/server/ops";
import { opsErrorText } from "~/server/opsError";
import {
  JOB_BUDGET_MS,
  unsubscribeUrlFor,
  type JobOptions,
  type JobTotals,
} from "~/server/scheduledEmails";
import { workspaceEmailRecipients } from "~/server/workspaceEmail";
import { planCalendar } from "./calendar";
import { icsFileName } from "./ics";
import { loadRenewalPlan } from "./loadPlan";
import type { PlanItem } from "./plan";

/**
 * Renewal reminders: an email 90, 60 and 30 days before every upcoming paid
 * renewal in the renewal savings plan, with that renewal's calendar file
 * attached. Same delivery rules as the digest and the report (one message per
 * owner/admin and the shared address, personal unsubscribe links, the
 * delivery ledger, the time budget), so a repeated run never mails the same
 * renewal and threshold to the same person twice.
 *
 * Which renewals: the plan's items, which already hold one row per paid
 * renewal (a SKU linked to a contract is planned under the contract only).
 * renewalAlertsApply decides per Microsoft SKU: annual and multi-year terms
 * are covered by default, a monthly (NCE) term only when the admin opted that
 * SKU in. Trial-only subscriptions renew nothing paid and are left out.
 */

export const RENEWAL_THRESHOLDS = [90, 60, 30] as const;
export type RenewalThreshold = (typeof RENEWAL_THRESHOLDS)[number];

/**
 * A monthly term renews every month, so only the 30 day reminder makes sense:
 * the 90 and 60 day ones would arrive before the previous month renewed.
 */
const MONTHLY_THRESHOLDS: readonly RenewalThreshold[] = [30];

/**
 * The reminder a renewal is due for today, or null. Each threshold owns the
 * days from it down to the next one (90 owns 61 to 90, 60 owns 31 to 60, 30
 * owns 0 to 30), so a run that missed the exact day still sends the reminder
 * the next day, and a renewal added 45 days out gets its 60 day reminder
 * instead of nothing. The ledger key carries the threshold, so each one goes
 * out at most once.
 */
export const thresholdFor = (
  daysUntil: number,
  thresholds: readonly RenewalThreshold[] = RENEWAL_THRESHOLDS,
): RenewalThreshold | null => {
  if (!Number.isInteger(daysUntil) || daysUntil < 0) return null;
  const sorted = [...thresholds].sort((a, b) => a - b);
  return sorted.find((t) => daysUntil <= t) ?? null;
};

/** Paid renewals the reminder rule covers. */
export const alertEligible = (
  item: Pick<PlanItem, "alertsApply" | "trialOnly" | "paidSeats">,
): boolean => item.alertsApply && !item.trialOnly && item.paidSeats > 0;

export type DueAlert = { item: PlanItem; threshold: RenewalThreshold };

/** Every reminder due today across a workspace's plan. Pure. */
export const dueRenewalAlerts = (items: readonly PlanItem[]): DueAlert[] =>
  items.flatMap((item) => {
    if (!alertEligible(item)) return [];
    const threshold = thresholdFor(
      item.daysUntil,
      item.term === "monthly" ? MONTHLY_THRESHOLDS : RENEWAL_THRESHOLDS,
    );
    return threshold === null ? [] : [{ item, threshold }];
  });

/**
 * Ledger period key: the renewal, its date and the threshold. The date makes
 * next year's renewal of the same SKU (or a moved contract date) a fresh set
 * of reminders instead of one the ledger already marked as sent.
 */
export const alertPeriodKey = (alert: DueAlert): string =>
  `${alert.item.key}:${alert.item.renewalDate}:${alert.threshold}`;

const DAY_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const dayLabel = (iso: string) =>
  DAY_FORMAT.format(new Date(`${iso}T00:00:00Z`));

const seats = (n: number, currency: string) =>
  `${fmtNumber(n, currency)} ${n === 1 ? "seat" : "seats"}`;

export const renewsWhen = (daysUntil: number): string =>
  daysUntil === 0
    ? "renews today"
    : daysUntil === 1
      ? "renews tomorrow"
      : `renews in ${daysUntil} days`;

/** One plain sentence on what to do, never claiming money without a price. */
export const verdictOf = (item: PlanItem, currency: string): string => {
  if (item.cutSeats === 0)
    return `Renew at ${seats(item.recommendedSeats, currency)}: nothing to cut right now.`;
  const money =
    item.annualSavingsCents !== null && item.annualSavingsCents > 0
      ? ` and save ${fmtMoney(item.annualSavingsCents, currency)} a year`
      : "";
  const unpriced =
    item.unpricedCutSeats > 0 && money
      ? ` ${seats(item.unpricedCutSeats, currency)} of these have no price yet.`
      : "";
  return `Cut ${seats(item.cutSeats, currency)}${money}.${unpriced}`;
};

export type RenewalAlertMessage = {
  subject: string;
  html: (footer: Parameters<typeof renewalAlertHtml>[0]["footer"]) => string;
  attachments: { filename: string; content: string }[];
};

/** Subject, body and calendar attachment for one due reminder. */
export const renewalAlertMessage = (
  tenant: Pick<TenantRow, "id" | "name" | "tid" | "currency">,
  alert: DueAlert,
  now: Date,
): RenewalAlertMessage => {
  const { item } = alert;
  const currency = tenant.currency;
  const when = renewsWhen(item.daysUntil);
  const savings =
    item.cutSeats > 0 &&
    item.annualSavingsCents !== null &&
    item.annualSavingsCents > 0
      ? `, save ${fmtMoney(item.annualSavingsCents, currency)}/yr`
      : item.cutSeats > 0
        ? `, cut ${seats(item.cutSeats, currency)}`
        : "";
  const rows = [
    { label: "Paid seats", value: fmtNumber(item.paidSeats, currency) },
    { label: "Active seats", value: fmtNumber(item.activeSeats, currency) },
    {
      label: item.targetSet ? "Target seats" : "Renew at",
      value: fmtNumber(item.recommendedSeats, currency),
    },
    { label: "Seats to cut", value: fmtNumber(item.cutSeats, currency) },
  ];
  const calendar = planCalendar([item], {
    tenantId: tenant.id,
    currency,
    url: `${siteUrl()}/app/renewals`,
    now,
  });
  return {
    subject: `${item.vendor} renewal ${when.replace(/^renews /, "")}: ${item.label}${savings}`,
    html: (footer) =>
      renewalAlertHtml({
        tenantName: workspaceLabel(tenant),
        vendor: item.vendor,
        label: item.label,
        kind: item.kind === "contract" ? "Contract" : "Subscription",
        when,
        renewalDate: dayLabel(item.renewalDate),
        noticeDate: dayLabel(item.noticeDate),
        noticePassed: item.noticeDaysUntil < 0,
        rows,
        verdict: verdictOf(item, currency),
        estimate: item.estimate,
        appUrl: siteUrl(),
        footer,
      }),
    attachments: [
      {
        filename: icsFileName(item.label),
        content: Buffer.from(calendar, "utf8").toString("base64"),
      },
    ],
  };
};

/**
 * The digest's totals, plus deliveries whose retries were used up on earlier
 * days. A reminder's ledger key stays the same for its whole band (up to 30
 * days), so such a row comes back as "failed" on every run; counting it as a
 * fresh failure would report the run as incomplete each morning although
 * running it again cannot change anything.
 */
export type RenewalJobTotals = JobTotals & {
  skippedExhausted: number;
  /** Workspaces whose run threw before all their reminders were tried. */
  failedTenants: number;
};

const emptyTotals = (tenantCount: number): RenewalJobTotals => ({
  tenants: tenantCount,
  skippedExhausted: 0,
  failedTenants: 0,
  sent: 0,
  skippedAlreadySent: 0,
  skippedOptedOut: 0,
  skippedBlocked: 0,
  failed: 0,
  unprocessedTenants: 0,
});

const alertsForTenant = async (
  tenant: TenantRow,
  now: Date,
  totals: RenewalJobTotals,
): Promise<void> => {
  // The reminders are part of the renewal savings plan. A lapsed plan keeps
  // the workspace switch as it is and simply sends nothing.
  if (!hasFeature(await loadEntitlement(tenant, now), "renewalPlans")) return;
  const plan = await loadRenewalPlan(tenant, now);
  const due = dueRenewalAlerts(plan.items);
  if (due.length === 0) return;
  const audience = await workspaceEmailRecipients(tenant.id, "renewal");
  totals.skippedOptedOut += audience.optedOut * due.length;

  for (const alert of due) {
    let built: RenewalAlertMessage | undefined;
    for (const recipient of audience.recipients) {
      // deliverOnce asks for the message only after a won claim, so a
      // "failed" without a request is a row whose retries are used up.
      let attempted = false;
      const outcome = await deliverOnce(
        {
          tenantId: tenant.id,
          job: "renewal",
          periodKey: alertPeriodKey(alert),
          recipient: recipient.email,
        },
        () => {
          attempted = true;
          built ??= renewalAlertMessage(tenant, alert, now);
          const unsubscribeUrl = unsubscribeUrlFor(
            tenant.id,
            recipient,
            "renewal",
          );
          return Promise.resolve({
            subject: built.subject,
            html: built.html({
              workspaceName: workspaceLabel(tenant),
              emailLabel: "renewal reminders",
              unsubscribeUrl,
              settingsUrl: emailAppUrl(siteUrl(), "/app/settings"),
              shared: recipient.kind === "shared",
            }),
            headers: {
              "List-Unsubscribe": `<${unsubscribeUrl}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
            attachments: built.attachments,
          });
        },
      );
      if (outcome === "failed" && !attempted) totals.skippedExhausted++;
      else totals[outcome]++;
    }
  }
};

/**
 * Daily run. Safe to repeat at any time: the ledger holds one row per
 * renewal, threshold and recipient. Stops starting new workspaces once the
 * time budget is used up; running it again finishes the remainder.
 */
export const runRenewalAlertJob = async (
  opts: JobOptions = {},
): Promise<RenewalJobTotals> => {
  const clock = opts.clock ?? Date.now;
  const budgetMs = opts.budgetMs ?? JOB_BUDGET_MS;
  const start = clock();
  const now = opts.now ?? new Date();
  const candidates = await db.query.tenants.findMany({
    where: and(eq(tenants.isDemo, false), eq(tenants.renewalAlerts, true)),
  });
  const totals = emptyTotals(candidates.length);
  for (const [i, tenant] of candidates.entries()) {
    if (clock() - start > budgetMs) {
      totals.unprocessedTenants = candidates.length - i;
      break;
    }
    try {
      await alertsForTenant(tenant, now, totals);
    } catch (err) {
      totals.failedTenants++;
      void notifyOps(
        `renewal reminders failed for workspace ${tenant.id}: ${opsErrorText(err)}`,
        { key: `renewal:${tenant.id}`, cooldownMs: 60 * 60 * 1000 },
      );
    }
  }
  if (
    totals.unprocessedTenants > 0 ||
    totals.failed > 0 ||
    totals.failedTenants > 0
  ) {
    void notifyOps(
      `renewal reminder run is incomplete: ${totals.failed} failed send(s), ${totals.failedTenants} failed tenant(s), ${totals.unprocessedTenants} unprocessed tenant(s). Run /api/cron/renewal-alerts again to finish; delivered emails are not sent twice.`,
      { key: "renewal:incomplete", cooldownMs: 60 * 60 * 1000 },
    );
  }
  return totals;
};
