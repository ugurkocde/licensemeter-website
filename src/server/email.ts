import { env } from "~/env";
import {
  emailAddressText,
  emailAppLink,
  emailButton,
  emailFooterLink,
  emailHeading,
  emailRows,
  emailRule,
  emailShell,
  emailStrong,
  emailText,
  emailWaste,
} from "~/lib/emailLayout";
import { escapeHtml } from "~/lib/html";

/**
 * Outgoing mail via Resend, entirely env-gated: without RESEND_API_KEY and
 * EMAIL_FROM every send is a silent no-op (returns false). No SDK dependency.
 */
export const emailEnabled = (): boolean =>
  Boolean(env.RESEND_API_KEY && env.EMAIL_FROM);

export type EmailArgs = {
  to: string[];
  subject: string;
  html: string;
  /** Sender override (must be on the verified domain); EMAIL_FROM otherwise. */
  from?: string;
  replyTo?: string;
  /** Extra SMTP headers, e.g. List-Unsubscribe. */
  headers?: Record<string, string>;
  /** File attachments; content is base64-encoded. */
  attachments?: { filename: string; content: string }[];
  /**
   * Resend Idempotency-Key: a repeated request with the same key within 24
   * hours is not delivered a second time.
   */
  idempotencyKey?: string;
  /**
   * Resend tags, echoed back in delivery webhooks. Names and values may only
   * hold ASCII letters, digits, underscore and dash.
   */
  tags?: { name: string; value: string }[];
};

/**
 * Sends and returns the provider's message id, the handle that later delivery
 * webhooks refer to. Null when email is not configured.
 */
export const sendEmailWithReceipt = async (
  args: EmailArgs,
): Promise<{ id: string } | null> => {
  if (!emailEnabled()) return null;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      ...(args.idempotencyKey
        ? { "Idempotency-Key": args.idempotencyKey }
        : {}),
    },
    body: JSON.stringify({
      from: args.from ?? env.EMAIL_FROM,
      to: args.to,
      // Tenant display names flow into subjects; strip header-breaking
      // control characters and cap the length.
      subject: args.subject.replace(/[\r\n]+/g, " ").slice(0, 200),
      html: args.html,
      ...(args.replyTo ? { reply_to: args.replyTo } : {}),
      ...(args.headers ? { headers: args.headers } : {}),
      ...(args.attachments ? { attachments: args.attachments } : {}),
      ...(args.tags ? { tags: args.tags } : {}),
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`Resend responded ${res.status}`);
  }
  const body = (await res.json().catch(() => null)) as { id?: unknown } | null;
  if (typeof body?.id !== "string" || !body.id) {
    throw new Error("Resend response carried no message id");
  }
  return { id: body.id };
};

/** For callers that only need to know whether the mail went out. */
export const sendEmail = async (args: EmailArgs): Promise<boolean> =>
  (await sendEmailWithReceipt(args)) !== null;

/** Workspace invitation: who invited you, where, as what. One click to sign in. */
export const inviteHtml = (args: {
  inviterName: string;
  tenantName: string;
  role: string;
  appUrl: string;
}): string =>
  emailShell({
    baseUrl: args.appUrl,
    title: "You are invited to LicenseMeter",
    preheader: `${args.inviterName} added you to the workspace ${args.tenantName}.`,
    body: `${emailHeading(`${escapeHtml(args.inviterName)} invited you to LicenseMeter`)}
${emailText(`You have been added to the workspace ${emailStrong(args.tenantName)}
as ${emailStrong(args.role)}. LicenseMeter shows which Microsoft 365 licenses
the organization pays for but nobody uses, with read-only access to license
metadata, never content.`)}
${emailButton(emailAppLink(args.appUrl, "/app"), "Sign in to LicenseMeter")}`,
    footer: `Sign in with the account that uses this email address. If you did
not expect this invitation, you can ignore this email. Nothing is shared
without signing in.`,
  });

const noticeShell = (args: {
  appUrl: string;
  /** Plain text, for the document title. */
  title: string;
  heading: string;
  body: string;
  cta: { href: string; label: string };
  footer: string;
}): string =>
  emailShell({
    baseUrl: args.appUrl,
    title: args.title,
    body: `${emailHeading(args.heading)}
${emailText(args.body)}
${emailButton(args.cta.href, args.cta.label)}`,
    footer: args.footer,
  });

