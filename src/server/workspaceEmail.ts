import { and, eq, inArray, isNotNull, or } from "drizzle-orm";
import { signInPath, siteUrl } from "~/env";
import { workspaceLabel } from "~/lib/format";
import { db } from "~/server/db";
import { memberships, type TenantRow } from "~/server/db/schema";
import { SUPPORT_EMAIL } from "~/lib/support";
import {
  domainJoinedHtml,
  emailEnabled,
  joinApprovedHtml,
  joinRequestHtml,
  sendEmail,
  workspaceDeletedHtml,
} from "~/server/email";
type Tenant = TenantRow;
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

export const sendWorkspaceDeleted = async (
  tenant: Tenant,
  actor: string,
  to: string[],
): Promise<boolean> => {
  if (!emailEnabled() || to.length === 0) return false;
  const name = workspaceLabel(tenant);
  return sendEmail({
    to,
    replyTo: SUPPORT_EMAIL,
    subject: `Workspace deleted: ${name}`,
    html: workspaceDeletedHtml({ tenantName: name, actor, appUrl: siteUrl() }),
  });
};

/**
 * One message per recipient, so admins never see each other in the To line and
 * one bounced address does not hold back the rest. Never throws.
 */
const sendToEach = async (
  to: string[],
  message: { subject: string; html: string },
  tag: string,
): Promise<void> => {
  await Promise.all(
    to.map((address) =>
      sendEmail({ to: [address], ...message }).catch((err) => {
        console.error(`[${tag}] email failed`, err);
        return false;
      }),
    ),
  );
};

/** Tells owners/admins that a colleague asked to join. Sent once per request. */
export const sendJoinRequestNotice = async (
  tenant: Tenant,
  requesterEmail: string,
): Promise<void> => {
  if (!emailEnabled() || tenant.isDemo) return;
  const name = workspaceLabel(tenant);
  await sendToEach(
    await workspaceAdminEmails(tenant.id),
    {
      subject: `${requesterEmail} asked to join ${name}`,
      html: joinRequestHtml({
        requesterEmail,
        tenantName: name,
        appUrl: siteUrl(),
      }),
    },
    "join-request",
  );
};

/** Tells owners/admins that a colleague joined automatically. */
export const sendDomainJoinedNotice = async (
  tenant: Tenant,
  memberEmail: string,
): Promise<void> => {
  if (!emailEnabled() || tenant.isDemo) return;
  const name = workspaceLabel(tenant);
  await sendToEach(
    await workspaceAdminEmails(tenant.id),
    {
      subject: `${memberEmail} joined ${name}`,
      html: domainJoinedHtml({
        memberEmail,
        tenantName: name,
        appUrl: siteUrl(),
      }),
    },
    "domain-join",
  );
};

/** Tells the requester that access was granted. */
export const sendJoinApproved = async (
  tenant: Tenant,
  requesterEmail: string,
): Promise<void> => {
  if (!emailEnabled() || tenant.isDemo) return;
  const name = workspaceLabel(tenant);
  await sendToEach(
    [requesterEmail],
    {
      subject: `You now have access to ${name} on LicenseMeter`,
      html: joinApprovedHtml({
        tenantName: name,
        appUrl: siteUrl(),
        signInUrl: `${siteUrl()}${signInPath()}`,
      }),
    },
    "join-approved",
  );
};
