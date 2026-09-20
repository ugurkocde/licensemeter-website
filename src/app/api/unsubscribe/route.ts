import { eq, sql } from "drizzle-orm";
import { type NextRequest } from "next/server";

import { env } from "~/env";
import { escapeHtml } from "~/lib/html";
import { db } from "~/server/db";
import { workspaceLabel } from "~/lib/format";
import {
  emailSignups,
  memberships,
  notificationAddresses,
  tenants,
} from "~/server/db/schema";
import {
  isUnsubJob,
  verifyMembershipUnsubToken,
  verifySharedUnsubToken,
  verifyUnsubToken,
  type UnsubJob,
} from "~/server/unsubToken";

/**
 * Unsubscribe endpoint. Three link kinds share it:
 *  - ?e=&t=  the welcome email, keyed by address;
 *  - ?m=&j=&t=  the weekly digest and monthly report, keyed by membership and
 *    email type, which sets that person's opt-out for that one workspace;
 *  - ?w=&j=&t=  the same two emails to a workspace's shared notification
 *    address, which has no membership, so the switch sits on the workspace.
 * GET only renders a confirm page: mail scanners and link prefetchers
 * (Outlook SafeLinks, Gmail) follow GETs, so the state change happens
 * exclusively on POST. The same POST URL serves RFC 8058 one-click
 * unsubscribe from the List-Unsubscribe header, without a session. The HMAC
 * token is the entire authorization; responses are idempotent and never
 * reveal whether the address or membership exists.
 */

// The confirm page shares the look of the emails that link to it
// (src/lib/emailLayout.ts); a browser renders it, so plain CSS is enough.
const SANS =
  "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const TEXT = "font-size:15px;line-height:23px;color:#555e69;margin:0 0 16px";

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
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );

type Parsed =
  | { kind: "email"; email: string }
  | { kind: "membership"; membershipId: string; job: UnsubJob }
  | { kind: "shared"; tenantId: string; job: UnsubJob };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const JOB_LABEL: Record<UnsubJob, string> = {
  digest: "weekly digest",
  report: "monthly report",
};

const parse = (req: NextRequest): Parsed | null => {
  const sp = req.nextUrl.searchParams;
  const m = sp.get("m");
  if (m !== null) {
    const j = sp.get("j");
    // The UUID shape check keeps garbage away from the uuid column; the HMAC
    // verify is the actual gate.
    if (!UUID.test(m) || !isUnsubJob(j)) return null;
    if (!verifyMembershipUnsubToken(m, j, sp.get("t") ?? "", env.AUTH_SECRET))
      return null;
    return { kind: "membership", membershipId: m.toLowerCase(), job: j };
  }
  const w = sp.get("w");
  if (w !== null) {
    const j = sp.get("j");
    if (!UUID.test(w) || !isUnsubJob(j)) return null;
    if (!verifySharedUnsubToken(w, j, sp.get("t") ?? "", env.AUTH_SECRET))
      return null;
    return { kind: "shared", tenantId: w.toLowerCase(), job: j };
  }
  const e = sp.get("e") ?? "";
  const t = sp.get("t") ?? "";
  // Buffer.from(_, "base64url") never throws: garbage just decodes to
  // garbage bytes. The @ check and the HMAC verify are the actual gate.
  const email = Buffer.from(e, "base64url").toString("utf8");
  if (!email.includes("@") || email.length > 254) return null;
  if (!verifyUnsubToken(email, t, env.AUTH_SECRET)) return null;
  return { kind: "email", email };
};

/**
 * Workspace name for the confirm page. Only reached with a valid token, which
 * only we can mint for a membership, so naming the workspace leaks nothing.
 * A membership that is gone by now falls back to neutral wording.
 */
const workspaceNameFor = async (membershipId: string): Promise<string> => {
  const [tenant] = await db
    .select({ name: tenants.name, tid: tenants.tid })
    .from(memberships)
    .innerJoin(tenants, eq(tenants.id, memberships.tenantId))
    .where(eq(memberships.id, membershipId))
    .limit(1);
  return tenant ? workspaceLabel(tenant) : "this workspace";
};

