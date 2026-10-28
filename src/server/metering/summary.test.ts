import { describe, expect, it } from "vitest";
import type { MeteringPayload } from "~/lib/metering";
import { catalogId } from "./catalog";
import { meteringDemo } from "./demo";
import type { MeteringReport, MeteringRow } from "./live";
import {
  countingSince,
  deviceApps,
  recencyBuckets,
  summarize,
} from "./summary";

const now = new Date("2026-10-03T12:00:00Z");
const programs = ["acad.exe", "visio.exe"];
const current = catalogId(programs);
const app = (id: string, name: string, program: string) => ({
  id,
  appIds: [id],
  name,
  publisher: "",
  programs: [program],
  source: "catalog" as const,
  excluded: false,
});
const row = (
  deviceId: string,
  patch: Partial<MeteringPayload> | null,
): MeteringRow => ({
  deviceId,
  deviceName: deviceId,
  status: patch ? (patch.h ?? "ok") : "no_report",
  reportedAt: patch ? now : null,
  payload: patch
    ? {
        v: 2,
        c: current,
        s: "2026-06-01T00:00:00Z",
        e: "2026-10-03T12:00:00Z",
        h: "ok",
        a: [],
        ...patch,
      }
    : null,
});
const report = (
  rows: MeteringRow[],
  installs: Record<string, string[]>,
): MeteringReport => ({
  canWrite: false,
  collector: {
    id: "pkg",
    name: "Collector",
    catalogId: current,
    programs,
    release: 2,
  },
  collectors: [],
  rows,
  catalog: [
    app("autocad", "AutoCAD", "acad.exe"),
    app("visio", "Visio", "visio.exe"),
  ],
  installs,
  readAt: now,
});
const versions = [{ id: current, programs, at: now.toISOString() }];

