import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { siteUrl } from "~/env";
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
import {
  sharedRecipient,
  type SharedEmailJob,
} from "~/server/notificationAddress";
type Tenant = TenantRow;

/**
 * Who one copy of a workspace email goes to. A membership carries its own
 * unsubscribe link; the workspace's shared notification address has no
 * membership and unsubscribes per workspace instead.
 */
export type EmailRecipient =
  | { kind: "membership"; membershipId: string; email: string }
  | { kind: "shared"; email: string };

/**
 * The one recipient rule for workspace email: owners and admins whose
 * membership is claimed. With a job, people who personally opted out of that
 * email are left out and counted instead, and the workspace's verified shared
 * address is added when its switch for that job is on. Without a job there is
 * no switch to honour, so only the memberships are returned. Addresses are
 * deduplicated case-insensitively so nobody gets the same email twice, and a
 * membership always wins the duplicate: it keeps the personal unsubscribe link
 * and the personal opt-out.
 */
export const workspaceEmailRecipients = async (
  tenantId: string,
  job?: SharedEmailJob,
): Promise<{ recipients: EmailRecipient[]; optedOut: number }> => {
  const rows = await db.query.memberships.findMany({
    where: and(
      eq(memberships.tenantId, tenantId),
      inArray(memberships.role, ["owner", "admin"]),
      // Only signed-in members receive workspace notices; exclude pending invites.
      isNotNull(memberships.oid),
    ),
    columns: { id: true, email: true, digestOptOut: true, reportOptOut: true },
  });
  const seen = new Set<string>();
  const recipients: EmailRecipient[] = [];
  let optedOut = 0;
  for (const row of rows) {
    const email = row.email.trim();
    if (!email || seen.has(email.toLowerCase())) continue;
    seen.add(email.toLowerCase());
    const out =
      job === "digest"
        ? row.digestOptOut
        : job === "report"
          ? row.reportOptOut
          : false;
    if (out) optedOut++;
    else recipients.push({ kind: "membership", membershipId: row.id, email });
  }
  const shared = job ? await sharedRecipient(tenantId, job) : null;
  if (shared && !seen.has(shared.toLowerCase())) {
    recipients.push({ kind: "shared", email: shared });
  }
  return { recipients, optedOut };
};

/**
 * Plain addresses for mail without a personal opt-out. With a job the shared
 * notification address is included the same way as above.
 */
export const workspaceAdminEmails = async (
  tenantId: string,
  job?: SharedEmailJob,
): Promise<string[]> =>
  (await workspaceEmailRecipients(tenantId, job)).recipients.map(
    (r) => r.email,
  );

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
      }),
    },
    "join-approved",
  );
};
