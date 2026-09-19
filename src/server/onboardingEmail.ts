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

const sans =
  "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const mono = "font-family:Consolas,Menlo,'SF Mono',monospace";

const docLink = (l: DocLink, style: string, chevron: string): string =>
  `<a href="${DOCS}/${l.path}" style="${style}">${escapeHtml(l.label)} ${chevron}</a>`;

const stepRow = (step: Step, index: number): string => `
                <tr>
                  <td class="pad" style="padding:28px 44px 0 44px;${sans}">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="44" style="width:44px;vertical-align:top">
                          <div style="width:32px;height:32px;line-height:32px;border-radius:16px;background:#e6f7f4;color:#115e59;text-align:center;${mono};font-size:13px;font-weight:700">${index + 1}</div>
                        </td>
                        <td style="vertical-align:top">
                          <h2 style="margin:4px 0 8px 0;font-size:17px;line-height:24px;font-weight:600;color:#171b23">${escapeHtml(step.title)}</h2>
                          <p style="margin:0 0 12px 0;font-size:15px;line-height:23px;color:#555e69">${escapeHtml(step.body)}</p>
                          <p style="margin:0;font-size:14px;line-height:26px">
                            ${step.links.map((l) => docLink(l, "color:#0f766e;font-weight:600;text-decoration:none", "&rsaquo;")).join("<br>\n                            ")}
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>`;

const moreColumn = (links: DocLink[], padRight: boolean): string => `
                        <td class="col" width="50%" style="width:50%;vertical-align:top;${padRight ? "padding-right:12px;" : ""}font-size:14px;line-height:28px">
                          ${links.map((l) => docLink(l, "color:#171b23;text-decoration:none", '<span style="color:#0f766e">&rsaquo;</span>')).join("<br>\n                          ")}
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
  // Through the sign-in page rather than /app itself: a signed-in reader is
  // forwarded to the workspace at once, and one opening the mail on another
  // device gets the sign-in instead of the marketing home page.
  const appUrl = escapeHtml(
    `${args.baseUrl}/sign-in?returnTo=${encodeURIComponent("/app")}&${UTM}`,
  );
  const securityUrl = escapeHtml(`${args.baseUrl}/security?${UTM}`);
  const markUrl = escapeHtml(`${args.baseUrl}/brand-mark.png`);
  const half = Math.ceil(MORE.length / 2);

  return `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>Welcome to LicenseMeter</title>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
  <style>
    body { margin: 0; padding: 0; width: 100%; background: #f7f8fa; -webkit-text-size-adjust: 100%; }
    table { border-collapse: collapse; }
    img { border: 0; display: block; }
    @media only screen and (max-width: 620px) {
      .shell { width: 100% !important; }
      .pad { padding-left: 24px !important; padding-right: 24px !important; }
      .col { display: block !important; width: 100% !important; padding-right: 0 !important; }
      .h1 { font-size: 26px !important; line-height: 32px !important; }
      .outer { padding: 0 !important; }
      .brand { padding-top: 24px !important; }
      .card { border-radius: 0 !important; border-left: 0 !important; border-right: 0 !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#f7f8fa">
  <div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:#f7f8fa">
    Connect a data source, review your first findings, set your contract prices.
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f8fa">
    <tr>
      <td class="outer" align="center" style="padding:32px 16px">
        <table role="presentation" class="shell" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px">
          <tr>
            <td class="pad brand" style="padding:0 8px 20px 8px">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding-right:10px;vertical-align:middle">
                    <img src="${markUrl}" width="28" height="28" alt="" style="width:28px;height:28px">
                  </td>
                  <td style="vertical-align:middle;${sans};font-size:17px;font-weight:600;letter-spacing:-0.2px;color:#171b23">LicenseMeter</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="card" style="background:#ffffff;border:1px solid #e8ebef;border-radius:14px">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="height:4px;line-height:4px;font-size:0;background:#0d9488;border-radius:14px 14px 0 0">&nbsp;</td>
                </tr>
                <tr>
                  <td class="pad" style="padding:40px 44px 8px 44px;${sans}">
                    <p style="margin:0 0 14px 0;${mono};font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:#0f766e">Your workspace is ready</p>
                    <h1 class="h1" style="margin:0 0 16px 0;font-size:30px;line-height:36px;font-weight:600;letter-spacing:-0.6px;color:#171b23">Welcome to LicenseMeter</h1>
                    <p style="margin:0 0 28px 0;font-size:16px;line-height:25px;color:#555e69">
                      ${first ? `Hi ${escapeHtml(first)}, the` : "The"} three steps below take you from sign-in to your first findings. Plan about 15 minutes.
                    </p>
                    <!--[if mso]>
                    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${appUrl}" style="height:46px;v-text-anchor:middle;width:210px" arcsize="18%" stroke="f" fillcolor="#0f766e">
                      <w:anchorlock/>
                      <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:bold">Open your workspace</center>
                    </v:roundrect>
                    <![endif]-->
                    <!--[if !mso]><!-- -->
                    <a href="${appUrl}" style="display:inline-block;background:#0f766e;color:#ffffff;font-size:15px;font-weight:600;line-height:46px;padding:0 26px;border-radius:8px;text-decoration:none">Open your workspace</a>
                    <!--<![endif]-->
                  </td>
                </tr>
                <tr>
                  <td class="pad" style="padding:36px 44px 0 44px">
                    <div style="border-top:1px solid #e8ebef;font-size:0;line-height:0">&nbsp;</div>
                  </td>
                </tr>${STEPS.map(stepRow).join("")}
                <tr>
                  <td class="pad" style="padding:32px 44px 0 44px;${sans}">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e6f7f4;border-radius:10px">
                      <tr>
                        <td style="padding:18px 20px;border-left:3px solid #0d9488;border-radius:10px">
                          <p style="margin:0 0 4px 0;font-size:14px;line-height:21px;font-weight:600;color:#134e4a">Read-only, always</p>
                          <p style="margin:0;font-size:14px;line-height:22px;color:#115e59">
                            LicenseMeter never removes licenses, disables users or changes your tenant. Every finding is a review candidate, and you decide whether to act on it.
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td class="pad" style="padding:32px 44px 0 44px;${sans}">
                    <p style="margin:0 0 14px 0;${mono};font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:#67717e">When you are ready for more</p>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>${moreColumn(MORE.slice(0, half), true)}${moreColumn(MORE.slice(half), false)}
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td class="pad" style="padding:32px 44px 40px 44px;${sans}">
                    <div style="border-top:1px solid #e8ebef;font-size:0;line-height:0;margin-bottom:24px">&nbsp;</div>
                    <p style="margin:0 0 14px 0;font-size:15px;line-height:23px;color:#171b23">
                      Stuck or missing something? Reply to this email. I read every reply.
                    </p>
                    <p style="margin:0;font-size:15px;line-height:22px;font-weight:600;color:#171b23">Ugur Koc</p>
                    <p style="margin:0;font-size:13px;line-height:20px;color:#67717e">Founder, LicenseMeter</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="pad" style="padding:22px 8px 0 8px;${sans};font-size:12px;line-height:19px;color:#67717e">
              You receive this one-time email because ${escapeHtml(args.email)} signed in to LicenseMeter for the first time.<br>
              <a href="${DOCS}" style="color:#67717e">Documentation</a>
              &nbsp;&middot;&nbsp;
              <a href="https://changelog.ugurlabs.com/?product=licensemeter" style="color:#67717e">Product updates</a>
              &nbsp;&middot;&nbsp;
              <a href="${securityUrl}" style="color:#67717e">Security</a>
              <br>LicenseMeter, EU-hosted in Frankfurt.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};