/** To owners/admins: a colleague on the workspace's domain asked to get in. */
export const joinRequestHtml = (args: {
  requesterEmail: string;
  tenantName: string;
  appUrl: string;
}): string =>
  noticeShell({
    appUrl: args.appUrl,
    title: "A colleague asked to join your workspace",
    heading: `${emailAddressText(args.requesterEmail)} asked to join ${escapeHtml(args.tenantName)}`,
    body: `${emailStrong(args.requesterEmail)} signed in with a verified company
    email and asked for access to the workspace ${emailStrong(args.tenantName)}.
    Nothing is shared until an owner or admin approves the request. Approved
    people start as viewer: read-only dashboards, findings and exports.`,
    cta: {
      href: emailAppLink(args.appUrl, "/app/settings"),
      label: "Review the request",
    },
    footer: `You get this because you are an owner or admin of this workspace.
    Owners can change who can join under Settings, Members.`,
  });

/** To owners/admins: a colleague joined automatically by company email. */
export const domainJoinedHtml = (args: {
  memberEmail: string;
  tenantName: string;
  appUrl: string;
}): string =>
  noticeShell({
    appUrl: args.appUrl,
    title: "A colleague joined your workspace",
    heading: `${emailAddressText(args.memberEmail)} joined ${escapeHtml(args.tenantName)}`,
    body: `${emailStrong(args.memberEmail)} signed in with a verified company email
    and joined the workspace ${emailStrong(args.tenantName)} as viewer: read-only
    dashboards, findings and exports. You can change the role or remove the
    member in Settings.`,
    cta: {
      href: emailAppLink(args.appUrl, "/app/settings"),
      label: "Open members",
    },
    footer: `You get this because this workspace lets colleagues join
    automatically. Owners can change that under Settings, Members.`,
  });

/** To the requester: an owner or admin approved the access request. */
export const joinApprovedHtml = (args: {
  tenantName: string;
  appUrl: string;
}): string =>
  noticeShell({
    appUrl: args.appUrl,
    title: "Your access request was approved",
    heading: `You now have access to ${escapeHtml(args.tenantName)}`,
    body: `Your request to join the workspace ${emailStrong(args.tenantName)} was
    approved. You have viewer access: read-only dashboards, findings and
    exports. Sign in and pick the workspace from the switcher in the sidebar.`,
    cta: {
      href: emailAppLink(args.appUrl, "/app"),
      label: "Open LicenseMeter",
    },
    footer: `You get this because you asked to join this workspace. If that was
    not you, you can ignore this email.`,
  });

/**
 * To a shared notification address an owner or admin added: the confirmation
 * proves that somebody reading that mailbox agreed to receive the workspace
 * email, which no membership vouches for here.
 */
export const notificationAddressHtml = (args: {
  tenantName: string;
  /** Public confirm page; carries the one-use token, so never a link into /app. */
  confirmUrl: string;
  appUrl: string;
  hours: number;
}): string =>
  emailShell({
    baseUrl: args.appUrl,
    title: "Confirm this address for LicenseMeter",
    preheader: `Confirm that ${args.tenantName} may send its LicenseMeter email here.`,
    body: `${emailHeading("Confirm this address for LicenseMeter")}
${emailText(`An administrator of the workspace ${emailStrong(args.tenantName)} asked
LicenseMeter to send that workspace's email to this address, on top of the
owners and admins who already receive it.`)}
${emailText(`Those emails can contain account names and license costs, so everyone
who reads this mailbox will see them.`)}
${emailText(
  `Opening the link changes nothing: you confirm on the page it opens. The link
expires in ${args.hours} hours and works once.`,
  { size: "small" },
)}
${emailButton(escapeHtml(args.confirmUrl), "Confirm this address")}`,
    footer: `If you did not expect this, ignore this email and nothing is sent
here. Ask whoever runs ${escapeHtml(args.tenantName)} in your organization if
you are unsure. Never forward this email.`,
  });

/**
 * "N new findings since last week (+X/mo). M resolved (Y/mo freed)." The
 * money figures arrive pre-formatted. Zero-count parts degrade gracefully.
 */
const deltaBlock = (delta: {
  newCount: number;
  newImpact: string;
  resolvedCount: number;
  resolvedImpact: string;
}): string => {
  const fresh =
    delta.newCount > 0
      ? `<strong>${delta.newCount} new finding${delta.newCount === 1 ? "" : "s"} since last week (+${escapeHtml(delta.newImpact)}/mo).</strong>`
      : "No new findings since last week.";
  const resolved =
    delta.resolvedCount > 0
      ? ` ${delta.resolvedCount} resolved (${escapeHtml(delta.resolvedImpact)}/mo freed).`
      : "";
  return emailText(`${fresh}${resolved}`, { tone: "ink", size: "lead" });
};

