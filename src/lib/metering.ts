import { z } from "zod";

/** These application permissions belong ONLY to the optional metering app. */
export const METERING_SCOPES = [
  "DeviceManagementScripts.Read.All",
  "DeviceManagementManagedDevices.Read.All",
] as const;

export const METERED_APPS = [
  { id: "visio", name: "Microsoft Visio", executable: "VISIO.EXE" },
  { id: "project", name: "Microsoft Project", executable: "WINPROJ.EXE" },
  { id: "photoshop", name: "Adobe Photoshop", executable: "Photoshop.exe" },
  {
    id: "illustrator",
    name: "Adobe Illustrator",
    executable: "Illustrator.exe",
  },
  { id: "indesign", name: "Adobe InDesign", executable: "InDesign.exe" },
  { id: "solidworks", name: "SOLIDWORKS", executable: "SLDWORKS.exe" },
] as const;

export type MeteredAppId = (typeof METERED_APPS)[number]["id"];
const appIds = METERED_APPS.map((app) => app.id);
export const GUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const METERING_RETENTION_DAYS = 120;
export const METERING_STALE_DAYS = 8; // Intune can report unchanged results weekly.

const timestamp = z.string().datetime({ offset: true });
const payloadSchema = z
  .object({
    v: z.literal(1),
    catalog: z.literal("windows-v1"),
    start: timestamp,
    end: timestamp,
    health: z.enum([
      "ok",
      "audit_disabled",
      "log_gap",
      "log_reset",
      "collector_error",
    ]),
    apps: z
      .array(
        z.tuple([
          z.enum([
            "visio",
            "project",
            "photoshop",
            "illustrator",
            "indesign",
            "solidworks",
          ]),
          timestamp.nullable(),
        ]),
      )
      .length(METERED_APPS.length),
  })
  .strict();

export type MeteringPayload = z.infer<typeof payloadSchema>;
export type MeteringSignal =
  "observed" | "review" | "learning" | "unknown" | "stale";

/** Fail closed: malformed, truncated, future-dated or incomplete output isn't inactivity. */
export function parseMeteringOutput(
  output: string,
  reportedAt: Date,
  now = new Date(),
): MeteringPayload | null {
  if (!output || output.length > 2048 || !Number.isFinite(reportedAt.getTime()))
    return null;
  try {
    const payload = payloadSchema.parse(JSON.parse(output.trim()));
    const start = Date.parse(payload.start);
    const end = Date.parse(payload.end);
    if (
      start > end ||
      end > now.getTime() + 300_000 ||
      Math.abs(end - reportedAt.getTime()) > 86_400_000
    )
      return null;
    if (new Set(payload.apps.map(([id]) => id)).size !== appIds.length)
      return null;
    if (
      payload.apps.some(([, last]) => last !== null && Date.parse(last) > end)
    )
      return null;
    return payload;
  } catch {
    return null;
  }
}

export function meteringSignal(
  payload: MeteringPayload | null,
  appId: MeteredAppId,
  days: number,
  now = new Date(),
): MeteringSignal {
  if (payload?.health !== "ok") return "unknown";
  const end = Date.parse(payload.end);
  if (now.getTime() - end > METERING_STALE_DAYS * 86_400_000) return "stale";
  const entry = payload.apps.find(([id]) => id === appId);
  if (!entry) return "unknown";
  const cutoff = end - days * 86_400_000;
  if (entry[1] && Date.parse(entry[1]) >= cutoff) return "observed";
  if (Date.parse(payload.start) > cutoff) return "learning";
  return "review";
}

export const SIGNAL_LABELS: Record<MeteringSignal, string> = {
  observed: "Launch observed",
  review: "No launch observed",
  learning: "Building coverage",
  unknown: "Coverage unknown",
  stale: "Report stale",
};
