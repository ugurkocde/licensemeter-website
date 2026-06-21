import { eq } from "drizzle-orm";
import { type NextRequest } from "next/server";

import { env } from "~/env";
import { escapeHtml } from "~/lib/html";
import { verifyBillingUnsubToken } from "~/server/billingUnsubToken";
import { db } from "~/server/db";
import { tenants } from "~/server/db/schema";

/**
 * Billing-reminder unsubscribe (workspace-scoped). Mirrors the marketing
 * unsubscribe: GET only renders a confirm page (mail scanners follow GETs), so
 * the state change happens exclusively on POST, which also serves RFC 8058
 * one-click unsubscribe. The HMAC token over the tenant id is the entire
 * authorization; responses are idempotent and reveal nothing.
 *
 * This only suppresses the nudge reminders (trial day-7/12/last and the plan
 * seat-limit nudge). Essential mail (payment failed, trial expired,
 * subscription confirmed) ignores this flag and always sends.
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

const parse = (req: NextRequest): { tenantId: string } | null => {
  const sp = req.nextUrl.searchParams;
  const w = sp.get("w") ?? "";
  const t = sp.get("t") ?? "";
  if (!w || !verifyBillingUnsubToken(w, t, env.AUTH_SECRET)) return null;
  return { tenantId: w };
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
    "Stop reminder emails",
    `<p style="font-family:Arial,sans-serif;font-size:14px;color:#6b665d;line-height:1.55">
      Confirm below to stop trial and plan-limit reminder emails for this
      workspace (all of its owners and admins). Essential billing notices are
      still sent.
    </p>
    <form method="post" style="margin-top:20px">
      <button type="submit"
        style="font-family:Arial,sans-serif;font-size:14px;background:#1c1a16;color:#faf8f3;padding:12px 20px;border:0;cursor:pointer">
        Stop reminders
      </button>
    </form>`,
  );
};

export const POST = async (req: NextRequest): Promise<Response> => {
  const parsed = parse(req);
  if (!parsed) return invalid();
  await db
    .update(tenants)
    .set({ trialReminders: false })
    .where(eq(tenants.id, parsed.tenantId));
  return page(
    "Reminders stopped",
    `<p style="font-family:Arial,sans-serif;font-size:14px;color:#6b665d;line-height:1.55">
      This workspace gets no more trial or plan-limit reminders. You can turn
      them back on in Settings. Essential billing notices are unaffected.
    </p>`,
  );
};
