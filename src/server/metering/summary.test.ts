import { describe, expect, it } from "vitest";
import type { MeteringPayload } from "~/lib/metering";
import { catalogId } from "./catalog";
import { meteringDemo } from "./demo";
import type { MeteringReport, MeteringRow } from "./live";
import { recencyBuckets, summarize } from "./summary";

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
  collector: { id: "pkg", name: "Collector", catalogId: current, programs },
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
