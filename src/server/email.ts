import { env, signInPath } from "~/env";
import { emailWordmark, escapeHtml } from "~/lib/html";

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
}): string => `
<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#1c1a16">
  ${emailWordmark(args.appUrl)}
  <h1 style="font-size:22px;font-weight:normal">
    ${escapeHtml(args.inviterName)} invited you to LicenseMeter
  </h1>
  <p style="font-family:Arial,sans-serif;font-size:14px;color:#6b665d;line-height:1.5">
    You have been added to the workspace
    <strong style="color:#1c1a16">${escapeHtml(args.tenantName)}</strong>
    as <strong style="color:#1c1a16">${escapeHtml(args.role)}</strong>.
    LicenseMeter shows which Microsoft 365 licenses the organization pays for
    but nobody uses, with read-only access to license metadata, never content.
  </p>
  <p style="margin:24px 0">
    <a href="${args.appUrl}${signInPath()}"
       style="font-family:Arial,sans-serif;font-size:14px;background:#1c1a16;color:#faf8f3;padding:12px 20px;text-decoration:none">
      Sign in to LicenseMeter
    </a>
  </p>
  <p style="font-family:Arial,sans-serif;font-size:12px;color:#a39d8f;line-height:1.5">
    Sign in with the account that uses this email address. If you did not expect
    this invitation, you can ignore this email. Nothing is shared without
    signing in.
  </p>
</div>`;

const noticeShell = (args: {
  appUrl: string;
  heading: string;
  body: string;
  cta: { href: string; label: string };
  footer: string;
}): string => `
<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#1c1a16">
  ${emailWordmark(args.appUrl)}
  <h1 style="font-size:22px;font-weight:normal">${args.heading}</h1>
  <p style="font-family:Arial,sans-serif;font-size:14px;color:#6b665d;line-height:1.5">
    ${args.body}
  </p>
  <p style="margin:24px 0">
    <a href="${args.cta.href}"
       style="font-family:Arial,sans-serif;font-size:14px;background:#1c1a16;color:#faf8f3;padding:12px 20px;text-decoration:none">
      ${args.cta.label}
    </a>
  </p>
  <p style="font-family:Arial,sans-serif;font-size:12px;color:#a39d8f;line-height:1.5">
    ${args.footer}
  </p>
</div>`;

const strong = (text: string): string =>
  `<strong style="color:#1c1a16">${escapeHtml(text)}</strong>`;

/** To owners/admins: a colleague on the workspace's domain asked to get in. */
export const joinRequestHtml = (args: {
  requesterEmail: string;
  tenantName: string;
  appUrl: string;
}): string =>
  noticeShell({
    appUrl: args.appUrl,
    heading: `${escapeHtml(args.requesterEmail)} asked to join ${escapeHtml(args.tenantName)}`,
    body: `${strong(args.requesterEmail)} signed in with a verified company
    email and asked for access to the workspace ${strong(args.tenantName)}.
    Nothing is shared until an owner or admin approves the request. Approved
    people start as viewer: read-only dashboards, findings and exports.`,
    cta: { href: `${args.appUrl}/app/settings`, label: "Review the request" },
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
    heading: `${escapeHtml(args.memberEmail)} joined ${escapeHtml(args.tenantName)}`,
    body: `${strong(args.memberEmail)} signed in with a verified company email
    and joined the workspace ${strong(args.tenantName)} as viewer: read-only
    dashboards, findings and exports. You can change the role or remove the
    member in Settings.`,
    cta: { href: `${args.appUrl}/app/settings`, label: "Open members" },
    footer: `You get this because this workspace lets colleagues join
    automatically. Owners can change that under Settings, Members.`,
  });

