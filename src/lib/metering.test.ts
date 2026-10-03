import { describe, expect, it } from "vitest";
import {
  METERED_APPS,
  meteringSignal,
  parseMeteringOutput,
  type MeteringPayload,
} from "./metering";
import { CONNECTOR_SCOPES } from "./scopes";

const now = new Date("2026-10-03T12:00:00Z");
const payload = (patch: Partial<MeteringPayload> = {}): MeteringPayload => ({
  v: 1,
  catalog: "windows-v1",
  start: "2026-06-01T00:00:00Z",
  end: now.toISOString(),
  health: "ok",
  apps: METERED_APPS.map((app) => [app.id, null]),
  ...patch,
});
const parse = (value: unknown) =>
  parseMeteringOutput(JSON.stringify(value), now, now);

describe("metering evidence", () => {
  it("accepts a bounded complete report with no raw event data", () => {
    const value = payload();
    expect(JSON.stringify(value).length).toBeLessThan(2048);
    expect(parse(value)).toEqual(value);
  });
  it.each(["", "{", "x".repeat(2049)])(
    "rejects malformed or oversized output",
    (value) => {
      expect(parseMeteringOutput(value, now, now)).toBeNull();
    },
  );
  it("rejects unknown fields, applications, duplicates and incomplete reports", () => {
    expect(parse({ ...payload(), username: "private" })).toBeNull();
    expect(parse({ ...payload(), apps: [["unknown", null]] })).toBeNull();
    expect(
      parse(payload({ apps: METERED_APPS.map(() => ["visio", null]) })),
    ).toBeNull();
    expect(parse(payload({ apps: [] }))).toBeNull();
  });
  it("rejects future dates, inverted coverage and mismatched report timestamps", () => {
    expect(parse(payload({ end: "2026-10-04T12:00:00Z" }))).toBeNull();
    expect(parse(payload({ start: "2026-10-04T00:00:00Z" }))).toBeNull();
    expect(parse(payload({ end: "2026-09-20T00:00:00Z" }))).toBeNull();
    const value = payload();
    value.apps[0] = ["visio", "2026-10-04T00:00:00Z"];
    expect(parse(value)).toBeNull();
    expect(
      parseMeteringOutput(JSON.stringify(payload()), new Date("invalid"), now),
    ).toBeNull();
  });
  it("requires fresh, healthy, continuous coverage for negative evidence", () => {
    expect(meteringSignal(null, "visio", 60, now)).toBe("unknown");
    for (const health of [
      "audit_disabled",
      "log_gap",
      "log_reset",
      "collector_error",
    ] as const) {
      expect(meteringSignal(payload({ health }), "visio", 60, now)).toBe(
        "unknown",
      );
    }
    expect(
      meteringSignal(
        payload({ end: "2026-09-20T12:00:00Z" }),
        "visio",
        60,
        now,
      ),
    ).toBe("stale");
    expect(
      meteringSignal(
        payload({ start: "2026-10-01T00:00:00Z" }),
        "visio",
        60,
        now,
      ),
    ).toBe("learning");
    expect(meteringSignal(payload(), "visio", 60, now)).toBe("review");
  });
  it("observes a recent launch even while coverage is building", () => {
    const value = payload({ start: "2026-10-01T00:00:00Z" });
    value.apps[0] = ["visio", "2026-10-02T00:00:00Z"];
    expect(meteringSignal(value, "visio", 60, now)).toBe("observed");
  });
  it("preserves the five base connector permissions", () => {
    expect(CONNECTOR_SCOPES.map((item) => item.scope)).toEqual([
      "User.Read.All",
      "AuditLog.Read.All",
      "Reports.Read.All",
      "LicenseAssignment.Read.All",
      "ReportSettings.Read.All",
    ]);
  });
});
