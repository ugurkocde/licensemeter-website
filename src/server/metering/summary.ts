import {
  lastStart,
  meteringSignal,
  METERING_STALE_DAYS,
  startsLastDay,
  type MeteringSignal,
} from "~/lib/metering";
import { catalogId, catalogPrograms, type CatalogEntry } from "./catalog";
import type { MeteringReport, MeteringRow } from "./live";

export type CollectorVersion = { id: string; programs: string[]; at: string };

export interface DeviceApp {
  row: MeteringRow;
  installed: boolean;
  signal: MeteringSignal;
  last: Date | null;
  starts: number;
}
export interface AppSummary {
  entry: CatalogEntry;
  /** Windows devices where Intune reports the app installed. */
  installed: number;
  started: number;
  notStarted: number;
  collecting: number;
  noData: number;
  /** Started on devices where Intune does not report it installed. */
  startedElsewhere: number;
  starts: number;
  /** Installed devices by days since the last start, then "not started". */
  recency: number[];
}
export type HealthKey =
  | "reporting"
  | "collecting"
  | "outdated"
  | "noReport"
  | "auditOff"
  | "stale"
  | "error";
export interface MeteringSummary {
  apps: AppSummary[];
  devices: number;
  health: Record<HealthKey, number>;
  /** Installed device and app pairs without a start in the period. */
  notStarted: number;
  currentId: string;
  unresolved: number;
}

/** Day thresholds for the recency chart, ending with the observation period. */
export const recencyBuckets = (days: number) => [
  ...[7, 14, 30].filter((value) => value < days),
  days,
];

const watchedBy = (versions: CollectorVersion[]) => {
  const map = new Map(versions.map((v) => [v.id, v.programs]));
  return (row: MeteringRow) =>
    row.payload ? (map.get(row.payload.c) ?? null) : null;
};

export function deviceApps(
  report: MeteringReport,
  entry: CatalogEntry,
  versions: CollectorVersion[],
  days: number,
  now = new Date(),
): DeviceApp[] {
  const installed = new Set(report.installs[entry.appId] ?? []);
  const watched = watchedBy(versions);
  return report.rows.map((row) => ({
    row,
    installed: installed.has(row.deviceId),
    signal: meteringSignal(
      row.payload,
      entry.programs,
      watched(row),
      days,
      now,
    ),
    last: row.payload ? lastStart(row.payload, entry.programs) : null,
    starts: row.payload ? startsLastDay(row.payload, entry.programs) : 0,
  }));
}

export function summarize(
  report: MeteringReport,
  versions: CollectorVersion[],
  days: number,
  now = new Date(),
): MeteringSummary {
  const active = report.catalog.filter((entry) => !entry.excluded);
  const currentId = catalogId(catalogPrograms(report.catalog));
  const buckets = recencyBuckets(days);
  const apps = active.map((entry) => {
    const summary: AppSummary = {
      entry,
      installed: 0,
      started: 0,
      notStarted: 0,
      collecting: 0,
      noData: 0,
      startedElsewhere: 0,
      starts: 0,
      recency: buckets.map(() => 0).concat(0),
    };
    for (const item of deviceApps(report, entry, versions, days, now)) {
      summary.starts += item.starts;
      if (!item.installed) {
        if (item.signal === "started") summary.startedElsewhere++;
        continue;
      }
      summary.installed++;
      if (item.signal === "started") {
        summary.started++;
        const age =
          (Date.parse(item.row.payload!.e) - item.last!.getTime()) / 86_400_000;
        const index = buckets.findIndex((limit) => age <= limit);
        summary.recency[index === -1 ? buckets.length - 1 : index]!++;
      } else if (item.signal === "not_started") {
        summary.notStarted++;
        summary.recency[buckets.length]!++;
      } else if (item.signal === "collecting") summary.collecting++;
      else summary.noData++;
    }
    return summary;
  });
  const health: Record<HealthKey, number> = {
    reporting: 0,
    collecting: 0,
    outdated: 0,
    noReport: 0,
    auditOff: 0,
    stale: 0,
    error: 0,
  };
  const known = new Set(versions.map((version) => version.id));
  for (const row of report.rows) {
    const payload = row.payload;
    if (row.status === "no_report") health.noReport++;
    else if (row.status === "audit_disabled") health.auditOff++;
    else if (payload?.h !== "ok") health.error++;
    else if (
      now.getTime() - Date.parse(payload.e) >
      METERING_STALE_DAYS * 86_400_000
    )
      health.stale++;
    else if (payload.c !== currentId || !known.has(payload.c))
      health.outdated++;
    else if (Date.parse(payload.s) > Date.parse(payload.e) - days * 86_400_000)
      health.collecting++;
    else health.reporting++;
  }
  return {
    apps: apps.sort(
      (a, b) =>
        b.installed - a.installed ||
        b.started - a.started ||
        a.entry.name.localeCompare(b.entry.name),
    ),
    devices: report.rows.length,
    health,
    notStarted: apps.reduce((sum, app) => sum + app.notStarted, 0),
    currentId,
    unresolved: active.filter((entry) => !entry.programs.length).length,
  };
}
