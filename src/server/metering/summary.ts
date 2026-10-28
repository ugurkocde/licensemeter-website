import {
  dailyStarts,
  lastStart,
  meteringSignal,
  METERING_DAILY_DAYS,
  METERING_STALE_DAYS,
  startsLastDay,
  utcDay,
  type MeteringPayload,
  type MeteringSignal,
} from "~/lib/metering";
import {
  catalogId,
  catalogPrograms,
  COLLECTOR_RELEASE,
  type CatalogEntry,
} from "./catalog";
import type { MeteringReport, MeteringRow } from "./live";

export type CollectorVersion = { id: string; programs: string[]; at: string };

/** Starts on one UTC day; null when no device counted that day. */
export interface DayBar {
  day: number;
  starts: number | null;
  /** Devices with at least one start that day. */
  devices: number;
  /** Devices that counted starts that day. */
  counted: number;
  /** Coverage began or restarted that day or later, so starts may be missing. */
  partial: boolean;
}
/** The fleet chart: all metered starts per day, split by the most started apps. */
export interface FleetDaily {
  days: DayBar[];
  /** Most started apps over the window, most first, in fixed colour order. */
  apps: { id: string; name: string; total: number; starts: number[] }[];
  /** Starts of every other metered app, per day. */
  other: number[];
}
/** Apps the fleet chart shows on their own; the rest is "Other". */
export const FLEET_APPS = 5;
export interface DeviceApp {
  row: MeteringRow;
  installed: boolean;
  signal: MeteringSignal;
  last: Date | null;
  starts: number;
  /** Starts per day over the last METERING_DAILY_DAYS days, oldest first. */
  daily: DayBar[] | null;
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
  /** Starts per day across devices, oldest first. */
  daily: DayBar[];
}
export type HealthKey =
  | "reporting"
  | "collecting"
  | "outdated"
  | "noReport"
  | "auditOff"
  | "stale"
  | "error";
export interface RecentStart {
  appId: string;
  app: string;
  deviceId: string;
  device: string;
  at: Date;
}
export interface MeteringSummary {
  apps: AppSummary[];
  devices: number;
  health: Record<HealthKey, number>;
  /** Installed device and app pairs without a start in the period. */
  notStarted: number;
  currentId: string;
  /** Program list version of the deployed collector, or null. */
  deployedId: string | null;
  /** Metered apps the deployed collector does not watch yet. */
  notWatched: CatalogEntry[];
  /** The deployed collector is an older release than LicenseMeter offers. */
  olderRelease: boolean;
  /** The collector in Intune should be replaced, for either reason. */
  updateCollector: boolean;
  unresolved: number;
  /** Devices with a fresh, healthy report. */
  reporting: number;
  /** Devices whose result shows real starts, even across a coverage gap. */
  withStarts: number;
  /** Longest continuous coverage of any healthy device, in whole days. */
  coverageDays: number;
  /** Most recent app starts, newest first. */
  recentStarts: RecentStart[];
  /** Starts of all metered apps per day, oldest first. */
  fleet: FleetDaily;
}

/** Day thresholds for the recency chart, ending with the observation period. */
export const recencyBuckets = (days: number) => [
  ...[7, 14, 30].filter((value) => value < days),
  days,
];

/** Downloaded versions plus the one actually deployed in Intune. */
export const knownVersions = (
  report: MeteringReport,
  versions: CollectorVersion[],
): CollectorVersion[] =>
  report.collector
    ? [
        {
          id: report.collector.catalogId,
          programs: report.collector.programs,
          at: report.readAt.toISOString(),
        },
        ...versions,
      ]
    : versions;

/** The chart's UTC days, oldest first, ending today. */
export const chartDays = (now = new Date()) => {
  const today = utcDay(now.getTime());
  return Array.from(
    { length: METERING_DAILY_DAYS },
    (_, index) => today - METERING_DAILY_DAYS + 1 + index,
  );
};

/** One device's per-day starts on the chart's days, from its newest-first counts. */
export function deviceDays(
  payload: MeteringPayload,
  counts: number[] | null,
  now = new Date(),
): DayBar[] | null {
  if (!counts || !payload.d) return null;
  const end = utcDay(Date.parse(payload.e));
  const from = utcDay(Date.parse(payload.d));
  const covered = Math.max(from, utcDay(Date.parse(payload.s)));
  return chartDays(now).map((day) => {
    const index = end - day;
    // Days after a stale report, or before counting began, are unknown.
    if (index < 0 || index >= counts.length || day < from)
      return { day, starts: null, devices: 0, counted: 0, partial: false };
    const starts = counts[index]!;
    return {
      day,
      starts,
      devices: starts > 0 ? 1 : 0,
      counted: 1,
      partial: day <= covered,
    };
  });
}

