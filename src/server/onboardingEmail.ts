import {
  EMAIL_COLORS,
  EMAIL_MONO,
  EMAIL_SANS,
  emailAppLink,
  emailButton,
  emailCallout,
  emailEyebrow,
  emailFooterLink,
  emailHeading,
  emailQuietLink,
  emailRule,
  emailShell,
  emailText,
  emailTextLink,
} from "~/lib/emailLayout";
import { escapeHtml } from "~/lib/html";

/**
 * The one-time onboarding email for a person whose first sign-in created
 * their own workspace. Three steps from sign-in to first findings, each
 * linking the documentation article that covers it. Not to be confused with
 * welcomeEmail.ts, which answers a landing-page email capture before any
 * account exists. Pure module (no env, no db) so the content stays
 * unit-testable.
 */

const DOCS = "https://docs.licensemeter.com";
const UTM =
  "utm_source=onboarding_email&utm_medium=email&utm_campaign=first_sign_in";

export const ONBOARDING_SUBJECT =
  "Welcome to LicenseMeter: your first 15 minutes";

type DocLink = { path: string; label: string };
type Step = { title: string; body: string; links: DocLink[] };

const STEPS: Step[] = [
  {
    title: "Connect your data",
    body: "Signing in does not give LicenseMeter access to your Microsoft 365 data. You choose how it gets in: a managed connector for continuous sync, a one-time instant scan, or a CSV import with no API consent.",
    links: [
      { path: "getting-started", label: "Which connection fits?" },
      { path: "connectors/microsoft", label: "Connect Microsoft 365" },
      {
        path: "getting-started/csv-import",
        label: "Import Microsoft CSV exports",
      },
    ],
  },
  {
    title: "Review your first findings",
    body: "After the first sync, LicenseMeter lists accounts that still hold licenses they likely do not need. Each finding shows its evidence and estimated monthly cost.",
    links: [
      { path: "getting-started/first-sync", label: "Verify your first sync" },
      {
        path: "getting-started/first-review",
        label: "Review your first finding",
      },
      { path: "findings/rules", label: "Detection rules" },
    ],
  },
  {
    title: "Use your contract prices",
    body: "Savings figures start from list-price estimates. Enter your contract prices before you share numbers with procurement.",
    links: [{ path: "licenses-and-prices", label: "Licenses and prices" }],
  },
];

const MORE: DocLink[] = [
  { path: "connectors", label: "Adobe, Zoom, Atlassian and more" },
  { path: "ai-costs", label: "Track AI API costs" },
  { path: "renewals", label: "Renewal calendar" },
  { path: "workspace/members", label: "Invite colleagues, manage access" },
  { path: "exports", label: "Exports and reports" },
  { path: "troubleshooting", label: "Troubleshooting" },
];

/** Every documentation path the email links, for the link-rot test. */
export const ONBOARDING_DOC_PATHS: string[] = [
  ...STEPS.flatMap((s) => s.links),
  ...MORE,
].map((l) => l.path);

/**
 * A first name to greet, or null when the display name does not safely yield
 * one. Entra display names are free text ("Koc, Ugur", "Ugur Koc (Admin)",
 * "IT Helpdesk", a UPN), so anything but a plain leading word is refused
 * rather than guessed at.
 */
// Words that mark a shared, role or service account ("Sales Team", "Front
// Desk", "System Administrator"), where the first word is no given name.
const ROLE_WORDS = new Set([
  "account",
  "accounts",
  "admin",
  "administrator",
  "billing",
  "console",
  "desk",
  "finance",
  "front",
  "help",
  "helpdesk",
  "info",
  "mailbox",
  "marketing",
  "office",
  "reception",
  "sales",
  "service",
  "shared",
  "support",
  "system",
  "team",
  "test",
  "user",
]);

