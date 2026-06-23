import { sql } from "drizzle-orm";
import { type NextRequest } from "next/server";

import { env } from "~/env";
import { escapeHtml } from "~/lib/html";
import { db } from "~/server/db";
import { emailSignups } from "~/server/db/schema";
import { verifyUnsubToken } from "~/server/unsubToken";

/**
 * Unsubscribe endpoint for the welcome email. GET only renders a confirm
 * page: mail scanners and link prefetchers (Outlook SafeLinks, Gmail)
 * follow GETs, so the state change happens exclusively on POST. The same
 * POST URL serves RFC 8058 one-click unsubscribe from the List-Unsubscribe
 * header. The HMAC token is the entire authorization; responses are
 * idempotent and never reveal whether the address exists.
 */

const page = (title: string, body: string): Response =>
  new Response(
    `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)} | LicenseMeter</title>
</head>
<body style="margin:0;background:#faf8f3;color:#1c1a16;font-family:Georgia,serif">
<div style="max-width:560px;margin:0 auto;padding:96px 24px">
  <p style="font-size:17px;margin:0 0 28px">License<span style="color:#a8330d">Meter</span></p>
  <h1 style="font-size:24px;font-weight:normal;margin:0 0 12px">${escapeHtml(title)}</h1>
  ${body}
  <p style="font-family:Arial,sans-serif;font-size:13px;margin-top:32px">
    <a href="/" style="color:#6b665d">licensemeter.com</a>
  </p>
</div>
</body>
</html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );

const parse = (
  req: NextRequest,
): { email: string } | null => {
  const sp = req.nextUrl.searchParams;
  const e = sp.get("e") ?? "";
  const t = sp.get("t") ?? "";
  // Buffer.from(_, "base64url") never throws: garbage just decodes to
  // garbage bytes. The @ check and the HMAC verify are the actual gate.
  const email = Buffer.from(e, "base64url").toString("utf8");
  if (!email.includes("@") || email.length > 254) return null;
  if (!verifyUnsubToken(email, t, env.AUTH_SECRET)) return null;
  return { email };
};

const invalid = (): Response =>
  page(
    "This link is not valid",
    `<p style="font-family:Arial,sans-serif;font-size:14px;color:#6b665d;line-height:1.55">
      The unsubscribe link is incomplete or expired. Reply to the email instead
      and we take you off the list by hand.
    </p>`,
  );

export const GET = (req: NextRequest): Response => {
  const parsed = parse(req);
  if (!parsed) return invalid();
  return page(
    "Unsubscribe",
    `<p style="font-family:Arial,sans-serif;font-size:14px;color:#6b665d;line-height:1.55">
      No more emails to <strong style="color:#1c1a16">${escapeHtml(parsed.email)}</strong>.
      Confirm below and you are off the list.
    </p>
    <form method="post" style="margin-top:20px">
      <button type="submit"
        style="font-family:Arial,sans-serif;font-size:14px;background:#1c1a16;color:#faf8f3;padding:12px 20px;border:0;cursor:pointer">
        Unsubscribe
      </button>
    </form>`,
  );
};

export const POST = async (req: NextRequest): Promise<Response> => {
  const parsed = parse(req);
  if (!parsed) return invalid();
  // Match case-insensitively: the HMAC token is computed over the lowercased
  // email, but stored rows may carry mixed case, so a verbatim match would
  // silently update 0 rows.
  await db
    .update(emailSignups)
    .set({ unsubscribedAt: new Date() })
    .where(sql`lower(${emailSignups.email}) = lower(${parsed.email})`);
  return page(
    "You are unsubscribed",
    `<p style="font-family:Arial,sans-serif;font-size:14px;color:#6b665d;line-height:1.55">
      ${escapeHtml(parsed.email)} gets no further emails from us. If this was
      a mistake, just sign up again on the homepage.
    </p>`,
  );
};
