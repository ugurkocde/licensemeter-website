import { z } from "zod";

/**
 * The application permissions the optional metering app requests. They belong
 * ONLY to that app, never to the sign-in or Microsoft 365 connector apps.
 * Write on scripts lets LicenseMeter create and update its own collector
 * package when an Admin asks it to.
 */
export const METERING_SCOPES = [
  "DeviceManagementScripts.ReadWrite.All",
  "DeviceManagementManagedDevices.Read.All",
  "DeviceManagementApps.Read.All",
] as const;
/** Consent granted before write was added; still accepted, without automation. */
export const METERING_SCRIPTS_READ = "DeviceManagementScripts.Read.All";
export const METERING_SCRIPTS_WRITE = "DeviceManagementScripts.ReadWrite.All";

/** Accepted role sets: devices and apps read, plus scripts read or write. Nothing else. */
export function meteringAccess(roles: readonly string[] | undefined): {
  ok: boolean;
  canWrite: boolean;
} {
  const list = roles ?? [];
  const allowed = new Set<string>([...METERING_SCOPES, METERING_SCRIPTS_READ]);
  const ok =
    list.includes("DeviceManagementManagedDevices.Read.All") &&
    list.includes("DeviceManagementApps.Read.All") &&
    (list.includes(METERING_SCRIPTS_READ) ||
      list.includes(METERING_SCRIPTS_WRITE)) &&
    list.every((role) => allowed.has(role));
  return { ok, canWrite: ok && list.includes(METERING_SCRIPTS_WRITE) };
}

export const GUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A program file name only, lower case, never a path. */
export const PROGRAM = /^[a-z0-9][a-z0-9 ._+()&-]{0,62}\.exe$/;
export const CATALOG_ID = /^[0-9a-f]{8}$/;
export const METERING_STALE_DAYS = 8; // Intune can report unchanged results weekly.
/** The collector forgets starts older than this. */
export const METERING_RETENTION_DAYS = 120;
export const METERING_MAX_PROGRAMS = 400;
/** The collector reports starts per UTC day for this many days. */
export const METERING_DAILY_DAYS = 30;
const DAY_MS = 86_400_000;
/** Whole UTC days since the epoch, so days from different reports line up. */
export const utcDay = (at: number) => Math.floor(at / DAY_MS);

const timestamp = z.string().datetime({ offset: true });
const program = z.string().regex(PROGRAM);
const minutesAgo = z
  .number()
  .int()
  .min(0)
  .max(METERING_RETENTION_DAYS * 1440 + 1440);
const startsDay = z.number().int().min(0).max(100_000);
const perDay = z
  .string()
  .regex(new RegExp(`^[0-9a-z]{1,${METERING_DAILY_DAYS}}$`));
const payloadSchema = z
  .object({
    v: z.literal(2),
    c: z.string().regex(CATALOG_ID),
    s: timestamp,
    e: timestamp,
    h: z.enum([
      "ok",
      "audit_disabled",
      "log_gap",
      "log_reset",
      "collector_error",
    ]),
    // [program, minutes before e, starts in the last 24 hours, starts per UTC
    // day]. The last element is one base-36 digit per day, newest first from
    // the UTC day of e, capped at 35, trailing zero days left out.
    a: z
      .array(
        z.union([
          z.tuple([program, minutesAgo, startsDay]),
          z.tuple([program, minutesAgo, startsDay, perDay]),
        ]),
      )
      .max(METERING_MAX_PROGRAMS),
    w: z.record(program, timestamp).optional(),
    // When this device began counting starts per day. Collectors without
    // daily counts leave it out.
    d: timestamp.optional(),
    t: z.literal(1).optional(),
  })
  .strict();

export type MeteringPayload = z.infer<typeof payloadSchema>;
export type MeteringSignal =
  "started" | "not_started" | "collecting" | "unknown" | "stale" | "outdated";

