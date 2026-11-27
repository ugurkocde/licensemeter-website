import { escapeHtml } from "~/lib/html";
import { clientIp, rateLimitDurable } from "~/server/rateLimit";
import {
  confirmRecipient,
  RECIPIENT_TOKEN_TTL_HOURS,
  recipientVerificationInput,
} from "~/server/report/recipients";

/**
 * Confirm page for a finance recipient of the monthly executive report. GET
 * only renders the page: mail scanners and link prefetchers follow GETs, so
 * the address is only confirmed on POST. The token in the link is the entire
 * authorization, it works once, and every refusal reads the same whether the
 * recipient, the request or the token ever existed. The page names no
 * workspace before the token is spent, so a guessed id learns nothing.
 */

// The page shares the look of the emails that link to it
// (src/lib/emailLayout.ts), like the unsubscribe page does.
const SANS =
  "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const TEXT = "font-size:15px;line-height:23px;color:#555e69;margin:0 0 16px";

const page = (title: string, body: string, status = 200): Response =>
  new Response(
    `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)} | LicenseMeter</title>
</head>
<body style="margin:0;background:#f7f8fa;color:#171b23;${SANS}">
<div style="max-width:600px;margin:0 auto;padding:64px 16px">
  <p style="font-size:17px;font-weight:600;letter-spacing:-0.2px;margin:0 0 20px 8px">
    <img src="/brand-mark.png" width="28" height="28" alt="" style="vertical-align:-7px;margin-right:10px">LicenseMeter
  </p>
  <div style="background:#ffffff;border:1px solid #e8ebef;border-top:4px solid #0d9488;border-radius:14px;padding:40px 44px 36px">
    <h1 style="font-size:24px;line-height:31px;font-weight:600;letter-spacing:-0.4px;margin:0 0 16px">${escapeHtml(title)}</h1>
    ${body}
  </div>
  <p style="font-size:12px;margin:22px 0 0 8px">
    <a href="/" style="color:#67717e">licensemeter.com</a>
  </p>
</div>
</body>
</html>`,
    {
      status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, no-store",
        "Referrer-Policy": "no-referrer",
        "X-Robots-Tag": "noindex, nofollow",
        "Content-Security-Policy":
          "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
      },
    },
  );

const invalid = (): Response =>
  page(
    "This link is not valid",
    `<p style="${TEXT}">
      The link is incomplete, expired, or already used. Ask the administrator
      who added you to send a new confirmation email.
    </p>`,
    400,
  );

/** Confirm attempts per client IP; a real recipient needs one or two. */
const ATTEMPTS_PER_HOUR = 20;

const tooMany = (): Response =>
  page(
    "Too many attempts",
    `<p style="${TEXT}">Try the link again in an hour.</p>`,
    429,
  );

const allowed = (req: Request): Promise<boolean> =>
  rateLimitDurable(
    `recipient-verify:${clientIp(req.headers)}`,
    ATTEMPTS_PER_HOUR,
    60 * 60 * 1000,
    "deny",
  );

export const GET = (req: Request): Response => {
  const parsed = recipientVerificationInput.safeParse(
    Object.fromEntries(new URL(req.url).searchParams),
  );
  if (!parsed.success) return invalid();
  return page(
    "Confirm the executive report",
    `<p style="${TEXT}">
      An administrator asked LicenseMeter to email this address a workspace's
      monthly executive savings report: a one-page PDF with license spend,
      open waste, realized savings and upcoming renewal actions. It names no
      employees.
    </p>
    <p style="${TEXT}">
      Nothing is sent here until you confirm. The link works once and expires
      ${RECIPIENT_TOKEN_TTL_HOURS} hours after it was sent. Every report carries
      a one-click unsubscribe link.
    </p>
    <form method="post" style="margin-top:20px">
      <input type="hidden" name="r" value="${escapeHtml(parsed.data.r)}">
      <input type="hidden" name="token" value="${escapeHtml(parsed.data.token)}">
      <button type="submit"
        style="${SANS};font-size:15px;font-weight:600;background:#0f766e;color:#ffffff;line-height:46px;padding:0 26px;border:0;border-radius:8px;cursor:pointer">
        Confirm and receive the report
      </button>
    </form>`,
  );
};

export const POST = async (req: Request): Promise<Response> => {
  // Checked before the body is read or the database is touched.
  if (!(await allowed(req))) return tooMany();
  if (Number(req.headers.get("content-length") ?? 0) > 4096) return invalid();
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return invalid();
  }
  const parsed = recipientVerificationInput.safeParse(Object.fromEntries(form));
  if (!parsed.success) return invalid();
  if (!(await confirmRecipient(parsed.data.r, parsed.data.token))) {
    return invalid();
  }
  return page(
    "You will receive the executive report",
    `<p style="${TEXT}">
      The monthly executive savings report now arrives here on the first of
      each month, as a one-page PDF. Every email carries a one-click
      unsubscribe link.
    </p>`,
  );
};
