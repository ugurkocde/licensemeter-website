import { DEMO_FIGURES, demoEuros } from "~/lib/demoFigures";
import {
  EMAIL_COLORS,
  emailAddressText,
  EMAIL_MONO,
  EMAIL_SANS,
  emailAppLink,
  emailButton,
  emailEyebrow,
  emailFooterLink,
  emailHeading,
  emailShell,
  emailStrong,
  emailText,
} from "~/lib/emailLayout";
import { escapeHtml } from "~/lib/html";
import { CONNECTOR_SCOPES } from "~/lib/scopes";

/**
 * The automated welcome email for landing-page signups. Designed to be
 * forwarded: the middle section is the security one-pager a Global Admin
 * needs to approve the read-only consent, with the scope table rendered
 * from the same CONNECTOR_SCOPES constant as the connect page, so the email
 * can never promise different permissions than the consent screen shows.
 * Pure module (no env, no db) so the content stays unit-testable.
 */

const UTM = "utm_source=welcome_email&utm_medium=email&utm_campaign=first_scan";

/** Freemail domains get neutral wording instead of "for gmail.com". */
const FREEMAIL = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "outlook.de",
  "hotmail.com",
  "hotmail.de",
  "live.com",
  "live.de",
  "msn.com",
  "yahoo.com",
  "yahoo.de",
  "icloud.com",
  "me.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "pm.me",
  "gmx.de",
  "gmx.net",
  "gmx.at",
  "gmx.ch",
  "web.de",
  "t-online.de",
  "freenet.de",
  "posteo.de",
  "mailbox.org",
]);

/** The business domain of an address, or null for freemail/unparseable. */
export const welcomeDomain = (email: string): string | null => {
  const domain = email.trim().toLowerCase().split("@")[1] ?? "";
  if (!domain.includes(".") || FREEMAIL.has(domain)) return null;
  return domain;
};

export const welcomeSubject = (email: string): string => {
  const domain = welcomeDomain(email);
  return domain
    ? `Your first waste scan for ${domain}, plus the one-pager for your Global Admin`
    : "Your first waste scan, plus the one-pager for your Global Admin";
};

const C = EMAIL_COLORS;

/** `href` must already be escaped; `label` is plain text. */
const inlineLink = (href: string, label: string): string =>
  `<a href="${href}" style="color:${C.brandText};font-weight:600;text-decoration:none">${escapeHtml(label)}</a>`;

const step = (n: string, html: string): string => `<tr>
<td style="${EMAIL_MONO};font-size:12px;font-weight:700;color:${C.brandText};padding:12px 14px 12px 0;border-bottom:1px solid ${C.line};vertical-align:top;white-space:nowrap">${n}</td>
<td style="${EMAIL_SANS};font-size:15px;line-height:23px;color:${C.ink};padding:12px 0;border-bottom:1px solid ${C.line}">${html}</td>
</tr>`;

const fact = (lead: string, rest: string): string => `<tr>
<td style="${EMAIL_SANS};font-size:14px;line-height:22px;color:${C.soft};padding:6px 0">${emailStrong(lead)} ${escapeHtml(rest)}</td>
</tr>`;