/** Fail closed: malformed, truncated, future-dated or inconsistent output isn't inactivity. */
export function parseMeteringOutput(
  output: string,
  reportedAt: Date,
  now = new Date(),
): MeteringPayload | null {
  if (!output || output.length > 2048 || !Number.isFinite(reportedAt.getTime()))
    return null;
  try {
    const payload = payloadSchema.parse(JSON.parse(output.trim()));
    const start = Date.parse(payload.s);
    const end = Date.parse(payload.e);
    if (
      start > end ||
      end > now.getTime() + 300_000 ||
      Math.abs(end - reportedAt.getTime()) > 86_400_000
    )
      return null;
    if (new Set(payload.a.map(([name]) => name)).size !== payload.a.length)
      return null;
    for (const since of Object.values(payload.w ?? {})) {
      const at = Date.parse(since);
      if (at < start || at > end) return null;
    }
    if (payload.d && Date.parse(payload.d) > end) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Most recent start of any of the programs, or null. */
export function lastStart(
  payload: MeteringPayload,
  programs: readonly string[],
): Date | null {
  const minutes = payload.a
    .filter(([name]) => programs.includes(name))
    .map(([, ago]) => ago);
  if (!minutes.length) return null;
  return new Date(Date.parse(payload.e) - Math.min(...minutes) * 60_000);
}

export function startsLastDay(
  payload: MeteringPayload,
  programs: readonly string[],
): number {
  return payload.a
    .filter(([name]) => programs.includes(name))
    .reduce((sum, [, , count]) => sum + count, 0);
}

/**
 * Starts of any of the programs per UTC day, newest first from the day of the
 * report end, METERING_DAILY_DAYS long. Null when the collector does not count
 * per day, or dropped a recent program's days to fit the output limit.
 */
export function dailyStarts(
  payload: MeteringPayload,
  programs: readonly string[],
): number[] | null {
  if (!payload.d) return null;
  const end = Date.parse(payload.e);
  const days = new Array<number>(METERING_DAILY_DAYS).fill(0);
  for (const [name, ago, , series] of payload.a) {
    if (!programs.includes(name)) continue;
    if (series === undefined) {
      // A start older than the window has nothing to count.
      if (utcDay(end) - utcDay(end - ago * 60_000) < METERING_DAILY_DAYS)
        return null;
      continue;
    }
    for (let index = 0; index < series.length; index++)
      days[index]! += Number.parseInt(series[index]!, 36);
  }
  return days;
}

/**
 * Evidence for one app on one device. `watched` is the program list of the
 * collector version the device runs, or null when that version is unknown.
 */
export function meteringSignal(
  payload: MeteringPayload | null,
  programs: readonly string[],
  watched: readonly string[] | null,
  days: number,
  now = new Date(),
): MeteringSignal {
  // After a log gap or reset the collector restarts its coverage: the starts
  // it saw are still real, but an absence proves nothing yet.
  const gap = payload?.h === "log_gap" || payload?.h === "log_reset";
  if (!payload || (payload.h !== "ok" && !gap) || !programs.length)
    return "unknown";
  const end = Date.parse(payload.e);
  if (now.getTime() - end > METERING_STALE_DAYS * 86_400_000) return "stale";
  if (!watched || programs.some((name) => !watched.includes(name)))
    return "outdated";
  const cutoff = end - days * 86_400_000;
  const last = lastStart(payload, programs);
  if (last && last.getTime() >= cutoff) return "started";
  if (gap) return "collecting";
  if (payload.t) return "unknown";
  const since = Math.max(
    Date.parse(payload.s),
    ...programs.map((name) =>
      payload.w?.[name] ? Date.parse(payload.w[name]) : 0,
    ),
  );
  return since > cutoff ? "collecting" : "not_started";
}

export const SIGNAL_LABELS: Record<MeteringSignal, string> = {
  started: "App started",
  not_started: "App not started",
  collecting: "Still collecting",
  unknown: "No data",
  stale: "Report stale",
  outdated: "Not watched yet",
};