/** To the requester: an owner or admin approved the access request. */
export const joinApprovedHtml = (args: {
  tenantName: string;
  appUrl: string;
  signInUrl: string;
}): string =>
  noticeShell({
    appUrl: args.appUrl,
    heading: `You now have access to ${escapeHtml(args.tenantName)}`,
    body: `Your request to join the workspace ${strong(args.tenantName)} was
    approved. You have viewer access: read-only dashboards, findings and
    exports. Sign in and pick the workspace from the switcher in the sidebar.`,
    cta: { href: args.signInUrl, label: "Open LicenseMeter" },
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
  return `
  <p style="font-family:Arial,sans-serif;font-size:14px;color:#1c1a16;line-height:1.5">
    ${fresh}${resolved}
  </p>`;
};

/** Pre-composed plain-text line (renewal, AI spend) set off by a hairline rule. */
const lineBlock = (line: string): string => `
  <p style="font-family:Arial,sans-serif;font-size:14px;color:#1c1a16;line-height:1.5;border-top:1px solid #e7e2d6;padding-top:12px;margin-top:16px">
    ${escapeHtml(line)}
  </p>`;

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

const footerBlock = (footer: EmailFooter): string => `
  <p style="font-family:Arial,sans-serif;font-size:11px;color:#a39d8f;line-height:1.5;margin-top:24px">
    You get this because you are an admin of ${escapeHtml(footer.workspaceName)}.
    <a href="${escapeHtml(footer.unsubscribeUrl)}" style="color:#6b665d">Unsubscribe from the ${escapeHtml(footer.emailLabel)}</a> ·
    <a href="${escapeHtml(footer.settingsUrl)}" style="color:#6b665d">Manage email settings</a>
  </p>`;

/** Minimal, inline-styled digest that survives Outlook. Leads with the 7-day delta. */
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
}): string => `
<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#1c1a16">
  ${emailWordmark(args.appUrl)}
  <h1 style="font-size:22px;font-weight:normal">License waste: ${escapeHtml(args.tenantName)}</h1>
  ${args.delta ? deltaBlock(args.delta) : ""}
  ${args.aiSpendLine ? lineBlock(args.aiSpendLine) : ""}
  <p style="font-family:Arial,sans-serif;font-size:14px;color:#6b665d">
    Monthly spend ${escapeHtml(args.monthlySpend)} ·
    waste <strong style="color:#a8330d">${escapeHtml(args.monthlyWaste)}</strong> ·
    ${args.openFindings} open findings
  </p>
  <table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px">
    ${args.topFindings
      .map(
        (f) => `<tr>
      <td style="padding:8px 0;border-bottom:1px solid #e7e2d6">${escapeHtml(f.title)}</td>
      <td style="padding:8px 0;border-bottom:1px solid #e7e2d6;text-align:right;color:#a8330d;white-space:nowrap">${escapeHtml(f.impact)}/mo</td>
    </tr>`,
      )
      .join("")}
  </table>
  ${args.renewalLine ? lineBlock(args.renewalLine) : ""}
  <p style="font-family:Arial,sans-serif;font-size:13px;margin-top:16px">
    <a href="${args.appUrl}/app/findings" style="color:#1c1a16">Open the findings →</a>
  </p>
  ${footerBlock(args.footer)}
</div>`;

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
}): string => `
<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#1c1a16">
  ${emailWordmark(args.appUrl)}
  <h1 style="font-size:22px;font-weight:normal">All clear: ${escapeHtml(args.tenantName)}</h1>
  <p style="font-family:Arial,sans-serif;font-size:14px;color:#1c1a16;line-height:1.5">
    No open findings. Nothing new leaked this week.
  </p>
  ${
    args.resolvedCount > 0
      ? `<p style="font-family:Arial,sans-serif;font-size:14px;color:#6b665d;line-height:1.5">
    ${args.resolvedCount} finding${args.resolvedCount === 1 ? "" : "s"} resolved in the last 7 days (${escapeHtml(args.resolvedImpact)}/mo freed).
  </p>`
      : ""
  }
  ${args.renewalLine ? lineBlock(args.renewalLine) : ""}
  ${args.aiSpendLine ? lineBlock(args.aiSpendLine) : ""}
  <p style="font-family:Arial,sans-serif;font-size:13px;margin-top:16px">
    <a href="${args.appUrl}/app/findings" style="color:#1c1a16">Open LicenseMeter →</a>
  </p>
  ${footerBlock(args.footer)}
</div>`;

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
}): string => `
<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#1c1a16">
  ${emailWordmark(args.appUrl)}
  <h1 style="font-size:22px;font-weight:normal">Monthly report: ${escapeHtml(args.tenantName)}</h1>
  <p style="font-family:Arial,sans-serif;font-size:14px;color:#6b665d">
    Monthly spend ${escapeHtml(args.monthlySpend)} ·
    waste <strong style="color:#a8330d">${escapeHtml(args.monthlyWaste)}</strong> ·
    ${args.openFindings} open findings
  </p>
  <p style="font-family:Arial,sans-serif;font-size:14px;color:#1c1a16;line-height:1.5">
    The full report is attached as PDF: board-ready, with every finding priced.
  </p>
  <p style="font-family:Arial,sans-serif;font-size:13px;margin-top:16px">
    <a href="${args.appUrl}/app" style="color:#1c1a16">Open LicenseMeter →</a>
  </p>
  ${footerBlock(args.footer)}
</div>`;

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
}): string => `
<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#1c1a16">
  ${emailWordmark(args.appUrl)}
  <h1 style="font-size:22px;font-weight:normal">New offboarding leaks: ${escapeHtml(args.tenantName)}</h1>
  <p style="font-family:Arial,sans-serif;font-size:14px;color:#6b665d;line-height:1.5">
    The last sync found ${args.leakCount} seat${args.leakCount === 1 ? "" : "s"} still paid for
    after the user was disabled or removed:
    <strong style="color:#a8330d">${escapeHtml(args.totalImpact)}/mo</strong> until reclaimed.
  </p>
  <table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px">
    ${args.items
      .map(
        (f) => `<tr>
      <td style="padding:8px 0;border-bottom:1px solid #e7e2d6">${escapeHtml(f.title)}</td>
      <td style="padding:8px 0;border-bottom:1px solid #e7e2d6;text-align:right;color:#a8330d;white-space:nowrap">${escapeHtml(f.impact)}/mo</td>
    </tr>`,
      )
      .join("")}
  </table>
  ${
    args.leakCount > args.items.length
      ? `<p style="font-family:Arial,sans-serif;font-size:13px;color:#6b665d">
    And ${args.leakCount - args.items.length} more in the app.
  </p>`
      : ""
  }
  <p style="font-family:Arial,sans-serif;font-size:13px;margin-top:16px">
    <a href="${args.appUrl}/app/findings" style="color:#1c1a16">Open the findings →</a>
  </p>
  <p style="font-family:Arial,sans-serif;font-size:11px;color:#a39d8f;margin-top:24px">
    Immediate alert for new offboarding leaks. Turn these off in Settings.
  </p>
</div>`;

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
}): string => `
<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#1c1a16">
  ${emailWordmark(args.appUrl)}
  <h1 style="font-size:22px;font-weight:normal">Workspace deleted: ${escapeHtml(args.tenantName)}</h1>
  <p style="font-family:Arial,sans-serif;font-size:14px;color:#6b665d;line-height:1.55">
    The LicenseMeter workspace
    <strong style="color:#1c1a16">${escapeHtml(args.tenantName)}</strong> was
    deleted by <strong style="color:#1c1a16">${escapeHtml(args.actor)}</strong>.
    Every synced record (users, findings, prices, history) has been
    permanently removed and this cannot be undone.
  </p>
  <p style="font-family:Arial,sans-serif;font-size:14px;color:#6b665d;line-height:1.55">
    If this was not expected, reply to this email and we will help.
  </p>
  <p style="font-family:Arial,sans-serif;font-size:11px;color:#a39d8f;margin-top:24px">
    A required notice about your workspace. Not a marketing email.
  </p>
</div>`;
