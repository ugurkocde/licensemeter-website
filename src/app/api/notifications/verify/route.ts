import { escapeHtml } from "~/lib/html";
import {
  confirmAddress,
  TOKEN_TTL_HOURS,
  verificationInput,
} from "~/server/notificationAddress";

/**
 * Confirm page for a workspace's shared notification address. GET only
 * renders the page: mail scanners and link prefetchers follow GETs, so the
 * address is only activated on POST. The token in the link is the entire
 * authorization, it works once, and every refusal reads the same whether the
 * workspace, the request or the token ever existed.
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
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "X-Robots-Tag": "noindex",
        "Content-Security-Policy":
          "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
      },
    },
  );

const invalid = (): Response =>
  page(
    "This link is not valid",
    `<p style="${TEXT}">
      The link is incomplete, expired, or already used. Ask an owner or admin
      of the workspace to send a new confirmation email.
    </p>`,
    400,
  );

export const GET = (req: Request): Response => {
  const parsed = verificationInput.safeParse(
    Object.fromEntries(new URL(req.url).searchParams),
  );
  if (!parsed.success) return invalid();
  return page(
    "Confirm this address",
    `<p style="${TEXT}">
      An administrator asked LicenseMeter to send a workspace's email to this
      address, on top of the owners and admins who already receive it. Those
      emails can contain account names and license costs, so everyone who
      reads this mailbox will see them.
    </p>
    <p style="${TEXT}">
      Nothing is sent here until you confirm. The link works once and expires
      ${TOKEN_TTL_HOURS} hours after it was sent.
    </p>
    <form method="post" style="margin-top:20px">
      <input type="hidden" name="workspace" value="${escapeHtml(parsed.data.workspace)}">
      <input type="hidden" name="token" value="${escapeHtml(parsed.data.token)}">
      <button type="submit"
        style="${SANS};font-size:15px;font-weight:600;background:#0f766e;color:#ffffff;line-height:46px;padding:0 26px;border:0;border-radius:8px;cursor:pointer">
        Confirm this address
      </button>
    </form>`,
  );
};

export const POST = async (req: Request): Promise<Response> => {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return invalid();
  }
  const parsed = verificationInput.safeParse(Object.fromEntries(form));
  if (!parsed.success) return invalid();
  if (!(await confirmAddress(parsed.data.workspace, parsed.data.token))) {
    return invalid();
  }
  return page(
    "This address is confirmed",
    `<p style="${TEXT}">
      The workspace's weekly digest, monthly report and leak alerts now also
      arrive here, next to the owners and admins. Every email carries an
      unsubscribe link, and an owner or admin can change or remove this
      address under Settings in LicenseMeter.
    </p>`,
  );
};