/** Pre-composed plain-text line (renewal, AI spend) set off by a hairline rule. */
const lineBlock = (line: string): string =>
  `${emailRule()}${emailText(escapeHtml(line), { tone: "ink" })}`;

/** "Monthly spend X, waste Y, N open findings": the standing totals. */
const totalsBlock = (args: {
  monthlySpend: string;
  monthlyWaste: string;
  openFindings: number;
}): string =>
  emailText(
    `Monthly spend ${emailStrong(args.monthlySpend)} &middot;
    waste ${emailWaste(args.monthlyWaste)} &middot;
    ${args.openFindings} open finding${args.openFindings === 1 ? "" : "s"}`,
  );

/** Per-recipient footer of the scheduled emails: why, and how to stop them. */
export type EmailFooter = {
  /** Workspace the recipient administers. */
  workspaceName: string;
  /** "weekly digest" or "monthly report". */
  emailLabel: string;
  /** Personal one-click unsubscribe link for exactly this email type. */
  unsubscribeUrl: string;
  /** Page with the personal email toggles. */
  settingsUrl: string;
  /** The workspace's shared address: no membership, so the reason differs. */
  shared?: boolean;
};

const footerBlock = (footer: EmailFooter): string =>
  `${
    footer.shared
      ? `You get this because this address was added to ${escapeHtml(footer.workspaceName)} as a shared notification address.`
      : `You get this because you are an admin of ${escapeHtml(footer.workspaceName)}.`
  }<br>
${emailFooterLink(escapeHtml(footer.unsubscribeUrl), `Unsubscribe from the ${footer.emailLabel}`)}
&nbsp;&middot;&nbsp;
${emailFooterLink(escapeHtml(footer.settingsUrl), "Manage email settings")}`;

/** The weekly digest. Leads with the 7-day delta, then the standing totals. */
export const digestHtml = (args: {
  tenantName: string;
  currency: string;
  monthlySpend: string;
  monthlyWaste: string;
  openFindings: number;
  topFindings: { title: string; impact: string }[];
  appUrl: string;
  /** 7-day delta shown above the standing totals. */
  delta?: {
    newCount: number;
    newImpact: string;
    resolvedCount: number;
    resolvedImpact: string;
  };
  /** Pre-composed renewal-window line; omitted when no renewal is near. */
  renewalLine?: string;
  /** Pre-composed AI API spend line; omitted when no spend rows exist. */
  aiSpendLine?: string;
  footer: EmailFooter;
}): string =>
  emailShell({
    baseUrl: args.appUrl,
    title: `License waste: ${args.tenantName}`,
    body: `${emailHeading(`License waste: ${escapeHtml(args.tenantName)}`)}
${args.delta ? deltaBlock(args.delta) : ""}
${args.aiSpendLine ? lineBlock(args.aiSpendLine) : ""}
${totalsBlock(args)}
${emailRows(args.topFindings.map((f) => ({ label: f.title, value: `${f.impact}/mo` })))}
${args.renewalLine ? lineBlock(args.renewalLine) : ""}
${emailButton(emailAppLink(args.appUrl, "/app/findings"), "Open the findings")}`,
    footer: footerBlock(args.footer),
  });

/**
 * Weekly all-clear: sent instead of going silent when a recently synced
 * tenant has zero open findings, the moment the product proved its value.
 */
export const allClearHtml = (args: {
  tenantName: string;
  /** Findings resolved in the last 7 days; the line is omitted when 0. */
  resolvedCount: number;
  resolvedImpact: string;
  renewalLine?: string;
  /** Pre-composed AI API spend line; omitted when no spend rows exist. */
  aiSpendLine?: string;
  appUrl: string;
  footer: EmailFooter;
}): string =>
  emailShell({
    baseUrl: args.appUrl,
    title: `All clear: ${args.tenantName}`,
    body: `${emailHeading(`All clear: ${escapeHtml(args.tenantName)}`)}
${emailText("No open findings. Nothing new leaked this week.", { tone: "ink", size: "lead" })}
${
  args.resolvedCount > 0
    ? emailText(
        `${args.resolvedCount} finding${args.resolvedCount === 1 ? "" : "s"} resolved in the last 7 days (${escapeHtml(args.resolvedImpact)}/mo freed).`,
      )
    : ""
}
${args.renewalLine ? lineBlock(args.renewalLine) : ""}
${args.aiSpendLine ? lineBlock(args.aiSpendLine) : ""}
${emailButton(emailAppLink(args.appUrl, "/app/findings"), "Open LicenseMeter")}`,
    footer: footerBlock(args.footer),
  });