export const greetingName = (
  name: string | null | undefined,
): string | null => {
  const trimmed = (name ?? "").trim();
  if (!trimmed || /[@,()]/.test(trimmed)) return null;
  const words = trimmed.split(/\s+/);
  const first = words[0]!;
  // A single word is as likely a mailbox or team name as a given name.
  if (words.length < 2) return null;
  if (!/^\p{Lu}[\p{L}'-]{1,29}$/u.test(first)) return null;
  // All caps reads as an acronym or a department, not a person.
  if (first === first.toUpperCase()) return null;
  if (words.some((w) => ROLE_WORDS.has(w.toLowerCase()))) return null;
  return first;
};

const C = EMAIL_COLORS;

const stepBlock = (step: Step, index: number): string => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px 0">
<tr>
<td width="44" style="${EMAIL_MONO};width:44px;vertical-align:top">
<div style="width:32px;height:32px;line-height:32px;border-radius:16px;background:${C.brandSoft};color:${C.brandStrong};text-align:center;${EMAIL_MONO};font-size:13px;font-weight:700">${index + 1}</div>
</td>
<td style="${EMAIL_SANS};vertical-align:top">
<h2 style="margin:4px 0 8px 0;font-size:17px;line-height:24px;font-weight:600;color:${C.ink}">${escapeHtml(step.title)}</h2>
<p style="margin:0 0 12px 0;font-size:15px;line-height:23px;color:${C.soft}">${escapeHtml(step.body)}</p>
<p style="margin:0;font-size:14px;line-height:26px">
${step.links.map((l) => emailTextLink(escapeHtml(`${DOCS}/${l.path}`), l.label)).join("<br>\n")}
</p>
</td>
</tr>
</table>`;

const moreColumn = (links: DocLink[], padRight: boolean): string => `
<td class="col" width="50%" style="${EMAIL_SANS};width:50%;vertical-align:top;${padRight ? "padding-right:12px;" : ""}font-size:14px;line-height:28px">
${links.map((l) => emailQuietLink(escapeHtml(`${DOCS}/${l.path}`), l.label)).join("<br>\n")}
</td>`;

export const onboardingHtml = (args: {
  /** The recipient address, shown in the footer as the reason for the mail. */
  email: string;
  /** Entra display name; only a safely derivable first name is used. */
  name: string | null;
  /** Canonical site origin, no trailing slash (siteUrl()). */
  baseUrl: string;
}): string => {
  const first = greetingName(args.name);
  const securityUrl = escapeHtml(`${args.baseUrl}/security?${UTM}`);
  const half = Math.ceil(MORE.length / 2);

  return emailShell({
    baseUrl: args.baseUrl,
    title: "Welcome to LicenseMeter",
    preheader:
      "Connect a data source, review your first findings, set your contract prices.",
    body: `${emailEyebrow("Your workspace is ready")}
${emailHeading("Welcome to LicenseMeter", "large")}
${emailText(
  `${first ? `Hi ${escapeHtml(first)}, the` : "The"} three steps below take you from sign-in to your first findings. Plan about 15 minutes.`,
  { size: "lead" },
)}
${emailButton(emailAppLink(args.baseUrl, "/app", UTM), "Open your workspace")}
${emailRule()}
${STEPS.map(stepBlock).join("")}
${emailCallout(
  "Read-only, always",
  "LicenseMeter never removes licenses, disables users or changes your tenant. Every finding is a review candidate, and you decide whether to act on it.",
)}
${emailEyebrow("When you are ready for more", C.faint)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0">
<tr>${moreColumn(MORE.slice(0, half), true)}${moreColumn(MORE.slice(half), false)}
</tr>
</table>
${emailRule()}
${emailText("Stuck or missing something? Reply to this email. I read every reply.", { tone: "ink" })}
<p style="margin:0;font-size:15px;line-height:22px;font-weight:600;color:${C.ink}">Ugur Koc</p>
<p style="margin:0 0 16px 0;font-size:13px;line-height:20px;color:${C.faint}">Founder, LicenseMeter</p>`,
    footer: `You receive this one-time email because ${escapeHtml(args.email)} signed in to LicenseMeter for the first time.<br>
${emailFooterLink(DOCS, "Documentation")}
&nbsp;&middot;&nbsp;
${emailFooterLink("https://changelog.ugurlabs.com/?product=licensemeter", "Product updates")}
&nbsp;&middot;&nbsp;
${emailFooterLink(securityUrl, "Security")}
<br>LicenseMeter, EU-hosted in Frankfurt.`,
  });
};
