import { escapeHtml } from "~/lib/html";

/**
 * The shared look of every email LicenseMeter sends: the site's light canvas,
 * a white card under a teal accent bar, the brand mark beside the wordmark.
 * Table-based with inline styles so it survives Outlook and Gmail; the style
 * block only adds the mobile layout for clients that keep it. Every cell of a
 * nested table names its font again, because Outlook does not inherit the
 * family across a table boundary and falls back to a serif. Pure module (no
 * env, no db): templates pass the origin in, which keeps them unit-testable.
 *
 * The block helpers return trusted HTML and take HTML for running text, so a
 * caller escapes every dynamic value itself (escapeHtml, emailStrong). Only
 * the helpers documented as taking plain text escape for the caller.
 */

/** Colors mirror the design tokens in src/styles/globals.css. */
const C = {
  canvas: "#f7f8fa",
  card: "#ffffff",
  ink: "#171b23",
  soft: "#555e69",
  faint: "#67717e",
  line: "#e8ebef",
  brand: "#0d9488",
  brandText: "#0f766e",
  brandStrong: "#115e59",
  brandDeep: "#134e4a",
  brandSoft: "#e6f7f4",
  wasteText: "#b45309",
} as const;

export const EMAIL_SANS =
  "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
export const EMAIL_MONO = "font-family:Consolas,Menlo,'SF Mono',monospace";

/**
 * A link into the app that works for a signed-out reader. A signed-out
 * request to an /app path lands on the marketing home page, so the link goes
 * through the sign-in page instead: a signed-in reader is forwarded to `path`
 * at once, everyone else signs in first and then arrives there. `path` must
 * start with /app (validateReturnTo refuses anything else). Not escaped.
 */
export const emailAppUrl = (
  baseUrl: string,
  path: string,
  query = "",
): string =>
  `${baseUrl}/sign-in?returnTo=${encodeURIComponent(path)}${query ? `&${query}` : ""}`;

/** emailAppUrl, escaped for direct use in an href. */
export const emailAppLink = (
  baseUrl: string,
  path: string,
  query = "",
): string => escapeHtml(emailAppUrl(baseUrl, path, query));

/**
 * A bare email address in body text gets linkified by the mail client itself,
 * which paints it blue and underlined while the display name beside it stays
 * plain, so a findings table ends up half blue. Giving the address an anchor
 * of our own keeps the client's linkifier out and the row in one type. Takes
 * plain text, returns HTML.
 */
const ADDRESS =
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

export const emailAddressText = (text: string): string =>
  escapeHtml(text).replace(
    ADDRESS,
    (address) =>
      `<a href="mailto:${address}" style="color:inherit;text-decoration:none">${address}</a>`,
  );

/** Small uppercase label above a heading. Plain text. */
export const emailEyebrow = (text: string, color: string = C.brandText) =>
  `<p style="margin:0 0 14px 0;${EMAIL_MONO};font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:${color}">${escapeHtml(text)}</p>`;

/** The one headline of a mail. HTML. */
export const emailHeading = (
  html: string,
  size: "large" | "regular" = "regular",
) =>
  size === "large"
    ? `<h1 class="h1" style="margin:0 0 16px 0;font-size:30px;line-height:36px;font-weight:600;letter-spacing:-0.6px;color:${C.ink}">${html}</h1>`
    : `<h1 class="h1" style="margin:0 0 16px 0;font-size:24px;line-height:31px;font-weight:600;letter-spacing:-0.4px;color:${C.ink}">${html}</h1>`;

/** Running text. HTML. `ink` for statements, `soft` for explanation. */
export const emailText = (
  html: string,
  opts: { tone?: "ink" | "soft"; size?: "lead" | "body" | "small" } = {},
): string => {
  const color = opts.tone === "ink" ? C.ink : C.soft;
  const type =
    opts.size === "lead"
      ? "font-size:16px;line-height:25px"
      : opts.size === "small"
        ? "font-size:13px;line-height:21px"
        : "font-size:15px;line-height:23px";
  return `<p style="margin:0 0 16px 0;${type};color:${color}">${html}</p>`;
};

/** Emphasis inside running text. Plain text; addresses keep this type. */
export const emailStrong = (text: string): string =>
  `<strong style="color:${C.ink};font-weight:600">${emailAddressText(text)}</strong>`;

/** A money figure that is being wasted. Plain text. */
export const emailWaste = (text: string): string =>
  `<strong style="color:${C.wasteText};font-weight:600">${escapeHtml(text)}</strong>`;

/**
 * The primary action. `href` must already be escaped (emailAppLink is);
 * `label` is plain text. Outlook gets a VML shape because it ignores padding
 * and radius on links, which needs a width, estimated from the label.
 */
export const emailButton = (href: string, label: string): string => {
  const width = Math.round(label.length * 8.4 + 56);
  const text = escapeHtml(label);
  return `<div style="margin:8px 0 24px 0">
<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:46px;v-text-anchor:middle;width:${width}px" arcsize="18%" stroke="f" fillcolor="${C.brandText}">
<w:anchorlock/>
<center style="color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:bold">${text}</center>
</v:roundrect>
<![endif]-->
<!--[if !mso]><!-- -->
<a href="${href}" style="display:inline-block;background:${C.brandText};color:#ffffff;font-size:15px;font-weight:600;line-height:46px;padding:0 26px;border-radius:8px;text-decoration:none">${text}</a>
<!--<![endif]-->
</div>`;
};