/**
 * Cover note for the monthly PDF report: one line of standing totals,
 * the attached report does the talking.
 */
export const reportHtml = (args: {
  tenantName: string;
  monthlySpend: string;
  monthlyWaste: string;
  openFindings: number;
  appUrl: string;
  footer: EmailFooter;
}): string =>
  emailShell({
    baseUrl: args.appUrl,
    title: `Monthly report: ${args.tenantName}`,
    body: `${emailHeading(`Monthly report: ${escapeHtml(args.tenantName)}`)}
${totalsBlock(args)}
${emailText("The full report is attached as PDF: board-ready, with every finding priced.", { tone: "ink" })}
${emailButton(emailAppLink(args.appUrl, "/app"), "Open LicenseMeter")}`,
    footer: footerBlock(args.footer),
  });

/**
 * Immediate alert when a sync inserts new offboarding-leak findings: seats
 * that keep billing after the user was disabled or removed. The wording stays
 * careful on purpose. A first scan reports leaks that are months old, so the
 * figure is an estimate from the price book, not a measured bill increase,
 * and a finding is a license to review, not a distinct person.
 */
export const leakAlertHtml = (args: {
  tenantName: string;
  leakCount: number;
  totalImpact: string;
  /** Highest cost first, at most ten; the rest is the omitted subtotal. */
  items: { title: string; impact: string }[];
  shownImpact: string;
  omittedCount: number;
  omittedImpact: string;
  /** Findings that add nothing to the estimate. */
  zeroCount: number;
  appUrl: string;
}): string =>
  emailShell({
    baseUrl: args.appUrl,
    title: `Potential license leaks: ${args.tenantName}`,
    body: `${emailHeading(`Potential license leaks: ${escapeHtml(args.tenantName)}`)}
${emailText(`The latest sync detected ${args.leakCount} finding${args.leakCount === 1 ? "" : "s"} involving
licenses associated with disabled accounts or application accounts without a
matching directory user. Combined estimated monthly impact:
${emailWaste(`${args.totalImpact}/mo`)}. Review each finding before reclaiming
licenses. Findings are not a count of distinct people.`)}
${emailText(
  `Newly detected findings may reflect existing issues, especially on a first
scan. This is not a measured increase in your bill. Estimates depend on your
price book and are not confirmed savings. Highest-cost findings appear first.`,
  { size: "small" },
)}
${emailRows(args.items.map((f) => ({ label: f.title, value: `${f.impact}/mo` })))}
${emailText(
  `${args.items.length} displayed finding${args.items.length === 1 ? "" : "s"}: ${escapeHtml(args.shownImpact)}/mo estimated.`,
  { tone: "ink", size: "small" },
)}
${
  args.omittedCount > 0
    ? emailText(
        `${args.omittedCount} additional finding${args.omittedCount === 1 ? "" : "s"}: ${escapeHtml(args.omittedImpact)}/mo estimated. View them in the app.`,
        { size: "small" },
      )
    : ""
}
${
  args.zeroCount > 0
    ? emailText(
        `${args.zeroCount} finding${args.zeroCount === 1 ? "" : "s"} currently contribute${args.zeroCount === 1 ? "s" : ""} zero to this estimate. Check the price book: zero may mean a free license or missing pricing.`,
        { size: "small" },
      )
    : ""
}
${emailButton(emailAppLink(args.appUrl, "/app/findings"), "Open the findings")}`,
    footer: `Immediate alert for new offboarding leaks. Turn these off in
${emailFooterLink(emailAppLink(args.appUrl, "/app/settings"), "Settings")}.`,
  });

/**
 * Workspace-deleted notice to the remaining owners/admins. Essential
 * transactional mail: no unsubscribe, sent once on an irreversible deletion so
 * other admins are not surprised that the data is gone.
 */
export const workspaceDeletedHtml = (args: {
  tenantName: string;
  /** Who triggered the deletion; shown so admins know it was a human action. */
  actor: string;
  appUrl: string;
}): string =>
  emailShell({
    baseUrl: args.appUrl,
    title: `Workspace deleted: ${args.tenantName}`,
    body: `${emailHeading(`Workspace deleted: ${escapeHtml(args.tenantName)}`)}
${emailText(`The LicenseMeter workspace ${emailStrong(args.tenantName)} was
deleted by ${emailStrong(args.actor)}. Every synced record (users, findings,
prices, history) has been permanently removed and this cannot be undone.`)}
${emailText("If this was not expected, reply to this email and we will help.")}`,
    footer: "A required notice about your workspace. Not a marketing email.",
  });
