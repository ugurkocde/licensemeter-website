import { METERED_APPS, type MeteringPayload } from "~/lib/metering";

/** Fictional, relative-date examples. Never persisted or sent to live Graph. */
export function meteringDemoRows(now = new Date()) {
  const ago = (days: number) =>
    new Date(now.getTime() - days * 86_400_000).toISOString();
  return [
    {
      deviceName: "SAMPLE-DESIGN-01",
      start: 95,
      end: 0,
      last: 2,
      health: "ok",
    },
    {
      deviceName: "SAMPLE-PLANNING-02",
      start: 95,
      end: 0,
      last: 80,
      health: "ok",
    },
    { deviceName: "SAMPLE-NEW-03", start: 5, end: 0, last: null, health: "ok" },
    {
      deviceName: "SAMPLE-OFFLINE-04",
      start: 95,
      end: 12,
      last: 40,
      health: "ok",
    },
    {
      deviceName: "SAMPLE-POLICY-05",
      start: 0,
      end: 0,
      last: null,
      health: "audit_disabled",
    },
  ].map((row, index) => ({
    deviceId: `sample-${index}`,
    deviceName: row.deviceName,
    status: row.health,
    reportedAt: new Date(ago(row.end)),
    payload: {
      v: 1,
      catalog: "windows-v1",
      start: ago(row.start),
      end: ago(row.end),
      health: row.health,
      apps: METERED_APPS.map((app) => [
        app.id,
        row.last === null ? null : ago(row.last),
      ]),
    } as MeteringPayload,
  }));
}
