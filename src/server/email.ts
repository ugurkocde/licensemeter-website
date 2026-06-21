import { env } from "~/env";
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
}): Promise<boolean> => {
  if (!emailEnabled()) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
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
    <a href="${args.appUrl}/api/auth/signin"
       style="font-family:Arial,sans-serif;font-size:14px;background:#1c1a16;color:#faf8f3;padding:12px 20px;text-decoration:none">
      Sign in with Microsoft
    </a>
  </p>
  <p style="font-family:Arial,sans-serif;font-size:12px;color:#a39d8f;line-height:1.5">
    Use the Microsoft account for this email address. If you did not expect
    this invitation, you can ignore this email. Nothing is shared without
    signing in.
  </p>
</div>`;

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
  <p style="font-family:Arial,sans-serif;font-size:11px;color:#a39d8f;margin-top:24px">
    Weekly digest for workspace admins. Manage members in Settings.
  </p>
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
  <p style="font-family:Arial,sans-serif;font-size:11px;color:#a39d8f;margin-top:24px">
    Weekly digest for workspace admins. Manage members in Settings.
  </p>
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
  <p style="font-family:Arial,sans-serif;font-size:11px;color:#a39d8f;margin-top:24px">
    Monthly PDF report for workspace admins. Turn this off in Settings.
  </p>
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

/** Primary call-to-action button, matching the dark wordmark buttons. */
const ctaButton = (href: string, label: string): string => `
  <p style="margin:24px 0">
    <a href="${href}"
       style="font-family:Arial,sans-serif;font-size:14px;background:#1c1a16;color:#faf8f3;padding:12px 20px;text-decoration:none">
      ${escapeHtml(label)}
    </a>
  </p>`;

/** Footer with a one-click unsubscribe, for suppressible reminder nudges. */
const reminderFooter = (unsubscribeUrl: string): string => `
  <p style="font-family:Arial,sans-serif;font-size:11px;color:#a39d8f;line-height:1.5;margin-top:24px">
    You get these reminders while your workspace is on trial. Manage billing
    anytime in the app. <a href="${unsubscribeUrl}" style="color:#a39d8f">Unsubscribe</a>
    to stop reminders for this workspace.
  </p>`;

/**
 * In-trial nudge (day 7 / 12 / last). Suppressible: carries an unsubscribe
 * link and is gated on the workspace's trialReminders flag by the caller.
 */
export const trialReminderHtml = (args: {
  tenantName: string;
  daysLeft: number;
  /** Pre-formatted recoverable-waste line; omitted when no number yet. */
  wasteLine?: string;
  appUrl: string;
  unsubscribeUrl: string;
}): string => {
  const when =
    args.daysLeft <= 0
      ? "ends today"
      : args.daysLeft === 1
        ? "ends tomorrow"
        : `ends in ${args.daysLeft} days`;
  return `
<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#1c1a16">
  ${emailWordmark(args.appUrl)}
  <h1 style="font-size:22px;font-weight:normal">Your trial ${when}: ${escapeHtml(args.tenantName)}</h1>
  <p style="font-family:Arial,sans-serif;font-size:14px;color:#6b665d;line-height:1.55">
    Keep monitoring license waste after the trial. Upgrade now to avoid any
    interruption to nightly sync, exports and alerts.
  </p>
  ${args.wasteLine ? lineBlock(args.wasteLine) : ""}
  ${ctaButton(`${args.appUrl}/app/billing`, "Choose a plan")}
  ${reminderFooter(args.unsubscribeUrl)}
</div>`;
};

/**
 * Trial-ended notice (sent once). Essential transactional mail: no unsubscribe,
 * always sent regardless of the reminders flag.
 */
export const trialExpiredHtml = (args: {
  tenantName: string;
  wasteLine?: string;
  appUrl: string;
}): string => `
<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#1c1a16">
  ${emailWordmark(args.appUrl)}
  <h1 style="font-size:22px;font-weight:normal">Trial ended: ${escapeHtml(args.tenantName)}</h1>
  <p style="font-family:Arial,sans-serif;font-size:14px;color:#6b665d;line-height:1.55">
    Your 14-day trial has ended. Your dashboard stays available, but exports,
    nightly sync and alerts are paused until you choose a plan.
  </p>
  ${args.wasteLine ? lineBlock(args.wasteLine) : ""}
  ${ctaButton(`${args.appUrl}/app/billing`, "Choose a plan")}
  <p style="font-family:Arial,sans-serif;font-size:11px;color:#a39d8f;margin-top:24px">
    A required notice about your workspace. Not a marketing email.
  </p>
</div>`;

/**
 * Failed-payment dunning notice. Essential transactional mail. Access is
 * retained during Stripe's automatic retries (the grace window), so the copy
 * is truthful about "avoid interruption".
 */
export const paymentFailedHtml = (args: {
  tenantName: string;
  /** Stripe hosted invoice URL to update the card / pay; falls back to the app. */
  invoiceUrl?: string;
  appUrl: string;
}): string => `
<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#1c1a16">
  ${emailWordmark(args.appUrl)}
  <h1 style="font-size:22px;font-weight:normal">Payment failed: ${escapeHtml(args.tenantName)}</h1>
  <p style="font-family:Arial,sans-serif;font-size:14px;color:#6b665d;line-height:1.55">
    We could not charge your card. We will retry automatically over the coming
    days. Update your payment method to avoid any interruption to monitoring.
  </p>
  ${ctaButton(args.invoiceUrl ?? `${args.appUrl}/app/billing`, "Update payment method")}
  <p style="font-family:Arial,sans-serif;font-size:11px;color:#a39d8f;margin-top:24px">
    A required notice about your subscription. Not a marketing email.
  </p>
</div>`;

/**
 * Paid-subscription confirmation cover note. Essential transactional mail; the
 * VAT-compliant invoice PDF is sent separately by Stripe.
 */
export const subscriptionConfirmedHtml = (args: {
  tenantName: string;
  planName: string;
  invoiceUrl?: string;
  appUrl: string;
  /** Formatted first-charge date when the subscription is still in its
   *  preserved free trial; switches the copy to "nothing charged yet". */
  trialEndsAt?: string;
}): string => `
<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#1c1a16">
  ${emailWordmark(args.appUrl)}
  <h1 style="font-size:22px;font-weight:normal">You're on ${escapeHtml(args.planName)}: ${escapeHtml(args.tenantName)}</h1>
  ${
    args.trialEndsAt
      ? `<p style="font-family:Arial,sans-serif;font-size:14px;color:#6b665d;line-height:1.55">
    Thanks for subscribing &mdash; and you keep your free trial.
    <strong style="color:#1c1a16">Nothing is charged today.</strong>
    Your card is on file; your trial runs until
    <strong style="color:#1c1a16">${escapeHtml(args.trialEndsAt)}</strong>, when
    ${escapeHtml(args.planName)} begins at the listed monthly price and Stripe
    emails your first receipt. Nightly sync, exports and alerts stay on, and you
    can cancel anytime before then.
  </p>`
      : `<p style="font-family:Arial,sans-serif;font-size:14px;color:#6b665d;line-height:1.55">
    Thanks for subscribing. Nightly sync, exports and alerts stay on. Your
    receipt and invoice are emailed separately by Stripe.
  </p>
  ${
    args.invoiceUrl
      ? `<p style="font-family:Arial,sans-serif;font-size:13px;margin-top:8px"><a href="${args.invoiceUrl}" style="color:#1c1a16">View your invoice &rarr;</a></p>`
      : ""
  }`
  }
  ${ctaButton(`${args.appUrl}/app/billing`, "Manage billing")}
  <p style="font-family:Arial,sans-serif;font-size:11px;color:#a39d8f;margin-top:24px">
    A required notice about your subscription. Not a marketing email.
  </p>
</div>`;

/**
 * Upgrade nudge for a subscribed tenant that has outgrown (or is nearing) its
 * plan's seat band. Pure copy: we never auto-charge — the owner chooses to
 * change plan. Carries a one-click unsubscribe like the other nudges.
 */
export const seatNudgeHtml = (args: {
  tenantName: string;
  planName: string;
  seats: number;
  seatMax: number;
  /** Band to move up to; null when past self-serve (-> MSP). */
  recommendedName: string | null;
  over: boolean;
  appUrl: string;
  unsubscribeUrl: string;
}): string => `
<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#1c1a16">
  ${emailWordmark(args.appUrl)}
  <h1 style="font-size:22px;font-weight:normal">${args.over ? "Your plan is below your seat count" : "You're nearing your plan's seat limit"}: ${escapeHtml(args.tenantName)}</h1>
  <p style="font-family:Arial,sans-serif;font-size:14px;color:#6b665d;line-height:1.55">
    ${escapeHtml(args.tenantName)} now has
    <strong style="color:#1c1a16">${args.seats} licensed seats</strong>. Your
    ${escapeHtml(args.planName)} plan covers up to ${args.seatMax}.
    ${
      args.recommendedName
        ? `Moving up to <strong style="color:#1c1a16">${escapeHtml(args.recommendedName)}</strong> keeps you within plan &mdash; one click, and the switch prorates automatically.`
        : args.over
          ? `That is past our self-serve bands &mdash; reply and we will set you up with an MSP plan.`
          : `You are near the top of our self-serve bands &mdash; reply and we will line up an MSP plan before you outgrow ${escapeHtml(args.planName)}.`
    }
    Nothing changes automatically; you stay on ${escapeHtml(args.planName)} until
    you choose to upgrade.
  </p>
  ${ctaButton(`${args.appUrl}/app/billing`, args.recommendedName ? "Change plan" : "Talk to us")}
  <p style="font-family:Arial,sans-serif;font-size:11px;color:#a39d8f;margin-top:24px">
    You receive plan nudges for this workspace.
    <a href="${args.unsubscribeUrl}" style="color:#a39d8f">Unsubscribe</a>.
  </p>
</div>`;
