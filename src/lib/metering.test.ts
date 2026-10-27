import { describe, expect, it } from "vitest";
import {
  lastStart,
  meteringSignal,
  METERING_SCOPES,
  parseMeteringOutput,
  startsLastDay,
  type MeteringPayload,
} from "./metering";
import { CONNECTOR_SCOPES } from "./scopes";

const now = new Date("2026-10-03T12:00:00Z");
const payload = (patch: Partial<MeteringPayload> = {}): MeteringPayload => ({
  v: 2,
  c: "a1b2c3d4",
  s: "2026-06-01T00:00:00Z",
  e: "2026-10-03T12:00:00Z",
  h: "ok",
  a: [],
  ...patch,
});
const parse = (value: unknown) =>
  parseMeteringOutput(JSON.stringify(value), now, now);
const watched = ["photoshop.exe", "acad.exe", "visio.exe"];
const signal = (
  value: MeteringPayload | null,
  programs = ["photoshop.exe"],
  list: string[] | null = watched,
) => meteringSignal(value, programs, list, 60, now);

describe("metering output, protocol 2", () => {
  it("accepts a bounded report of started programs only", () => {
    const value = payload({
      a: [
        ["photoshop.exe", 90, 3],
        ["acad.exe", 4000, 0],
      ],
      w: { "visio.exe": "2026-09-01T00:00:00Z" },
    });
    expect(parse(value)).toEqual(value);
  });
  it.each(["", "{", "x".repeat(2049)])(
    "rejects malformed or oversized output",
    (value) => {
      expect(parseMeteringOutput(value, now, now)).toBeNull();
    },
  );
  it("rejects unknown fields, paths, duplicates and protocol 1", () => {
    expect(parse({ ...payload(), username: "private" })).toBeNull();
    expect(
      parse(payload({ a: [["C:\\Users\\name\\app.exe", 1, 1]] })),
    ).toBeNull();
    expect(parse(payload({ a: [["Photoshop.exe", 1, 1]] }))).toBeNull();
    expect(
      parse(
        payload({
          a: [
            ["acad.exe", 1, 1],
            ["acad.exe", 2, 0],
          ],
        }),
      ),
    ).toBeNull();
    expect(parse({ v: 1, catalog: "windows-v1" })).toBeNull();
    expect(parse(payload({ a: [["acad.exe", -1, 0]] }))).toBeNull();
  });
  it("rejects future dates, inverted coverage and mismatched report timestamps", () => {
    expect(parse(payload({ e: "2026-10-04T12:00:00Z" }))).toBeNull();
    expect(parse(payload({ s: "2026-10-04T00:00:00Z" }))).toBeNull();
    expect(parse(payload({ e: "2026-09-20T00:00:00Z" }))).toBeNull();
    expect(
      parse(payload({ w: { "acad.exe": "2026-05-01T00:00:00Z" } })),
    ).toBeNull();
    expect(
      parseMeteringOutput(JSON.stringify(payload()), new Date("invalid"), now),
    ).toBeNull();
  });
  it("derives the last start and the 24 hour starts across an app's programs", () => {
    const value = payload({
      a: [
        ["teams.exe", 30, 2],
        ["ms-teams.exe", 120, 5],
      ],
    });
    expect(lastStart(value, ["ms-teams.exe", "teams.exe"])).toEqual(
      new Date("2026-10-03T11:30:00Z"),
    );
    expect(startsLastDay(value, ["ms-teams.exe", "teams.exe"])).toBe(7);
    expect(lastStart(value, ["acad.exe"])).toBeNull();
  });
});

describe("metering evidence", () => {
  it("requires a fresh, healthy report from a known collector version", () => {
    expect(signal(null)).toBe("unknown");
    for (const h of [
      "audit_disabled",
      "log_gap",
      "log_reset",
      "collector_error",
    ] as const)
      expect(signal(payload({ h }))).toBe("unknown");
    expect(signal(payload({ e: "2026-09-20T12:00:00Z" }))).toBe("stale");
    expect(signal(payload(), ["photoshop.exe"], null)).toBe("outdated");
    expect(signal(payload(), ["sldworks.exe"])).toBe("outdated");
    expect(signal(payload(), [])).toBe("unknown");
  });
  it("separates started, not started and still collecting", () => {
    expect(signal(payload({ a: [["photoshop.exe", 60 * 24 * 10, 0]] }))).toBe(
      "started",
    );
    expect(signal(payload({ a: [["photoshop.exe", 60 * 24 * 70, 0]] }))).toBe(
      "not_started",
    );
    expect(signal(payload())).toBe("not_started");
    expect(signal(payload({ s: "2026-09-20T00:00:00Z" }))).toBe("collecting");
    // A program added to the list later is only as covered as its own watch.
    expect(
      signal(payload({ w: { "photoshop.exe": "2026-09-25T00:00:00Z" } })),
    ).toBe("collecting");
  });
  it("sees a recent start even while coverage is still collecting", () => {
    expect(
      signal(
        payload({ s: "2026-10-01T00:00:00Z", a: [["photoshop.exe", 60, 1]] }),
      ),
    ).toBe("started");
  });
  it("never reads a truncated report as not started", () => {
    expect(signal(payload({ t: 1 }))).toBe("unknown");
    expect(signal(payload({ t: 1, a: [["photoshop.exe", 5, 1]] }))).toBe(
      "started",
    );
  });
});

describe("permissions", () => {
  it("keeps metering read-only and separate from the five base connector permissions", () => {
    expect(METERING_SCOPES.every((scope) => scope.endsWith(".Read.All"))).toBe(
      true,
    );
    expect(CONNECTOR_SCOPES.map((item) => item.scope)).toEqual([
      "User.Read.All",
      "AuditLog.Read.All",
      "Reports.Read.All",
      "LicenseAssignment.Read.All",
      "ReportSettings.Read.All",
    ]);
  });
});