export const welcomeHtml = (args: {
  email: string;
  /** Canonical site origin, no trailing slash (siteUrl()). */
  baseUrl: string;
  /** Pre-built, token-signed unsubscribe link. */
  unsubscribeUrl: string;
}): string => {
  const domain = welcomeDomain(args.email);
  // Through sign-in: the reader has no account yet, and a signed-out request
  // to an /app path would land on the marketing home page.
  const connectUrl = emailAppLink(args.baseUrl, "/app/connect", UTM);
  const csvImportUrl = emailAppLink(args.baseUrl, "/app/connect/csv", UTM);
  const securityUrl = escapeHtml(`${args.baseUrl}/security?${UTM}`);
  const homeUrl = escapeHtml(`${args.baseUrl}/?${UTM}`);
  const dpaUrl = escapeHtml(`${args.baseUrl}/dpa?${UTM}`);
  const demoWaste = `€ ${demoEuros(DEMO_FIGURES.monthlyWasteCents)}`;

  return emailShell({
    baseUrl: args.baseUrl,
    title: "Your first waste scan",
    preheader:
      "Fifteen minutes to your number, and everything IT security will ask, ready to forward.",
    body: `${emailHeading(`Your first waste scan${domain ? ` for ${escapeHtml(domain)}` : ""}`, "large")}
${emailText(
  `You left your email on licensemeter.com. Here is everything you need to
see what ${domain ? escapeHtml(domain) : "your tenant"} pays every month for
seats nobody uses, including the security one-pager your Global Admin will ask
for. It is further down, written so you can forward this email as-is.`,
  { size: "lead" },
)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0">
${step("01", "Sign in: any work account, no setup and nothing installed.")}
${step("02", `Your Global Administrator (or Privileged Role Administrator) approves ${emailStrong("read-only")} access once. Not the admin yourself? Forward this email; the one-pager below answers what they will ask.`)}
${step("03", "The first sync takes about two minutes. You get every unused, leaked or forgotten seat priced in euros per month, plus PowerShell scripts to reclaim them.")}
</table>
${emailButton(connectUrl, "Connect your tenant (read-only)")}
${emailText(
  `Want to poke around first? The ${inlineLink(homeUrl, "live demo")} is a
${DEMO_FIGURES.users}-person tenant wasting ${demoWaste} a month. One click, no
account. No admin with consent rights at hand? Start with the
${inlineLink(csvImportUrl, "CSV import")}: your number from two admin-center
exports, no consent at all. An Application Administrator? The
${inlineLink(connectUrl, "instant scan")} runs with your own permissions, one
click after sign-in.`,
  { size: "small" },
)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.brandSoft};border-radius:10px;margin:8px 0 28px 0">
<tr>
<td style="${EMAIL_SANS};padding:22px 22px 20px 22px;border-left:3px solid ${C.brand};border-radius:10px">
${emailEyebrow("For your Global Admin: the one-pager", C.brandStrong)}
<p style="margin:0 0 14px 0;font-size:14px;line-height:22px;color:${C.brandStrong}">
LicenseMeter requests exactly these Microsoft Graph application permissions,
granted once through the standard admin-consent screen. All of them are
read-only:
</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 14px 0;background:${C.card};border-radius:8px">
${CONNECTOR_SCOPES.map(
  (s) => `<tr>
<td style="${EMAIL_MONO};font-size:12px;color:${C.ink};padding:9px 12px;border-bottom:1px solid ${C.line};vertical-align:top;white-space:nowrap">${escapeHtml(s.scope)}</td>
<td style="${EMAIL_SANS};font-size:13px;line-height:20px;color:${C.soft};padding:9px 12px 9px 0;border-bottom:1px solid ${C.line}">${escapeHtml(s.why)}</td>
</tr>`,
).join("\n")}
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${fact("No write access, ever.", "Remediation ships as PowerShell scripts your admins review and run themselves.")}
${fact("Never content.", "License assignments, sign-in activity and usage metadata only. No mailboxes, no files, no messages.")}
${fact("EU data residency.", "Hosted in Frankfurt; disconnecting deletes all synced data immediately.")}
</table>
<p style="margin:14px 0 0 0;font-size:14px;line-height:22px;color:${C.brandStrong}">
Microsoft requires a Global Administrator or Privileged Role Administrator for
these application permissions; larger organizations can delegate consent for
exactly these five permissions. The security overview shows how.
</p>
<p style="margin:14px 0 0 0;font-size:14px;line-height:22px;color:${C.soft}">
${inlineLink(securityUrl, "Full security overview")}
&nbsp;&middot;&nbsp; The pre-signed AVV (DPA) is available at
${inlineLink(dpaUrl, "licensemeter.com/dpa")}.
</p>
</td>
</tr>
</table>
${emailText("I read every reply. Questions about scopes, features or your setup land directly with me.", { tone: "ink" })}
<p style="margin:0;font-size:15px;line-height:22px;font-weight:600;color:${C.ink}">Ugur Koc</p>
<p style="margin:0 0 16px 0;font-size:13px;line-height:20px;color:${C.faint}">Microsoft MVP for Intune and Security Copilot</p>`,
    footer: `You get this one email because ${emailAddressText(args.email)} was entered on
licensemeter.com. Scans, findings, reports and exports are free, with no time
limit. You can ${emailFooterLink(escapeHtml(args.unsubscribeUrl), "unsubscribe")}
any time.<br>LicenseMeter, EU-hosted in Frankfurt.`,
  });
};
