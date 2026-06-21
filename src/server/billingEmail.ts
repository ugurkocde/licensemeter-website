import { and, eq, inArray, isNotNull } from "drizzle-orm";

import { env, siteUrl } from "~/env";
import { db } from "~/server/db";
import { memberships, type TenantRow } from "~/server/db/schema";
import { makeBillingUnsubToken } from "~/server/billingUnsubToken";
import {
  emailEnabled,
  paymentFailedHtml,
  sendEmail,
  subscriptionConfirmedHtml,
  trialExpiredHtml,
  trialReminderHtml,
} from "~/server/email";

type Tenant = TenantRow;

/** Workspace-scoped unsubscribe link for billing reminder nudges. */
export const billingUnsubscribeUrl = (tenantId: string): string => {
  const t = makeBillingUnsubToken(tenantId, env.AUTH_SECRET);
  return `${siteUrl()}/api/unsubscribe/billing?w=${tenantId}&t=${t}`;
};

/** Owners + admins with a confirmed sign-in: the billing/email recipients. */
const recipients = async (tenantId: string): Promise<string[]> => {
  const rows = await db.query.memberships.findMany({
    where: and(
      eq(memberships.tenantId, tenantId),
      inArray(memberships.role, ["owner", "admin"]),
      isNotNull(memberships.oid),
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
  const name = tenant.name ?? tenant.tid;
  const unsub = billingUnsubscribeUrl(tenant.id);
  return sendEmail({
    to,
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
  const name = tenant.name ?? tenant.tid;
  return sendEmail({
    to,
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
  const name = tenant.name ?? tenant.tid;
  return sendEmail({
    to,
    subject: `Payment failed — ${name}`,
    html: paymentFailedHtml({ tenantName: name, invoiceUrl, appUrl: siteUrl() }),
  });
};

/** Essential: paid-subscription confirmation cover note. */
export const sendSubscriptionConfirmed = async (
  tenant: Tenant,
  planName: string,
  invoiceUrl?: string,
): Promise<boolean> => {
  if (!emailEnabled()) return false;
  const to = await recipients(tenant.id);
  if (to.length === 0) return false;
  const name = tenant.name ?? tenant.tid;
  return sendEmail({
    to,
    subject: `Subscription confirmed — ${name}`,
    html: subscriptionConfirmedHtml({
      tenantName: name,
      planName,
      invoiceUrl,
      appUrl: siteUrl(),
    }),
  });
};
