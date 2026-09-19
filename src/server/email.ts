import { env } from "~/env";
import {
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

export const sendEmail = async (args: {
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
}): Promise<boolean> => {
  if (!emailEnabled()) return false;
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
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`Resend responded ${res.status}`);
  }
  return true;
};

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
    heading: `${escapeHtml(args.requesterEmail)} asked to join ${escapeHtml(args.tenantName)}`,
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
    heading: `${escapeHtml(args.memberEmail)} joined ${escapeHtml(args.tenantName)}`,
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
 * To the address of a membership from before sign-in moved to Microsoft: the
 * link proves the person signing in can read this mailbox.
 */
export const membershipClaimHtml = (args: {
  claimUrl: string;
  appUrl: string;
  minutes: number;
}): string =>
  noticeShell({
    appUrl: args.appUrl,
    title: "Confirm this is your LicenseMeter account",
    heading: "Confirm this is your LicenseMeter account",
    body: `Someone signed in to LicenseMeter with a Microsoft account and asked
    to open the workspaces that belong to this email address. If that was you,
    confirm it in the same browser you signed in with. The link works once and
    for ${args.minutes} minutes.`,
    cta: {
      href: escapeHtml(args.claimUrl),
      label: "Confirm and open my workspaces",
    },
    footer: `If this was not you, do not open the link and nothing changes:
    nobody gets access to your workspaces without it. Never forward this
    email.`,
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
};

const footerBlock = (footer: EmailFooter): string =>
  `You get this because you are an admin of ${escapeHtml(footer.workspaceName)}.<br>
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
 * Immediate alert when a sync inserts new offboarding-leak findings:
 * seats that keep billing after the user was disabled or removed.
 */
export const leakAlertHtml = (args: {
  tenantName: string;
  leakCount: number;
  totalImpact: string;
  /** Up to 10 rows; the remainder is summarized below the table. */
  items: { title: string; impact: string }[];
  appUrl: string;
}): string =>
  emailShell({
    baseUrl: args.appUrl,
    title: `New offboarding leaks: ${args.tenantName}`,
    body: `${emailHeading(`New offboarding leaks: ${escapeHtml(args.tenantName)}`)}
${emailText(`The last sync found ${args.leakCount} seat${args.leakCount === 1 ? "" : "s"} still paid for
after the user was disabled or removed:
${emailWaste(`${args.totalImpact}/mo`)} until reclaimed.`)}
${emailRows(args.items.map((f) => ({ label: f.title, value: `${f.impact}/mo` })))}
${
  args.leakCount > args.items.length
    ? emailText(`And ${args.leakCount - args.items.length} more in the app.`, {
        size: "small",
      })
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
