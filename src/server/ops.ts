import { eq, sql } from "drizzle-orm";
import { after } from "next/server";

import { env } from "~/env";
import { db } from "~/server/db";
import { opsAlerts } from "~/server/db/schema";
import { emailEnabled, sendEmail } from "~/server/email";

/**
 * Ops alerts carry workspace IDs and counts, never personal data. Call sites
 * do not pass names, emails or UPNs; this is the backstop for text they do
 * not control (provider error messages, crash messages): email-shaped values
 * (UPNs included) and the bound parameters Drizzle appends to a failed query
 * are replaced before anything is logged, posted or emailed.
 */
// The lookbehind anchors a match at the start of a run of address characters,
// which keeps the scan linear on long text without an "@".
const EMAIL_PATTERN =
  /(?<![A-Za-z0-9._%+'#-])[A-Za-z0-9._%+'#-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;
/**
 * Drizzle's "params:" line holds the bound values verbatim, and a value can
 * span lines and imitate anything, a stack frame included. No boundary after
 * it can be trusted, so everything from "params:" to the end of the text goes
 * (fail closed). The crash handler keeps stack frames by rebuilding query
 * errors from their structured fields first (instrumentation.ts).
 */
const QUERY_PARAMS_PATTERN = /(^|\n)([ \t]*params:)[\s\S]*$/i;
export const redactForOps = (s: string): string =>
  s
    .replace(QUERY_PARAMS_PATTERN, "$1$2 <redacted>")
    .replace(EMAIL_PATTERN, "<email>");

const escapeHtml = (s: string): string =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

export type NotifyOptions = {
  /** Dedup key: identical keys within the cooldown are suppressed and counted. */
  key?: string;
  /** Cooldown window in ms; only meaningful together with key. */
  cooldownMs?: number;
  /** Longer context (stack excerpt, commit) shown in the email body only. */
  detail?: string;
  /** Email subject override; defaults to "LicenseMeter alert: <text>". */
  subject?: string;
};

/**
 * Operational alerting, fan-out to whatever is configured:
 * - ALERT_WEBHOOK_URL (Teams/Slack incoming webhook, {text} payload)
 * - ALERT_EMAIL via Resend (requires RESEND_API_KEY + EMAIL_FROM)
 * DB-backed cooldown dedup keeps incident storms from flooding either channel.
 * Never throws: alerting must not take down the thing it alerts about.
 */
export const notifyOps = (
  text: string,
  opts: NotifyOptions = {},
): Promise<void> => {
  const delivery = deliver(redactForOps(text), {
    ...opts,
    key: opts.key === undefined ? undefined : redactForOps(opts.key),
    detail: opts.detail === undefined ? undefined : redactForOps(opts.detail),
    subject:
      opts.subject === undefined ? undefined : redactForOps(opts.subject),
  });
  // Most callers fire and forget. Once the response is sent the platform
  // suspends the function, so a bare promise dies mid-flight (Resend and the
  // dedup query then time out). after() keeps the invocation alive until the
  // alert is out. Outside a request scope (tests, scripts) it throws and the
  // promise simply runs on its own.
  try {
    after(delivery);
  } catch {
    // no request scope
  }
  return delivery;
};

const deliver = async (text: string, opts: NotifyOptions): Promise<void> => {
  console.error(`[ops] ${text}`);

  // Webhook/email fire only from production deployments. Local dev and
  // preview deploys share the same .env credentials, and a crash on a dev
  // machine must not page anyone: NODE_ENV gates dev, and on Vercel the
  // VERCEL_ENV system var additionally gates preview deploys (unset on
  // self-hosted installs, where production alerts must flow). Raw
  // process.env: system vars, not in the env schema.
  if (process.env.NODE_ENV !== "production") return;
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") return;

  const wantWebhook = Boolean(env.ALERT_WEBHOOK_URL);
  const wantEmail = Boolean(env.ALERT_EMAIL) && emailEnabled();
  if (!wantWebhook && !wantEmail) return;

  let suffix = "";
  if (opts.key && opts.cooldownMs) {
    try {
      // Single atomic upsert: the row is claimed (last_sent_at reset, the
      // suppressed counter zeroed) only when the cooldown has elapsed;
      // otherwise the conflict branch changes nothing and RETURNING yields no
      // row, so concurrent callers cannot both win. The subselect in
      // RETURNING sees the pre-statement snapshot, i.e. the count suppressed
      // since the previous alert.
      const cooldownSeconds = opts.cooldownMs / 1000;
      const claimed = await db
        .insert(opsAlerts)
        .values({ key: opts.key, lastSentAt: new Date(), suppressedCount: 0 })
        .onConflictDoUpdate({
          target: opsAlerts.key,
          set: { lastSentAt: new Date(), suppressedCount: 0 },
          setWhere: sql`${opsAlerts.lastSentAt} < now() - make_interval(secs => ${cooldownSeconds}::double precision)`,
        })
        .returning({
          previousSuppressed: sql<number>`coalesce((select o.suppressed_count from ${opsAlerts} o where o.key = ${opts.key}), 0)`,
        });
      const row = claimed[0];
      if (!row) {
        await db
          .update(opsAlerts)
          .set({ suppressedCount: sql`${opsAlerts.suppressedCount} + 1` })
          .where(eq(opsAlerts.key, opts.key));
        return;
      }
      const previousSuppressed = Number(row.previousSuppressed);
      if (previousSuppressed > 0) {
        suffix = ` (${previousSuppressed} similar suppressed since the last alert)`;
      }
    } catch (err) {
      console.error("[ops] dedup bookkeeping failed", err);
    }
  }

  const message = `${text}${suffix}`;

  if (wantWebhook) {
    try {
      await fetch(env.ALERT_WEBHOOK_URL!, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: `LicenseMeter: ${message}` }),
        signal: AbortSignal.timeout(5000),
      });
    } catch (err) {
      console.error("[ops] alert webhook failed", err);
    }
  }

  if (wantEmail) {
    try {
      await sendEmail({
        to: [env.ALERT_EMAIL!],
        subject: opts.subject ?? `LicenseMeter alert: ${text.slice(0, 80)}`,
        html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1c1a16;max-width:560px">
  <p>${escapeHtml(message)}</p>${
    opts.detail
      ? `\n  <pre style="font-family:Consolas,monospace;font-size:12px;white-space:pre-wrap;background:#f4f2ee;padding:12px">${escapeHtml(opts.detail)}</pre>`
      : ""
  }
  <p style="font-size:11px;color:#a39d8f">Operational alert from licensemeter.com. Sync failures and crashes are deduplicated per 30-minute window.</p>
</div>`,
      });
    } catch (err) {
      console.error("[ops] alert email failed", err);
    }
  }
};