/** A secondary, inline action. `href` escaped, `label` plain text. */
export const emailTextLink = (href: string, label: string): string =>
  `<a href="${href}" style="color:${C.brandText};font-weight:600;text-decoration:none">${escapeHtml(label)} &rsaquo;</a>`;

/** A quiet link for dense lists. `href` escaped, `label` plain text. */
export const emailQuietLink = (href: string, label: string): string =>
  `<a href="${href}" style="color:${C.ink};text-decoration:none">${escapeHtml(label)} <span style="color:${C.brandText}">&rsaquo;</span></a>`;

/** Hairline between sections. */
export const emailRule = (): string =>
  `<div style="border-top:1px solid ${C.line};font-size:0;line-height:0;margin:8px 0 24px 0">&nbsp;</div>`;

/** Label and figure rows, e.g. findings with their monthly impact. Plain text. */
export const emailRows = (rows: { label: string; value: string }[]): string =>
  rows.length === 0
    ? ""
    : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px 0">
${rows
  .map((r, i) => {
    // The last row carries no rule: whatever follows brings its own, and two
    // of them with the row gap between read as an empty row.
    const edge =
      i === rows.length - 1 ? "" : `border-bottom:1px solid ${C.line};`;
    return `<tr>
<td style="${EMAIL_SANS};padding:10px 12px 10px 0;${edge}font-size:14px;line-height:21px;color:${C.ink}">${emailAddressText(r.label)}</td>
<td style="${EMAIL_SANS};padding:10px 0;${edge}font-size:14px;line-height:21px;text-align:right;white-space:nowrap;font-weight:600;color:${C.wasteText}">${escapeHtml(r.value)}</td>
</tr>`;
  })
  .join("\n")}
</table>`;

/** A tinted callout with a title. `title` plain text, `html` HTML. */
export const emailCallout = (title: string, html: string): string =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.brandSoft};border-radius:10px;margin:8px 0 24px 0">
<tr>
<td style="${EMAIL_SANS};padding:18px 20px;border-left:3px solid ${C.brand};border-radius:10px">
<p style="margin:0 0 4px 0;font-size:14px;line-height:21px;font-weight:600;color:${C.brandDeep}">${escapeHtml(title)}</p>
<div style="font-size:14px;line-height:22px;color:${C.brandStrong}">${html}</div>
</td>
</tr>
</table>`;

export const EMAIL_COLORS = C;

/**
 * The complete document. `body` fills the card, `footer` sits on the canvas
 * below it (why the reader gets the mail, how to stop it), `preheader` is the
 * inbox preview line. `body` and `footer` are HTML, `preheader` and `title`
 * plain text.
 */
export const emailShell = (args: {
  /** Canonical site origin, no trailing slash (siteUrl()). */
  baseUrl: string;
  title: string;
  body: string;
  footer: string;
  preheader?: string;
}): string => `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no,date=no,address=no,email=no">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(args.title)}</title>
<!--[if mso]>
<noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
<![endif]-->
<style>
body { margin: 0; padding: 0; width: 100%; background: ${C.canvas}; -webkit-text-size-adjust: 100%; }
table { border-collapse: collapse; }
img { border: 0; display: block; }
/* Apple Mail linkifies addresses and dates and restyles them; keep our type. */
a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; font-size: inherit !important; font-family: inherit !important; font-weight: inherit !important; line-height: inherit !important; }
@media only screen and (max-width: 620px) {
  .shell { width: 100% !important; }
  .pad { padding-left: 24px !important; padding-right: 24px !important; }
  .col { display: block !important; width: 100% !important; padding-right: 0 !important; }
  .h1 { font-size: 24px !important; line-height: 30px !important; }
  .outer { padding: 0 !important; }
  .brand { padding-top: 24px !important; }
  .card { border-radius: 0 !important; border-left: 0 !important; border-right: 0 !important; }
}
</style>
</head>
<body style="margin:0;padding:0;background:${C.canvas}">
${
  args.preheader
    ? `<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${C.canvas}">${escapeHtml(args.preheader)}</div>`
    : ""
}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.canvas}">
<tr>
<td class="outer" align="center" style="padding:32px 16px">
<table role="presentation" class="shell" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px">
<tr>
<td class="pad brand" style="padding:0 8px 20px 8px">
<table role="presentation" cellpadding="0" cellspacing="0">
<tr>
<td style="padding-right:10px;vertical-align:middle"><img src="${escapeHtml(`${args.baseUrl}/brand-mark.png`)}" width="28" height="28" alt="" style="width:28px;height:28px"></td>
<td style="vertical-align:middle;${EMAIL_SANS};font-size:17px;font-weight:600;letter-spacing:-0.2px;color:${C.ink}">LicenseMeter</td>
</tr>
</table>
</td>
</tr>
<tr>
<td class="card" style="background:${C.card};border:1px solid ${C.line};border-radius:14px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr>
<td style="height:4px;line-height:4px;font-size:0;background:${C.brand};border-radius:14px 14px 0 0">&nbsp;</td>
</tr>
<tr>
<td class="pad" style="padding:40px 44px 24px 44px;${EMAIL_SANS}">
${args.body}
</td>
</tr>
</table>
</td>
</tr>
<tr>
<td class="pad" style="padding:22px 8px 0 8px;${EMAIL_SANS};font-size:12px;line-height:19px;color:${C.faint}">
${args.footer}
</td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>`;

/** Link color for the canvas footer, where the body's teal would shout. */
export const emailFooterLink = (href: string, label: string): string =>
  `<a href="${href}" style="color:${C.faint}">${escapeHtml(label)}</a>`;