/** Same for a shared-address link, where the token names the workspace itself. */
const tenantNameFor = async (tenantId: string): Promise<string> => {
  const [tenant] = await db
    .select({ name: tenants.name, tid: tenants.tid })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  return tenant ? workspaceLabel(tenant) : "this workspace";
};

const invalid = (): Response =>
  page(
    "This link is not valid",
    `<p style="${TEXT}">
      The unsubscribe link is incomplete or expired. Reply to the email instead
      and we take you off the list by hand.
    </p>`,
  );

const unsubscribeForm = `<form method="post" style="margin-top:20px">
      <button type="submit"
        style="${SANS};font-size:15px;font-weight:600;background:#0f766e;color:#ffffff;line-height:46px;padding:0 26px;border:0;border-radius:8px;cursor:pointer">
        Unsubscribe
      </button>
    </form>`;

export const GET = async (req: NextRequest): Promise<Response> => {
  const parsed = parse(req);
  if (!parsed) return invalid();
  if (parsed.kind === "membership") {
    const workspace = await workspaceNameFor(parsed.membershipId);
    return page(
      `Unsubscribe from the ${JOB_LABEL[parsed.job]}`,
      `<p style="${TEXT}">
      No more ${JOB_LABEL[parsed.job]} emails for
      <strong style="color:#171b23;font-weight:600">${escapeHtml(workspace)}</strong>.
      Other admins of the workspace keep getting theirs. Confirm below.
    </p>
    ${unsubscribeForm}`,
    );
  }
  if (parsed.kind === "shared") {
    const workspace = await tenantNameFor(parsed.tenantId);
    return page(
      `Unsubscribe from the ${JOB_LABEL[parsed.job]}`,
      `<p style="${TEXT}">
      No more ${JOB_LABEL[parsed.job]} emails to this shared address for
      <strong style="color:#171b23;font-weight:600">${escapeHtml(workspace)}</strong>.
      The owners and admins of the workspace keep getting theirs. Confirm below.
    </p>
    ${unsubscribeForm}`,
    );
  }
  return page(
    "Unsubscribe",
    `<p style="${TEXT}">
      No more emails to <strong style="color:#171b23;font-weight:600">${escapeHtml(parsed.email)}</strong>.
      Confirm below and you are off the list.
    </p>
    ${unsubscribeForm}`,
  );
};

export const POST = async (req: NextRequest): Promise<Response> => {
  const parsed = parse(req);
  if (!parsed) return invalid();
  if (parsed.kind === "membership") {
    const workspace = await workspaceNameFor(parsed.membershipId);
    // Zero rows for a membership that was removed meanwhile: same response.
    await db
      .update(memberships)
      .set(
        parsed.job === "digest"
          ? { digestOptOut: true }
          : { reportOptOut: true },
      )
      .where(eq(memberships.id, parsed.membershipId));
    return page(
      "You are unsubscribed",
      `<p style="${TEXT}">
      You get no further ${JOB_LABEL[parsed.job]} emails for
      ${escapeHtml(workspace)}. You can turn them back on any time under
      Settings in LicenseMeter.
    </p>`,
    );
  }
  if (parsed.kind === "shared") {
    const workspace = await tenantNameFor(parsed.tenantId);
    // Zero rows for a workspace that removed the address meanwhile: same
    // response, and the other two switches stay as they are.
    await db
      .update(notificationAddresses)
      .set(parsed.job === "digest" ? { digest: false } : { report: false })
      .where(eq(notificationAddresses.tenantId, parsed.tenantId));
    return page(
      "You are unsubscribed",
      `<p style="${TEXT}">
      This address gets no further ${JOB_LABEL[parsed.job]} emails for
      ${escapeHtml(workspace)}. An owner or admin can turn them back on any
      time under Settings in LicenseMeter.
    </p>`,
    );
  }
  // Match case-insensitively: the HMAC token is computed over the lowercased
  // email, but stored rows may carry mixed case, so a verbatim match would
  // silently update 0 rows.
  await db
    .update(emailSignups)
    .set({ unsubscribedAt: new Date() })
    .where(sql`lower(${emailSignups.email}) = lower(${parsed.email})`);
  return page(
    "You are unsubscribed",
    `<p style="${TEXT}">
      ${escapeHtml(parsed.email)} gets no further emails from us. If this was
      a mistake, just sign up again on the homepage.
    </p>`,
  );
};
