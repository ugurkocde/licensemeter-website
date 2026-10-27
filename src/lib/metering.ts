import { z } from "zod";

/** These application permissions belong ONLY to the optional metering app. */
export const METERING_SCOPES = [
  "DeviceManagementScripts.Read.All",
  "DeviceManagementManagedDevices.Read.All",
  "DeviceManagementApps.Read.All",
] as const;

export const GUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A program file name only, lower case, never a path. */
export const PROGRAM = /^[a-z0-9][a-z0-9 ._+()&-]{0,62}\.exe$/;
export const CATALOG_ID = /^[0-9a-f]{8}$/;
export const METERING_STALE_DAYS = 8; // Intune can report unchanged results weekly.
/** The collector forgets starts older than this. */
export const METERING_RETENTION_DAYS = 120;
export const METERING_MAX_PROGRAMS = 400;

const timestamp = z.string().datetime({ offset: true });
const program = z.string().regex(PROGRAM);
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
    // [program, minutes before e, starts in the last 24 hours]
    a: z
      .array(
        z.tuple([
          program,
          z
            .number()
            .int()
            .min(0)
            .max(METERING_RETENTION_DAYS * 1440 + 1440),
          z.number().int().min(0).max(100_000),
        ]),
      )
      .max(METERING_MAX_PROGRAMS),
    w: z.record(program, timestamp).optional(),
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
  if (payload?.h !== "ok" || !programs.length) return "unknown";
  const end = Date.parse(payload.e);
  if (now.getTime() - end > METERING_STALE_DAYS * 86_400_000) return "stale";
  if (!watched || programs.some((name) => !watched.includes(name)))
    return "outdated";
  const cutoff = end - days * 86_400_000;
  const last = lastStart(payload, programs);
  if (last && last.getTime() >= cutoff) return "started";
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
  outdated: "Script update needed",
};