/** Sums device days; a day stays unknown only if no device counted it. */
export function sumDays(series: (DayBar[] | null)[], now = new Date()) {
  const days: DayBar[] = chartDays(now).map((day) => ({
    day,
    starts: null,
    devices: 0,
    counted: 0,
    partial: false,
  }));
  for (const bars of series)
    bars?.forEach((bar, index) => {
      const total = days[index]!;
      if (bar.starts === null) return;
      total.starts = (total.starts ?? 0) + bar.starts;
      total.devices += bar.devices;
      total.counted += bar.counted;
    });
  return days;
}

/** Results Intune holds for a device whose starts are real, even across a gap. */
const usable = (row: MeteringRow) =>
  Boolean(
    row.payload && ["ok", "log_gap", "log_reset"].includes(row.payload.h),
  );

const watchedBy = (versions: CollectorVersion[]) => {
  const map = new Map(versions.map((v) => [v.id, v.programs]));
  return (row: MeteringRow) =>
    row.payload ? (map.get(row.payload.c) ?? null) : null;
};

function deviceApp(
  row: MeteringRow,
  entry: CatalogEntry,
  installed: boolean,
  watched: readonly string[] | null,
  days: number,
  now: Date,
): DeviceApp {
  return {
    row,
    installed,
    signal: meteringSignal(row.payload, entry.programs, watched, days, now),
    last: row.payload ? lastStart(row.payload, entry.programs) : null,
    starts: row.payload ? startsLastDay(row.payload, entry.programs) : 0,
    daily:
      row.payload && usable(row)
        ? deviceDays(row.payload, dailyStarts(row.payload, entry.programs), now)
        : null,
  };
}

const installedOn = (report: MeteringReport, entry: CatalogEntry) =>
  new Set(entry.appIds.flatMap((appId) => report.installs[appId] ?? []));

export function deviceApps(
  report: MeteringReport,
  entry: CatalogEntry,
  versions: CollectorVersion[],
  days: number,
  now = new Date(),
): DeviceApp[] {
  const installed = installedOn(report, entry);
  const watched = watchedBy(knownVersions(report, versions));
  return report.rows.map((row) =>
    deviceApp(row, entry, installed.has(row.deviceId), watched(row), days, now),
  );
}

export interface DeviceSummary {
  row: MeteringRow;
  health: HealthKey;
  /** Metered apps started in the observation period. */
  appsStarted: number;
  last: Date | null;
  /** Starts of all metered apps per day, oldest first, or null if not counted. */
  daily: DayBar[] | null;
}

/** Every Windows device with its collector state, for the Devices page. */
export function deviceSummaries(
  report: MeteringReport,
  versions: CollectorVersion[],
  days: number,
  now = new Date(),
): DeviceSummary[] {
  const known = knownIds(report, versions);
  const deployedId = report.collector?.catalogId ?? null;
  const metered = new Set(
    report.catalog
      .filter((entry) => !entry.excluded)
      .flatMap((entry) => entry.programs),
  );
  return report.rows.map((row) => {
    const payload = row.payload && usable(row) ? row.payload : null;
    const names = payload
      ? payload.a.map(([name]) => name).filter((name) => metered.has(name))
      : [];
    return {
      row,
      health: deviceHealth(row, known, deployedId, days, now),
      appsStarted: payload
        ? payload.a.filter(
            ([name, ago]) => metered.has(name) && ago <= days * 1440,
          ).length
        : 0,
      last: payload && names.length ? lastStart(payload, names) : null,
      daily: payload
        ? deviceDays(payload, dailyStarts(payload, names), now)
        : null,
    };
  });
}

/** Metered apps installed or started on one device, most recent start first. */
export function appsOnDevice(
  report: MeteringReport,
  row: MeteringRow,
  versions: CollectorVersion[],
  days: number,
  now = new Date(),
): (DeviceApp & { entry: CatalogEntry })[] {
  const watched = watchedBy(knownVersions(report, versions))(row);
  return report.catalog
    .filter((entry) => !entry.excluded && entry.programs.length > 0)
    .map((entry) => ({
      entry,
      ...deviceApp(
        row,
        entry,
        installedOn(report, entry).has(row.deviceId),
        watched,
        days,
        now,
      ),
    }))
    .filter((item) => item.installed || item.last !== null)
    .sort(
      (a, b) =>
        (b.last?.getTime() ?? 0) - (a.last?.getTime() ?? 0) ||
        a.entry.name.localeCompare(b.entry.name),
    );
}

