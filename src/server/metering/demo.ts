import {
  METERING_DAILY_DAYS,
  utcDay,
  type MeteringPayload,
} from "~/lib/metering";
import {
  catalogId,
  catalogPrograms,
  COLLECTOR_RELEASE,
  type CatalogEntry,
} from "./catalog";
import type { MeteringReport, MeteringRow } from "./live";
import type { CollectorVersion } from "./summary";

const DEMO_APPS: {
  name: string;
  publisher: string;
  programs: string[];
  /** Share of devices with the app installed, and of those, starting it. */
  installed: number;
  used: number;
}[] = [
  {
    name: "Adobe Acrobat Pro",
    publisher: "Adobe",
    programs: ["acrobat.exe"],
    installed: 0.7,
    used: 0.75,
  },
  {
    name: "Adobe Photoshop",
    publisher: "Adobe",
    programs: ["photoshop.exe"],
    installed: 0.35,
    used: 0.55,
  },
  {
    name: "Adobe Illustrator",
    publisher: "Adobe",
    programs: ["illustrator.exe"],
    installed: 0.3,
    used: 0.4,
  },
  {
    name: "AutoCAD 2026",
    publisher: "Autodesk",
    programs: ["acad.exe"],
    installed: 0.25,
    used: 0.45,
  },
  {
    name: "Microsoft Visio",
    publisher: "Microsoft",
    programs: ["visio.exe"],
    installed: 0.45,
    used: 0.3,
  },
  {
    name: "Microsoft Project",
    publisher: "Microsoft",
    programs: ["winproj.exe"],
    installed: 0.3,
    used: 0.2,
  },
  {
    name: "SOLIDWORKS 2025",
    publisher: "Dassault Systemes",
    programs: ["sldworks.exe"],
    installed: 0.15,
    used: 0.6,
  },
  {
    name: "Zoom Workplace",
    publisher: "Zoom",
    programs: ["zoom.exe"],
    installed: 0.9,
    used: 0.85,
  },
  {
    name: "Contoso Time Tracker",
    publisher: "Contoso",
    programs: [],
    installed: 0.5,
    used: 0,
  },
];
const TEAMS = ["DESIGN", "ENG", "FIN", "OPS", "PLAN", "SALES"];

/** Deterministic, so the sample report does not change between page views. */
function random(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

/** Newest-first base-36 day counts that end with the app's last start. */
function demoDays(
  seed: number,
  end: Date,
  minutes: number,
  today: number,
  used: number,
): string | null {
  const last = utcDay(end.getTime()) - utcDay(end.getTime() - minutes * 60_000);
  if (last >= METERING_DAILY_DAYS) return null;
  // Its own stream, so the rest of the sample stays as it was.
  const next = random(seed);
  const days = new Array<number>(METERING_DAILY_DAYS).fill(0);
  days[last] = Math.max(1, today);
  for (let index = last + 1; index < METERING_DAILY_DAYS; index++)
    if (next() < used * 0.6) days[index] = 1 + Math.floor(next() * 4);
  return days
    .map((count) => count.toString(36))
    .join("")
    .replace(/0+$/, "");
}

/** Fictional devices and apps for the sample workspace. Never persisted or sent to Graph. */
export function meteringDemo(now = new Date()): {
  report: MeteringReport;
  collectors: CollectorVersion[];
} {
  const next = random(42);
  const ago = (days: number) => new Date(now.getTime() - days * 86_400_000);
  const iso = (date: Date) => date.toISOString().replace(/\.\d{3}Z$/, "Z");
  const catalog: CatalogEntry[] = DEMO_APPS.map((app, index) => {
    const id = `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
    return {
      id,
      appIds: [id],
      name: app.name,
      publisher: app.publisher,
      programs: app.programs,
      source: app.programs.length ? "catalog" : "none",
      excluded: false,
    };
  });
  const programs = catalogPrograms(catalog);
  const id = catalogId(programs);
  const installs: Record<string, string[]> = {};
  const rows: MeteringRow[] = [];
  for (let index = 0; index < 42; index++) {
    const deviceId = `00000000-0000-4000-9000-${String(index + 1).padStart(12, "0")}`;
    const deviceName = `${TEAMS[index % TEAMS.length]}-LT-${String(index + 11).padStart(3, "0")}`;
    const kind =
      index < 4
        ? "no_report"
        : index < 6
          ? "audit_disabled"
          : index < 8
            ? "stale"
            : index < 12
              ? "collecting"
              : "ok";
    const end = kind === "stale" ? ago(11 + next() * 4) : ago(next() * 0.04);
    const start = kind === "collecting" ? ago(5 + next() * 20) : ago(120);
    const started: MeteringPayload["a"] = [];
    DEMO_APPS.forEach((app, appIndex) => {
      if (next() >= app.installed) return;
      (installs[catalog[appIndex]!.appIds[0]!] ??= []).push(deviceId);
      if (!app.programs.length || next() >= app.used) return;
      const days = next() < 0.8 ? next() * 30 : 30 + next() * 85;
      const minutes = Math.floor(days * 1440);
      const today = days < 1 ? 1 + Math.floor(next() * 6) : 0;
      const perDay = demoDays(
        1000 + index * 97 + appIndex,
        end,
        minutes,
        today,
        app.used,
      );
      started.push(
        perDay
          ? [app.programs[0]!, minutes, today, perDay]
          : [app.programs[0]!, minutes, today],
      );
    });
    const payload: MeteringPayload | null =
      kind === "no_report"
        ? null
        : {
            v: 2,
            c: id,
            s: iso(start),
            e: iso(end),
            h: kind === "audit_disabled" ? "audit_disabled" : "ok",
            d: kind === "collecting" ? iso(start) : iso(ago(45)),
            a:
              kind === "audit_disabled"
                ? []
                : started.sort((a, b) => a[1] - b[1]),
          };
    rows.push({
      deviceId,
      deviceName,
      status: payload ? payload.h : "no_report",
      reportedAt: payload ? end : null,
      payload,
    });
  }
  const collector = {
    id: "00000000-0000-4000-8000-0000000000aa",
    name: "LicenseMeter collector",
    catalogId: id,
    programs,
    release: COLLECTOR_RELEASE,
  };
  return {
    report: {
      canWrite: false,
      collector,
      collectors: [collector],
      rows: rows.sort((a, b) => a.deviceName.localeCompare(b.deviceName)),
      catalog,
      installs,
      readAt: now,
    },
    collectors: [{ id, programs, at: iso(now) }],
  };
}
