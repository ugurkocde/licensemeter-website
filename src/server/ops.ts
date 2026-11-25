import { and, eq, gt, lt, sql } from "drizzle-orm";
import { after } from "next/server";

import { env } from "~/env";
import { db } from "~/server/db";
import { opsAlerts } from "~/server/db/schema";
import { emailEnabled, sendEmail } from "~/server/email";
import { OPS_ALERT_TAG } from "~/server/emailDeliveryPolicy";

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
  /** Console log level. Defaults to error. */
  logLevel?: "error" | "info";
  /** Dedup key: identical keys within the cooldown are suppressed and counted. */
  key?: string;
  /** Cooldown window in ms; only meaningful together with key. */
  cooldownMs?: number;
  /** Count this keyed event for a later digest without notifying immediately. */
  countForDigest?: boolean;
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

const isProductionDeployment = () =>
  process.env.NODE_ENV === "production" &&
  (!process.env.VERCEL_ENV || process.env.VERCEL_ENV === "production");

const alertChannels = () => ({
  webhook: Boolean(env.ALERT_WEBHOOK_URL),
  email: Boolean(env.ALERT_EMAIL) && emailEnabled(),
});

// Use fresh rows because the old keys counted only suppressed alerts.
const digestKey = (key: string) => `daily-digest:${key}`;

const countDigestEvent = async (key: string): Promise<void> => {
  try {
    await db
      .insert(opsAlerts)
      .values({
        key: digestKey(key),
        lastSentAt: new Date(0),
        suppressedCount: 1,
      })
      .onConflictDoUpdate({
        target: opsAlerts.key,
        set: { suppressedCount: sql`${opsAlerts.suppressedCount} + 1` },
      });
  } catch (err) {
    console.error("[ops] digest count failed", err);
  }
};

const demoDigestRow = () => eq(opsAlerts.key, digestKey("demo-session"));

const claimDemoOpenDigest = async () => {
  // Use the scheduled UTC boundary so cron jitter cannot skip a day.
  const windowStart = sql`date_bin('24 hours', now(), '2000-01-01 05:00:00+00'::timestamptz)`;
  // Lock the row before reading its count. A concurrent open is either in
  // this claim or increments the reset counter for the next digest.
  const pending = db.$with("pending").as(
    db
      .select({
        key: opsAlerts.key,
        count: opsAlerts.suppressedCount,
        lastSentAt: opsAlerts.lastSentAt,
      })
      .from(opsAlerts)
      .where(
        and(
          demoDigestRow(),
          gt(opsAlerts.suppressedCount, 0),
          lt(opsAlerts.lastSentAt, windowStart),
        ),
      )
      .for("update"),
  );
  const [claimed] = await db
    .with(pending)
    .update(opsAlerts)
    .set({ lastSentAt: windowStart, suppressedCount: 0 })
    .from(pending)
    .where(eq(opsAlerts.key, pending.key))
    .returning({
      count: pending.count,
      previousSentAt: pending.lastSentAt,
      claimedWindow: opsAlerts.lastSentAt,
    });
  return claimed;
};

export const sendDemoOpenDigest = async (): Promise<void> => {
  if (!isProductionDeployment()) return;
  const channels = alertChannels();
  if (!channels.webhook && !channels.email) return;

  const claimed = await claimDemoOpenDigest().catch((err: unknown) => {
    console.error("[ops] digest claim failed", err);
  });
  if (!claimed) return;

  const { count, previousSentAt, claimedWindow } = claimed;
  const period =
    previousSentAt.getTime() === 0 ? "tracking began" : "the last digest";
  const summary = `opened ${count} ${count === 1 ? "time" : "times"} since ${period}`;
  const accepted = await sendToChannels(
    `Demo workspace ${summary}`,
    "",
    { subject: `LicenseMeter: demo workspace ${summary}`, digest: true },
    channels,
  );
  if (accepted) return;

  console.error("[ops] digest delivery failed");
  try {
    // Add to new opens and leave a newer window claim intact.
    await db
      .update(opsAlerts)
      .set({
        suppressedCount: sql`${opsAlerts.suppressedCount} + ${count}`,
        lastSentAt: sql`case
          when ${opsAlerts.lastSentAt} = ${claimedWindow.toISOString()}::timestamptz
          then ${previousSentAt.toISOString()}::timestamptz
          else ${opsAlerts.lastSentAt}
        end`,
      })
      .where(demoDigestRow());
  } catch (err) {
    console.error("[ops] digest count restore failed", err);
  }
};

const ALERT_WINDOW_MS = 15 * 60_000;
const MAX_ALERT_SENDS = 10;
const MAX_LOCAL_KEYS = 256;
type SendSlot = { at: number };
let alertSends: SendSlot[] = [];
/**
 * Per-instance cooldowns, recorded on every keyed send (database or
 * fallback path), so switching paths mid-incident cannot repeat an alert.
 */
const localCooldowns = new Map<
  string,
  { expiresAt: number; suppressedCount: number }
>();

/**
 * Reserves send slots synchronously, before any await, so concurrent alerts
 * cannot overshoot the cap. Returns a release for paths that end up not
 * sending, or null when the cap is reached.
 */
const reserveAlertSends = (count: number): (() => void) | null => {
  const now = Date.now();
  alertSends = alertSends.filter((slot) => slot.at > now - ALERT_WINDOW_MS);
  if (alertSends.length + count > MAX_ALERT_SENDS) {
    console.error("[ops] instance alert send limit reached");
    return null;
  }
  const slots = Array.from({ length: count }, () => ({ at: now }));
  alertSends.push(...slots);
  return () => {
    alertSends = alertSends.filter((slot) => !slots.includes(slot));
  };
};

