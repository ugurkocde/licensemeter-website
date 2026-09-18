import { DEMO_FIGURES, demoEuros } from "~/lib/demoFigures";
import { emailWordmark, escapeHtml } from "~/lib/html";
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

const sans = "font-family:Arial,sans-serif";
const mono = "font-family:Consolas,Menlo,monospace";

const step = (n: string, html: string): string => `<tr>
      <td style="${mono};font-size:12px;color:#a8330d;padding:10px 12px 10px 0;border-bottom:1px solid #e7e2d6;vertical-align:top;white-space:nowrap">${n}</td>
      <td style="${sans};font-size:14px;color:#1c1a16;line-height:1.55;padding:10px 0;border-bottom:1px solid #e7e2d6">${html}</td>
    </tr>`;

const fact = (lead: string, rest: string): string => `<tr>
      <td style="${sans};font-size:13px;color:#6b665d;line-height:1.55;padding:7px 0">
        <strong style="color:#1c1a16">${lead}</strong> ${rest}
      </td>
    </tr>`;

export const welcomeHtml = (args: {
  email: string;
  /** Canonical site origin, no trailing slash (siteUrl()). */
  baseUrl: string;
  /** Pre-built, token-signed unsubscribe link. */
  unsubscribeUrl: string;
}): string => {
  const domain = welcomeDomain(args.email);
  const connectUrl = `${args.baseUrl}/app/connect?${UTM}`;
  const securityUrl = `${args.baseUrl}/security?${UTM}`;
  const homeUrl = `${args.baseUrl}/?${UTM}`;
  const csvImportUrl = `${args.baseUrl}/app/connect/csv?${UTM}`;
  const dpaUrl = `${args.baseUrl}/dpa?${UTM}`;
  const demoWaste = `€ ${demoEuros(DEMO_FIGURES.monthlyWasteCents)}`;

  return `
<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#1c1a16">
  <span style="display:none;max-height:0;overflow:hidden">Fifteen minutes to your number, and everything IT security will ask, ready to forward.</span>
  ${emailWordmark(args.baseUrl)}

  <h1 style="font-size:24px;font-weight:normal;margin:0 0 12px">
    Your first waste scan${domain ? ` for ${escapeHtml(domain)}` : ""}
  </h1>
  <p style="${sans};font-size:14px;color:#6b665d;line-height:1.55;margin:0 0 20px">
    You left your email on licensemeter.com. Here is everything you need to
    see what ${domain ? escapeHtml(domain) : "your tenant"} pays every month
    for seats nobody uses, including the security one-pager your Global Admin
    will ask for. It is further down, written so you can forward this email
    as-is.
  </p>

  <table style="width:100%;border-collapse:collapse;margin:0 0 24px">
    ${step("01", "Sign in: any work account, no setup and nothing installed.")}
    ${step("02", `Your Global Administrator (or Privileged Role Administrator) approves <strong>read-only</strong> access once. Not the admin yourself? Forward this email; the one-pager below answers what they will ask.`)}
    ${step("03", "The first sync takes about two minutes. You get every unused, leaked or forgotten seat priced in euros per month, plus PowerShell scripts to reclaim them.")}
  </table>

  <p style="margin:0 0 10px">
    <a href="${escapeHtml(connectUrl)}"
       style="${sans};font-size:14px;background:#1c1a16;color:#faf8f3;padding:12px 20px;text-decoration:none">
      Connect your tenant (read-only)
    </a>
  </p>
  <p style="${sans};font-size:13px;color:#6b665d;line-height:1.55;margin:0 0 32px">
    Want to poke around first? The
    <a href="${escapeHtml(homeUrl)}" style="color:#1c1a16">live demo</a> is a
    ${DEMO_FIGURES.users}-person tenant wasting ${demoWaste} a month. One click, no account.
    No admin with consent rights at hand? Start with the
    <a href="${escapeHtml(csvImportUrl)}" style="color:#1c1a16">CSV import</a>:
    your number from two admin-center exports, no consent at all.
    An Application Administrator? The
    <a href="${escapeHtml(connectUrl)}" style="color:#1c1a16">instant scan</a>
    runs with your own permissions, one click after sign-in.
  </p>

  <div style="border:1px solid #d2ccbb;background:#faf8f3;padding:20px 22px;margin:0 0 28px">
    <p style="${sans};font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#a8330d;margin:0 0 8px">
      For your Global Admin: the one-pager
    </p>
    <p style="${sans};font-size:13px;color:#6b665d;line-height:1.55;margin:0 0 14px">
      LicenseMeter requests exactly these Microsoft Graph application
      permissions, granted once through the standard admin-consent screen.
      All of them are read-only:
    </p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 14px">
      ${CONNECTOR_SCOPES.map(
        (s) => `<tr>
      <td style="${mono};font-size:12px;color:#1c1a16;padding:6px 12px 6px 0;border-bottom:1px solid #e7e2d6;vertical-align:top;white-space:nowrap">${escapeHtml(s.scope)}</td>
      <td style="${sans};font-size:12px;color:#6b665d;line-height:1.5;padding:6px 0;border-bottom:1px solid #e7e2d6">${escapeHtml(s.why)}</td>
    </tr>`,
      ).join("")}
    </table>
    <table style="width:100%;border-collapse:collapse">
      ${fact("No write access, ever.", "Remediation ships as PowerShell scripts your admins review and run themselves.")}
      ${fact("Never content.", "License assignments, sign-in activity and usage metadata only. No mailboxes, no files, no messages.")}
      ${fact("EU data residency.", "Hosted in Frankfurt; disconnecting deletes all synced data immediately.")}
    </table>
    <p style="${sans};font-size:13px;color:#6b665d;line-height:1.55;margin:14px 0 0">
      Microsoft requires a Global Administrator or Privileged Role
      Administrator for these application permissions; larger organizations
      can delegate consent for exactly these five permissions. The security
      overview shows how.
    </p>
    <p style="${sans};font-size:13px;margin:14px 0 0">
      <a href="${escapeHtml(securityUrl)}" style="color:#1c1a16">Full security overview →</a>
      <span style="color:#a39d8f">&nbsp;·&nbsp; The pre-signed AVV (DPA) is available at <a href="${escapeHtml(dpaUrl)}" style="color:#a39d8f">licensemeter.com/dpa</a>.</span>
    </p>
  </div>

  <p style="${sans};font-size:14px;color:#1c1a16;line-height:1.55;margin:0 0 4px">
    I read every reply. Questions about scopes, features or your setup land
    directly with me.
  </p>
  <p style="${sans};font-size:13px;color:#6b665d;margin:0 0 32px">
    Ugur Koc · Microsoft MVP for Intune and Security Copilot
  </p>

  <p style="${sans};font-size:11px;color:#a39d8f;line-height:1.6;border-top:1px solid #e7e2d6;padding-top:14px;margin:0">
    You get this one email because ${escapeHtml(args.email)} was entered on
    licensemeter.com. LicenseMeter is free to use. You can <a href="${escapeHtml(args.unsubscribeUrl)}" style="color:#a39d8f">unsubscribe</a>
    any time. LicenseMeter · EU-hosted in Frankfurt.
  </p>
</div>`;
};