/** Why a device has, or lacks, usable evidence. */
export function deviceHealth(
  row: MeteringRow,
  known: Set<string>,
  deployedId: string | null,
  days: number,
  now = new Date(),
): HealthKey {
  const payload = row.payload;
  if (row.status === "no_report") return "noReport";
  if (row.status === "audit_disabled") return "auditOff";
  if (payload?.h !== "ok") return "error";
  if (now.getTime() - Date.parse(payload.e) > METERING_STALE_DAYS * 86_400_000)
    return "stale";
  if (
    !known.has(payload.c) ||
    (deployedId !== null && payload.c !== deployedId)
  )
    return "outdated";
  if (Date.parse(payload.s) > Date.parse(payload.e) - days * 86_400_000)
    return "collecting";
  return "reporting";
}

export const knownIds = (
  report: MeteringReport,
  versions: CollectorVersion[],
) => new Set(knownVersions(report, versions).map((version) => version.id));

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
      daily: [],
    };
    const items = deviceApps(report, entry, versions, days, now);
    summary.daily = sumDays(
      items.map((item) => item.daily),
      now,
    );
    for (const item of items) {
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
  const deployedId = report.collector?.catalogId ?? null;
  const known = knownIds(report, versions);
  const deployed = new Set(report.collector?.programs ?? []);
  let coverageDays = 0;
  const recentStarts: RecentStart[] = [];
  const appByProgram = new Map(
    active.flatMap((entry) => entry.programs.map((name) => [name, entry])),
  );
  // Per app; a program two Intune apps share counts for one of them only.
  const byApp = new Map<string, (DayBar[] | null)[]>();
  const perDevice: (DayBar[] | null)[] = [];
  for (const row of report.rows) {
    // Starts seen across a log gap are real; coverage restarts with it.
    if (!row.payload || !usable(row)) continue;
    const payload = row.payload;
    const end = Date.parse(payload.e);
    coverageDays = Math.max(
      coverageDays,
      Math.floor((end - Date.parse(payload.s)) / 86_400_000),
    );
    const metered = new Map<string, string[]>();
    for (const [name, ago] of payload.a) {
      const entry = appByProgram.get(name);
      if (!entry) continue;
      metered.set(entry.id, [...(metered.get(entry.id) ?? []), name]);
      recentStarts.push({
        appId: entry.id,
        app: entry.name,
        deviceId: row.deviceId,
        device: row.deviceName,
        at: new Date(end - ago * 60_000),
      });
    }
    for (const [id, names] of metered)
      byApp.set(id, [
        ...(byApp.get(id) ?? []),
        deviceDays(payload, dailyStarts(payload, names), now),
      ]);
    perDevice.push(
      deviceDays(
        payload,
        dailyStarts(payload, [...metered.values()].flat()),
        now,
      ),
    );
  }
  const ranked = [...byApp]
    .map(([id, series]) => {
      const starts = sumDays(series, now).map((bar) => bar.starts ?? 0);
      return {
        id,
        name: active.find((entry) => entry.id === id)!.name,
        total: starts.reduce((sum, value) => sum + value, 0),
        starts,
      };
    })
    .filter((app) => app.total > 0)
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  // Starts add up per app; devices come from each device's own total.
  const devicesPerDay = sumDays(perDevice, now);
  const fleetDays = sumDays([...byApp.values()].flat(), now).map(
    (bar, index) => ({
      ...bar,
      devices: devicesPerDay[index]!.devices,
      counted: devicesPerDay[index]!.counted,
    }),
  );
  const top = ranked.slice(0, FLEET_APPS);
  const fleet: FleetDaily = {
    days: fleetDays,
    apps: top,
    other: fleetDays.map(
      (bar, index) =>
        (bar.starts ?? 0) -
        top.reduce((sum, app) => sum + app.starts[index]!, 0),
    ),
  };
  const notWatched = report.collector
    ? active.filter(
        (entry) =>
          entry.programs.length > 0 &&
          entry.programs.some((name) => !deployed.has(name)),
      )
    : [];
  const olderRelease = Boolean(
    report.collector && report.collector.release < COLLECTOR_RELEASE,
  );
  for (const row of report.rows)
    health[deviceHealth(row, known, deployedId, days, now)]++;
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
    deployedId,
    notWatched,
    olderRelease,
    updateCollector: notWatched.length > 0 || olderRelease,
    unresolved: active.filter((entry) => !entry.programs.length).length,
    reporting: health.reporting + health.collecting,
    withStarts: report.rows.filter(usable).length,
    coverageDays,
    recentStarts: recentStarts
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, 10),
    fleet,
  };
}