const deliver = async (text: string, opts: NotifyOptions): Promise<void> => {
  // Fail closed: anything other than an explicit "info" logs at error level.
  if (opts.logLevel === "info") console.info(`[ops] ${text}`);
  else console.error(`[ops] ${text}`);

  // Webhook/email fire only from production deployments. Local dev and
  // preview deploys share the same .env credentials, and a crash on a dev
  // machine must not page anyone: NODE_ENV gates dev, and on Vercel the
  // VERCEL_ENV system var additionally gates preview deploys (unset on
  // self-hosted installs, where production alerts must flow). Raw
  // process.env: system vars, not in the env schema.
  if (!isProductionDeployment()) return;
  if (opts.countForDigest) {
    if (opts.key) return countDigestEvent(opts.key);
    console.error("[ops] digest event requires a key");
    return;
  }

  const channels = alertChannels();
  if (!channels.webhook && !channels.email) return;

  const channelCount = Number(channels.webhook) + Number(channels.email);
  const release = reserveAlertSends(channelCount);
  if (!release) return;

  let suffix = "";
  if (opts.key && opts.cooldownMs) {
    const key = opts.key;
    const now = Date.now();
    const local = localCooldowns.get(key);
    for (const [k, entry] of localCooldowns) {
      if (entry.expiresAt <= now) localCooldowns.delete(k);
    }
    let suppressed = 0;
    let outcome: "send" | "suppressed" | "unavailable";
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
        .values({ key, lastSentAt: new Date(), suppressedCount: 0 })
        .onConflictDoUpdate({
          target: opsAlerts.key,
          set: { lastSentAt: new Date(), suppressedCount: 0 },
          setWhere: sql`${opsAlerts.lastSentAt} < now() - make_interval(secs => ${cooldownSeconds}::double precision)`,
        })
        .returning({
          previousSuppressed: sql<number>`coalesce((select o.suppressed_count from ${opsAlerts} o where o.key = ${key}), 0)`,
        });
      const row = claimed[0];
      outcome = row ? "send" : "suppressed";
      if (row) suppressed += Number(row.previousSuppressed);
    } catch {
      // Fail closed: without the shared ledger, the local cooldown decides.
      console.error("[ops] dedup bookkeeping failed");
      outcome = "unavailable";
    }
    if (outcome === "suppressed") {
      release();
      try {
        await db
          .update(opsAlerts)
          .set({ suppressedCount: sql`${opsAlerts.suppressedCount} + 1` })
          .where(eq(opsAlerts.key, key));
      } catch {
        console.error("[ops] dedup bookkeeping failed");
      }
      return;
    }
    if (outcome === "unavailable") {
      // Fail closed on this instance: a send from either path within the
      // cooldown suppresses, and a full map drops rather than sends.
      // Re-read after the await: a concurrent alert may have sent meanwhile.
      const current = localCooldowns.get(key) ?? local;
      if (current && current.expiresAt > now) {
        current.suppressedCount++;
        release();
        return;
      }
      if (localCooldowns.size >= MAX_LOCAL_KEYS) {
        release();
        return;
      }
      suppressed = current?.suppressedCount ?? 0;
    }
    if (localCooldowns.size < MAX_LOCAL_KEYS) {
      localCooldowns.set(key, {
        expiresAt: now + opts.cooldownMs,
        suppressedCount: 0,
      });
    }
    if (suppressed > 0) {
      suffix = ` (${suppressed} similar suppressed since the last alert)`;
    }
  }

  await sendToChannels(text, suffix, opts, channels);
};

const sendToChannels = async (
  text: string,
  suffix: string,
  opts: Pick<NotifyOptions, "subject" | "detail"> & { digest?: true },
  channels: ReturnType<typeof alertChannels>,
): Promise<boolean> => {
  const message = `${text}${suffix}`;
  let webhookAccepted = false;
  let emailAccepted = false;

  if (channels.webhook) {
    try {
      const response = await fetch(env.ALERT_WEBHOOK_URL!, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: `LicenseMeter: ${message}` }),
        signal: AbortSignal.timeout(5000),
      });
      webhookAccepted = response.ok;
      if (opts.digest && !response.ok) {
        console.error(
          "[ops] digest delivery failed (webhook)",
          response.status,
        );
      }
    } catch (err) {
      console.error(
        opts.digest
          ? "[ops] digest delivery failed (webhook)"
          : "[ops] alert webhook failed",
        err,
      );
    }
  }

  if (channels.email) {
    try {
      emailAccepted = await sendEmail({
        to: [env.ALERT_EMAIL!],
        tags: [OPS_ALERT_TAG],
        subject: opts.subject ?? `LicenseMeter alert: ${text.slice(0, 80)}`,
        html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1c1a16;max-width:560px">
  <p>${escapeHtml(message)}</p>${
    opts.detail
      ? `\n  <pre style="font-family:Consolas,monospace;font-size:12px;white-space:pre-wrap;background:#f4f2ee;padding:12px">${escapeHtml(opts.detail)}</pre>`
      : ""
  }${
    opts.digest
      ? ""
      : '\n  <p style="font-size:11px;color:#a39d8f">Operational alert from licensemeter.com. Sync failures and crashes are deduplicated per 30-minute window.</p>'
  }
</div>`,
      });
    } catch (err) {
      console.error(
        opts.digest
          ? "[ops] digest delivery failed (email)"
          : "[ops] alert email failed",
        err,
      );
    }
  }
  return webhookAccepted || emailAccepted;
};
