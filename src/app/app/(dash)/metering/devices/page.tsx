import Link from "next/link";
import { Pill } from "~/components/ui";
import { HEALTH } from "~/components/workspace/MeteringCharts";
import { DeviceHealthNotice } from "~/components/workspace/MeteringHealth";
import {
  MeteringDeviceList,
  type MeteringDeviceRow,
} from "~/components/workspace/MeteringDeviceList";
import {
  appHref,
  FinishSetup,
  MeteringFootnote,
  MeteringHeader,
  MeteringLocked,
  MeteringNotices,
} from "~/components/workspace/MeteringParts";
import {
  DailyStarts,
  startsLabel,
  StartsStrip,
  totalStarts,
} from "~/components/workspace/MeteringTimeline";
import { fmtDateTime } from "~/lib/format";
import { SIGNAL_LABELS, type MeteringSignal } from "~/lib/metering";
import { requireAccess } from "~/server/access";
import {
  appsOnDevice,
  deviceSummaries,
  type HealthKey,
} from "~/server/metering/summary";
import { loadMetering } from "~/server/metering/view";

export const metadata = { title: "Software Metering devices" };
// Results are read live from Intune on each view and never stored.
export const maxDuration = 300;
const SIGNAL_TONE: Record<
  MeteringSignal,
  "brand" | "waste" | "teal" | "slate"
> = {
  started: "brand",
  not_started: "waste",
  collecting: "teal",
  unknown: "slate",
  stale: "slate",
  outdated: "slate",
};
const ATTENTION: HealthKey[] = ["auditOff", "error", "stale", "outdated"];

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="bg-subtle rounded-lg px-3 py-2">
    <dt className="text-ink-faint text-xs">{label}</dt>
    <dd className="text-sm font-semibold tabular-nums">{value}</dd>
  </div>
);

