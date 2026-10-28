import { describe, expect, it } from "vitest";
import type { MeteringPayload } from "~/lib/metering";
import type { MeteringRow } from "~/server/metering/live";
import type { DeviceSummary, HealthKey } from "~/server/metering/summary";
import { HEALTH_DOCS, healthDetail } from "./MeteringHealth";

const payload = (patch: Partial<MeteringPayload> = {}): MeteringPayload => ({
  v: 2,
  c: "a1b2c3d4",
  s: "2026-10-28T08:37:05Z",
  e: "2026-10-28T08:37:05Z",
  h: "log_gap",
  a: [],
  ...patch,
});
const device = (
  health: HealthKey,
  status: string,
  value: MeteringPayload | null,
): DeviceSummary => {
  const row: MeteringRow = {
    deviceId: "d1",
    deviceName: "PC-1",
    status,
    reportedAt: value ? new Date(value.e) : null,
    payload: value,
  };
  return {
    row,
    health,
    appsStarted: 0,
    last: null,
    daily: null,
    startsDay: 0,
    countsDays: Boolean(value?.d),
  };
};

describe("collection health detail", () => {
  it("explains a restart from the older collector and says it fixes itself", () => {
    const detail = healthDetail(device("gap", "log_gap", payload()), 30, "Pkg");
    expect(detail.summary).toContain("still count");
    expect(detail.cause).toContain("older collector");
    expect(detail.fix).toBeUndefined();
  });
  it("gives a current collector's restart a cause and a fix", () => {
    const detail = healthDetail(
      device("gap", "log_gap", payload({ d: "2026-10-28T08:00:00Z" })),
      30,
      "Pkg",
    );
    expect(detail.cause).toContain("rolled over");
    expect(detail.fix).toContain("Security log maximum size");
    const reset = healthDetail(
      device(
        "gap",
        "log_reset",
        payload({ h: "log_reset", d: "2026-10-28T08:00:00Z" }),
      ),
      30,
      "Pkg",
    );
    expect(reset.cause).toContain("cleared");
  });
  it("tells failed, unreadable and stopped collectors apart", () => {
    const texts = ["script_error", "invalid_output", "collector_error"].map(
      (status) =>
        healthDetail(device("error", status, null), 30, "Pkg").summary,
    );
    expect(new Set(texts).size).toBe(3);
    expect(
      healthDetail(device("noReport", "no_report", null), 30, "Pkg").summary,
    ).toContain("“Pkg”");
  });
  it("links every state to its own docs section", () => {
    expect(new Set(Object.values(HEALTH_DOCS)).size).toBe(8);
  });
});
