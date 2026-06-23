import { and, eq, inArray, isNotNull, or } from "drizzle-orm";

import { env, siteUrl } from "~/env";
import { fmtDate, workspaceLabel } from "~/lib/format";
import { db } from "~/server/db";
import { memberships, type TenantRow } from "~/server/db/schema";
import { makeBillingUnsubToken } from "~/server/billingUnsubToken";
import { SUPPORT_EMAIL } from "~/lib/support";
import {
  emailEnabled,
  paymentFailedHtml,
  seatNudgeHtml,
  sendEmail,
  subscriptionConfirmedHtml,
  trialExpiredHtml,
  trialReminderHtml,
  workspaceDeletedHtml,
} from "~/server/email";

type Tenant = TenantRow;

/**
 * Billing lifecycle mail is sent from a billing-specific address rather than the
 * digest sender. Must be on the Resend-verified domain (same as EMAIL_FROM).
 */
const BILLING_FROM = "LicenseMeter <billing@licensemeter.com>";

/** Workspace-scoped unsubscribe link for billing reminder nudges. */
export const billingUnsubscribeUrl = (tenantId: string): string => {
  const t = makeBillingUnsubToken(tenantId, env.AUTH_SECRET);
  return `${siteUrl()}/api/unsubscribe/billing?w=${tenantId}&t=${t}`;
};

/** Owners + admins with a confirmed sign-in: the billing/email recipients. */
export const workspaceAdminEmails = (tenantId: string): Promise<string[]> =>
  recipients(tenantId);

const recipients = async (tenantId: string): Promise<string[]> => {
  const rows = await db.query.memberships.findMany({
    where: and(
      eq(memberships.tenantId, tenantId),
      inArray(memberships.role, ["owner", "admin"]),
      // Claimed via either provider (entra oid / workos workosUserId); pending
      // invites have neither and are excluded.
      or(isNotNull(memberships.oid), isNotNull(memberships.workosUserId)),
    ),
    columns: { email: true },
  });
  return rows.map((r) => r.email).filter(Boolean);
};

const trialSubject = (daysLeft: number, name: string): string =>
  daysLeft <= 0
    ? `LicenseMeter trial ends today — ${name}`
    : daysLeft === 1
      ? `LicenseMeter trial ends tomorrow — ${name}`
      : `LicenseMeter trial ends in ${daysLeft} days — ${name}`;

/**
 * Suppressible in-trial nudge. No-op when reminders are off for the workspace;
 * carries a one-click List-Unsubscribe.
 */
export const sendTrialReminder = async (
  tenant: Tenant,
  daysLeft: number,
  wasteLine?: string,
): Promise<boolean> => {
  if (!emailEnabled() || !tenant.trialReminders) return false;
  const to = await recipients(tenant.id);
  if (to.length === 0) return false;
  const name = workspaceLabel(tenant);
  const unsub = billingUnsubscribeUrl(tenant.id);
  return sendEmail({
    to,
    from: BILLING_FROM,
    subject: trialSubject(daysLeft, name),
    html: trialReminderHtml({
      tenantName: name,
      daysLeft,
      wasteLine,
      appUrl: siteUrl(),
      unsubscribeUrl: unsub,
    }),
    headers: {
      "List-Unsubscribe": `<${unsub}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });
};

/** Essential: trial-ended notice. Ignores the reminders flag; no unsubscribe. */
export const sendTrialExpired = async (
  tenant: Tenant,
  wasteLine?: string,
): Promise<boolean> => {
  if (!emailEnabled()) return false;
  const to = await recipients(tenant.id);
  if (to.length === 0) return false;
  const name = workspaceLabel(tenant);
  return sendEmail({
    to,
    from: BILLING_FROM,
    subject: `LicenseMeter trial ended — ${name}`,
    html: trialExpiredHtml({ tenantName: name, wasteLine, appUrl: siteUrl() }),
  });
};

/** Essential: failed-payment dunning. Ignores the reminders flag. */
export const sendPaymentFailed = async (
  tenant: Tenant,
  invoiceUrl?: string,
): Promise<boolean> => {
  if (!emailEnabled()) return false;
  const to = await recipients(tenant.id);
  if (to.length === 0) return false;
  const name = workspaceLabel(tenant);
  return sendEmail({
    to,
    from: BILLING_FROM,
    subject: `Payment failed — ${name}`,
    html: paymentFailedHtml({ tenantName: name, invoiceUrl, appUrl: siteUrl() }),
  });
};

/** Essential: paid-subscription confirmation cover note. */
export const sendSubscriptionConfirmed = async (
  tenant: Tenant,
  planName: string,
  invoiceUrl?: string,
  /** Set while the subscription is still in its preserved free trial: the email
   *  then explains "no charge yet, first charge on <date>" and hides the €0
   *  trial invoice. */
  trialEndsAt?: Date,
): Promise<boolean> => {
  if (!emailEnabled()) return false;
  const to = await recipients(tenant.id);
  if (to.length === 0) return false;
  const name = workspaceLabel(tenant);
  return sendEmail({
    to,
    from: BILLING_FROM,
    subject: `Subscription confirmed — ${name}`,
    html: subscriptionConfirmedHtml({
      tenantName: name,
      planName,
      invoiceUrl,
      appUrl: siteUrl(),
      trialEndsAt: trialEndsAt ? fmtDate(trialEndsAt) : undefined,
    }),
  });
};

/**
 * Essential: tell the OTHER owners/admins their workspace was deleted. The
 * recipient list MUST be resolved by the caller BEFORE the delete (the
 * memberships cascade-delete with the tenant, so reading them here would come
 * back empty) and with the actor already excluded. Best-effort by contract —
 * the caller must not let a send failure block the deletion — so this only
 * returns whether a send happened and never throws on an empty list.
 */
export const sendWorkspaceDeleted = async (
  tenant: Tenant,
  actor: string,
  to: string[],
): Promise<boolean> => {
  if (!emailEnabled() || to.length === 0) return false;
  const name = workspaceLabel(tenant);
  return sendEmail({
    to,
    from: BILLING_FROM,
    replyTo: SUPPORT_EMAIL,
    subject: `Workspace deleted — ${name}`,
    html: workspaceDeletedHtml({ tenantName: name, actor, appUrl: siteUrl() }),
  });
};

/** Suppressible upgrade nudge when a paid tenant outgrows its plan's seat band. */
export const sendSeatNudge = async (
  tenant: Tenant,
  args: {
    planName: string;
    seats: number;
    seatMax: number;
    recommendedName: string | null;
    over: boolean;
  },
): Promise<boolean> => {
  if (!emailEnabled() || !tenant.trialReminders) return false;
  const to = await recipients(tenant.id);
  if (to.length === 0) return false;
  const name = workspaceLabel(tenant);
  const unsub = billingUnsubscribeUrl(tenant.id);
  return sendEmail({
    to,
    from: BILLING_FROM,
    subject: args.over
      ? `Action needed: ${name} is over its plan seat limit`
      : `${name} is nearing its plan seat limit`,
    html: seatNudgeHtml({
      tenantName: name,
      planName: args.planName,
      seats: args.seats,
      seatMax: args.seatMax,
      recommendedName: args.recommendedName,
      over: args.over,
      appUrl: siteUrl(),
      unsubscribeUrl: unsub,
    }),
    headers: {
      "List-Unsubscribe": `<${unsub}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });
};