export default async function MeteringDevicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireAccess("viewer");
  const sp = await searchParams;
  const wanted = typeof sp.device === "string" ? sp.device.toLowerCase() : "";
  const view = await loadMetering(ctx);
  if (!view.allowed)
    return (
      <MeteringLocked
        view={view}
        overQuantity={ctx.entitlement.state === "overQuantity"}
      />
    );
  const { report, summary, versions, days } = view;
  const health = new Map(HEALTH.map((item) => [item.key, item]));
  const devices = report ? deviceSummaries(report, versions, days) : [];
  // Devices reporting starts first, the most recent first; then by name.
  devices.sort(
    (a, b) =>
      (b.last?.getTime() ?? 0) - (a.last?.getTime() ?? 0) ||
      a.row.deviceName.localeCompare(b.row.deviceName),
  );
  const rows: MeteringDeviceRow[] = devices.map((device) => ({
    id: device.row.deviceId,
    name: device.row.deviceName,
    health: health.get(device.health)!.label,
    tone: health.get(device.health)!.tone,
    group:
      device.health === "noReport"
        ? "noReport"
        : device.row.payload &&
            ["ok", "log_gap", "log_reset"].includes(device.row.payload.h)
          ? "starts"
          : ATTENTION.includes(device.health)
            ? "attention"
            : "starts",
    appsStarted: device.appsStarted,
    starts: totalStarts(device.daily),
  }));
  const device =
    devices.find((item) => item.row.deviceId === wanted) ?? devices[0];
  const state = device ? health.get(device.health)! : null;
  const apps =
    report && device ? appsOnDevice(report, device.row, versions, days) : [];
  const payload = device?.row.payload;
  // Until the device counts per day, the column would only say "Not counted".
  const perDay = apps.some((item) => item.daily);
  const packageName = report?.collector?.name ?? null;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 pb-8">
      <MeteringHeader
        view={view}
        title="Devices"
        lead="Every Windows device in Intune and what its collector reports. Open one to see which metered apps run on it and when."
      />
      <MeteringNotices view={view} />
      {!summary || !report ? (
        <FinishSetup view={view} />
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <section aria-label="Devices">
            <MeteringDeviceList
              rows={rows}
              selected={device?.row.deviceId ?? null}
            />
          </section>
          {device && state && (
            <section
              id="device"
              aria-labelledby="device-title"
              className="border-line bg-card shadow-card scroll-mt-6 rounded-2xl border lg:sticky lg:top-6"
            >
              <div className="border-line flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
                <div className="min-w-0">
                  <h2
                    id="device-title"
                    className="truncate text-lg font-semibold"
                  >
                    {device.row.deviceName}
                  </h2>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${state.tone}`}
                >
                  {state.label}
                </span>
              </div>

              <div className="flex flex-col gap-6 px-5 py-4">
                <DeviceHealthNotice
                  device={device}
                  days={days}
                  packageName={packageName}
                  tone={state.tone}
                />
                <dl className="grid grid-cols-2 gap-2">
                  <Stat
                    label="Last report"
                    value={
                      device.row.reportedAt
                        ? fmtDateTime(device.row.reportedAt)
                        : "None"
                    }
                  />
                  <Stat
                    label="Covered since"
                    value={payload ? fmtDateTime(payload.s) : "-"}
                  />
                  <Stat
                    label={`Apps started in ${days} days`}
                    value={String(device.appsStarted)}
                  />
                  {device.daily ? (
                    <Stat
                      label="Starts, 30 days"
                      value={String(totalStarts(device.daily) ?? 0)}
                    />
                  ) : (
                    <Stat
                      label="Starts, 24 hours"
                      value={payload ? String(device.startsDay) : "-"}
                    />
                  )}
                </dl>

                <div>
                  <h3 className="mb-2 text-sm font-medium">
                    App starts per day
                  </h3>
                  <DailyStarts
                    bars={device.daily}
                    title={device.row.deviceName}
                    unit="none"
                    empty={
                      device.health === "noReport"
                        ? "This device has not reported yet."
                        : !device.countsDays
                          ? `This device still runs the older collector. Starts per day begin with its next hourly run${view.summary?.olderRelease ? " after you update the collector in Setup" : ""}.`
                          : "This device reported no countable day yet."
                    }
                  />
                </div>

                <div>
                  <h3 className="mb-2 text-sm font-medium">Metered apps</h3>
                  {apps.length === 0 ? (
                    <p className="text-ink-soft text-sm">
                      Intune reports no metered app installed on this device,
                      and none was started.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <caption className="sr-only">
                          Metered apps on {device.row.deviceName}
                        </caption>
                        <thead className="border-line text-ink-faint border-b text-xs">
                          <tr>
                            {[
                              "App",
                              "Last start",
                              ...(perDay ? ["Last 30 days"] : []),
                              "Evidence",
                            ].map((title) => (
                              <th
                                key={title}
                                scope="col"
                                className="py-2 pr-3 font-medium"
                              >
                                {title}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {apps.map((item) => (
                            <tr
                              key={item.entry.id}
                              className="border-line border-b last:border-b-0"
                            >
                              <th
                                scope="row"
                                className="py-2.5 pr-3 font-medium"
                              >
                                <Link
                                  className="hover:underline"
                                  href={appHref(item.entry.id)}
                                >
                                  {item.entry.name}
                                </Link>
                                {!item.installed && (
                                  <span className="text-ink-faint block text-xs font-normal">
                                    Not reported installed
                                  </span>
                                )}
                              </th>
                              <td className="py-2.5 pr-3 whitespace-nowrap">
                                {item.last ? fmtDateTime(item.last) : "None"}
                                {item.starts > 0 && (
                                  <span className="text-ink-faint block text-xs">
                                    {item.starts} in the last 24 h
                                  </span>
                                )}
                              </td>
                              {perDay && (
                                <td className="py-2.5 pr-3">
                                  <StartsStrip bars={item.daily} />
                                  <span className="text-ink-faint block text-xs whitespace-nowrap">
                                    {startsLabel(item.daily)}
                                  </span>
                                </td>
                              )}
                              <td className="py-2.5">
                                <Pill tone={SIGNAL_TONE[item.signal]}>
                                  {SIGNAL_LABELS[item.signal]}
                                </Pill>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <p className="text-ink-faint mt-3 text-xs">
                    Devices only, never user names. Starts from every user
                    signed in to the device count together.
                  </p>
                </div>
              </div>
            </section>
          )}
        </div>
      )}
      <MeteringFootnote />
    </div>
  );
}