describe("metering summary", () => {
  it("says when counting per day began, only if it began within the chart", () => {
    const recent = row("d1", {
      d: "2026-10-03T09:09:00Z",
      a: [["acad.exe", 120, 1, "0"]],
    }).payload!;
    const earlier = row("d2", { d: "2026-10-01T08:00:00Z" }).payload!;
    const old = row("d3", { d: "2026-08-01T00:00:00Z" }).payload!;
    expect(countingSince([recent], now)).toEqual(
      new Date("2026-10-03T09:09:00Z"),
    );
    // The first device to count sets the start for a group of devices.
    expect(countingSince([recent, earlier], now)).toEqual(
      new Date("2026-10-01T08:00:00Z"),
    );
    // Counting from before the chart's first day leaves no uncounted days.
    expect(countingSince([recent, old], now)).toBeNull();
    expect(countingSince([row("d4", {}).payload!], now)).toBeNull();
    // A device whose last report ended before the chart counts none of it.
    const gone = row("d5", {
      d: "2026-06-01T00:00:00Z",
      e: "2026-08-01T00:00:00Z",
    }).payload!;
    expect(countingSince([recent, gone], now)).toEqual(
      new Date("2026-10-03T09:09:00Z"),
    );
    // A report without any started app still counts its days as quiet.
    const quiet = summarize(
      report([row("d6", { d: recent.d, a: [] })], {}),
      versions,
      60,
      now,
    );
    expect(quiet.fleet.days.at(-1)).toMatchObject({ starts: 0, counted: 1 });
    expect(quiet.fleet.days.at(-3)).toMatchObject({ starts: null });
    const result = summarize(
      report([row("d1", { d: recent.d, a: recent.a })], { autocad: ["d1"] }),
      versions,
      60,
      now,
    );
    expect(result.fleet.countingSince).toEqual(new Date(recent.d!));
    expect(result.fleet.days.at(-1)).toMatchObject({ starts: 0, counted: 1 });
    expect(
      result.apps.find((item) => item.entry.id === "autocad")!.countingSince,
    ).toEqual(new Date(recent.d!));
  });
  it("charts starts per day for the fleet and for each device", () => {
    const counting = { d: "2026-09-01T00:00:00Z" };
    const result = summarize(
      report(
        [
          row("d1", {
            ...counting,
            a: [
              ["acad.exe", 60, 2, "201"],
              ["visio.exe", 1500, 0, "01"],
            ],
          }),
          // Coverage restarted yesterday; earlier days stay counted.
          row("d2", {
            ...counting,
            h: "log_gap",
            s: "2026-10-02T09:00:00Z",
            a: [["acad.exe", 30, 1, "1"]],
          }),
          // An older collector does not count per day.
          row("d3", { a: [["acad.exe", 30, 1]] }),
        ],
        { autocad: ["d1", "d2", "d3"], visio: ["d1"] },
      ),
      versions,
      60,
      now,
    );
    const { days, apps, other } = result.fleet;
    expect(days).toHaveLength(30);
    expect(days.at(-1)).toMatchObject({ starts: 3, devices: 2, counted: 2 });
    expect(days.at(-2)).toMatchObject({ starts: 1, devices: 1, counted: 2 });
    expect(days.at(-3)).toMatchObject({ starts: 1, devices: 1 });
    expect(apps.map((item) => [item.name, item.total])).toEqual([
      ["AutoCAD", 4],
      ["Visio", 1],
    ]);
    expect(other.every((value) => value === 0)).toBe(true);
    const autocad = result.apps.find((item) => item.entry.id === "autocad")!;
    expect(autocad.daily.at(-1)).toMatchObject({ starts: 3, counted: 2 });

    const entry = report([], {}).catalog[0]!;
    const items = deviceApps(
      report(
        [
          row("d2", {
            ...counting,
            h: "log_gap",
            s: "2026-10-02T09:00:00Z",
            a: [["acad.exe", 30, 1, "1"]],
          }),
          row("d3", { a: [["acad.exe", 30, 1]] }),
        ],
        {},
      ),
      entry,
      versions,
      60,
      now,
    );
    const gap = items[0]!.daily!;
    // Today is fully covered; the restart day and earlier days may miss starts.
    expect(gap.at(-1)).toMatchObject({ starts: 1, partial: false });
    expect(gap.at(-2)).toMatchObject({ starts: 0, partial: true });
    expect(gap.at(-3)).toMatchObject({ starts: 0, partial: true });
    expect(items[1]!.daily).toBeNull();
  });
  it("splits installed devices into started, not started, collecting and no data", () => {
    const result = summarize(
      report(
        [
          row("d1", { a: [["acad.exe", 60, 2]] }),
          row("d2", {}),
          row("d3", { s: "2026-09-25T00:00:00Z" }),
          row("d4", null),
          row("d5", { a: [["acad.exe", 10, 1]] }),
        ],
        { autocad: ["d1", "d2", "d3", "d4"], visio: [] },
      ),
      versions,
      60,
      now,
    );
    const autocad = result.apps.find((item) => item.entry.id === "autocad")!;
    expect(autocad).toMatchObject({
      installed: 4,
      started: 1,
      notStarted: 1,
      collecting: 1,
      noData: 1,
      startedElsewhere: 1,
      starts: 3,
    });
    expect(autocad.recency).toEqual([1, 0, 0, 0, 1]);
    expect(result.notStarted).toBe(1);
    expect(result.health).toMatchObject({
      reporting: 3,
      collecting: 1,
      noReport: 1,
    });
    // Most installed first.
    expect(result.apps[0]!.entry.id).toBe("autocad");
  });
  it("marks devices on an older app list as needing a script update", () => {
    const older = {
      ...row("d1", {}),
      payload: { ...row("d1", {}).payload!, c: "00000000" },
    };
    const result = summarize(
      report([older], { autocad: ["d1"] }),
      versions,
      60,
      now,
    );
    expect(result.health.outdated).toBe(1);
    expect(
      result.apps.find((item) => item.entry.id === "autocad")!.noData,
    ).toBe(1);
  });
  it("names apps the deployed collector does not watch", () => {
    const sample = report([row("d1", {})], {});
    sample.collector = {
      id: "pkg",
      name: "Collector",
      catalogId: catalogId(["acad.exe"]),
      programs: ["acad.exe"],
      release: 2,
    };
    sample.rows[0]!.payload!.c = sample.collector.catalogId;
    const result = summarize(sample, [], 60, now);
    expect(result.notWatched.map((entry) => entry.id)).toEqual(["visio"]);
    expect(result.health.outdated).toBe(0);
  });
  it("tracks coverage days and recent starts for the first days", () => {
    const result = summarize(
      report(
        [
          row("d1", { s: "2026-09-30T12:00:00Z", a: [["acad.exe", 30, 1]] }),
          row("d2", { s: "2026-10-02T12:00:00Z", a: [["visio.exe", 5, 1]] }),
        ],
        {},
      ),
      [],
      60,
      now,
    );
    expect(result.coverageDays).toBe(3);
    expect(result.recentStarts.map((start) => start.app)).toEqual([
      "Visio",
      "AutoCAD",
    ]);
  });
  it("lists starts from a report with a log gap and flags its restarted coverage", () => {
    const gap = row("d1", { h: "log_gap", a: [["acad.exe", 30, 1]] });
    const result = summarize(
      report([gap], { autocad: ["d1"] }),
      versions,
      60,
      now,
    );
    expect(result.recentStarts.map((start) => start.app)).toEqual(["AutoCAD"]);
    // A restart is not an error: the starts are real, only coverage restarts.
    expect(result.health.gap).toBe(1);
    expect(result.health.error).toBe(0);
    expect(
      result.apps.find((item) => item.entry.id === "autocad")!.started,
    ).toBe(1);
  });
  it("adapts recency buckets to the observation period", () => {
    expect(recencyBuckets(30)).toEqual([7, 14, 30]);
    expect(recencyBuckets(90)).toEqual([7, 14, 30, 90]);
  });
  it("produces a consistent sample report for the demo", () => {
    const { report: sample, collectors } = meteringDemo(now);
    const result = summarize(sample, collectors, 60, now);
    expect(result.devices).toBe(42);
    expect(result.health.outdated).toBe(0);
    for (const item of result.apps)
      expect(
        item.started + item.notStarted + item.collecting + item.noData,
      ).toBe(item.installed);
    expect(result.unresolved).toBe(1);
  });
});
