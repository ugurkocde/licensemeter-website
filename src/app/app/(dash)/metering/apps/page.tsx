import Link from "next/link";
import { ButtonAnchor, ButtonLink, Card, Pill } from "~/components/ui";
import { MeteringApps } from "~/components/workspace/MeteringApps";
import {
  FinishSetup,
  MeteringFootnote,
  MeteringHeader,
  MeteringLocked,
  MeteringNotices,
} from "~/components/workspace/MeteringParts";
import { fmtDateTime } from "~/lib/format";
import { SIGNAL_LABELS, type MeteringSignal } from "~/lib/metering";
import { requireAccess } from "~/server/access";
import { deviceApps } from "~/server/metering/summary";
import { loadMetering } from "~/server/metering/view";

export const metadata = { title: "Software Metering apps" };
// Results are read live from Intune on each view and never stored.
export const maxDuration = 300;
const APP_PAGE = 25;
const DEVICE_PAGE = 50;
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
const STATUS_HINT: Record<string, string> = {
  no_report: "No collector result",
  audit_disabled: "Enable process auditing",
  script_error: "Collector failed",
  invalid_output: "Invalid collector output",
};

export default async function MeteringAppsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireAccess("viewer");
  const sp = await searchParams;
  const param = (key: string) => (typeof sp[key] === "string" ? sp[key] : "");
  const view = await loadMetering(ctx);
  if (!view.allowed)
    return (
      <MeteringLocked
        view={view}
        overQuantity={ctx.entitlement.state === "overQuantity"}
      />
    );
  const { report, summary, versions, days, demo, admin, connection } = view;
  const query = param("q").trim().toLowerCase();
  const apps = summary?.apps ?? [];
  const matching = query
    ? apps.filter(({ entry }) =>
        [entry.name, entry.publisher, ...entry.programs].some((text) =>
          text.toLowerCase().includes(query),
        ),
      )
    : apps;
  const appPages = Math.max(1, Math.ceil(matching.length / APP_PAGE));
  const appPage = Math.min(
    appPages,
    Math.max(1, Number.parseInt(param("page"), 10) || 1),
  );
  // A search selects its first match, so the device list follows it.
  const selected =
    apps.find((app) => app.entry.id === param("app").toLowerCase()) ??
    matching.find((app) => app.installed > 0) ??
    matching[0] ??
    apps.find((app) => app.installed > 0) ??
    apps[0];
  const devices =
    report && selected
      ? deviceApps(report, selected.entry, versions, days).filter(
          (item) => item.installed || item.signal === "started",
        )
      : [];
  const devicePages = Math.max(1, Math.ceil(devices.length / DEVICE_PAGE));
  const devicePage = Math.min(
    devicePages,
    Math.max(1, Number.parseInt(param("dpage"), 10) || 1),
  );
  const href = (
    patch: Record<string, string | number | undefined>,
    hash = "",
  ) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({
      q: param("q") || undefined,
      page: param("page") || undefined,
      app: param("app") || undefined,
      ...patch,
    }))
      if (value !== undefined && value !== "") next.set(key, String(value));
    const search = next.toString();
    return `/app/metering/apps${search ? `?${search}` : ""}${hash}`;
  };
  const unresolved =
    report?.catalog.filter((entry) => !entry.excluded && !entry.programs.length)
      .length ?? 0;
  const metered =
    report?.catalog.filter((entry) => !entry.excluded && entry.programs.length)
      .length ?? 0;
  const excluded =
    report?.catalog.filter((entry) => entry.excluded).length ?? 0;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 pb-8">
      <MeteringHeader
        view={view}
        title="Apps"
        lead="Search the Windows apps you deploy through Intune and see, per device, whether they were started."
      />
      <MeteringNotices view={view} />
      {!summary || !report ? (
        <FinishSetup view={view} />
      ) : (
        <>
          <section id="apps" className="scroll-mt-6">
            <Card title="Apps">
              <form
                className="mb-4 flex flex-wrap items-end gap-3"
                action="/app/metering/apps#apps"
              >
                <label className="min-w-56 flex-1 text-sm">
                  Search apps, publishers or program files
                  <input
                    type="search"
                    name="q"
                    defaultValue={param("q")}
                    className="border-line-input bg-card mt-1 block min-h-11 w-full rounded-lg border px-3"
                  />
                </label>
                <button
                  className="border-line hover:bg-subtle min-h-11 rounded-lg border px-4 text-sm"
                  type="submit"
                >
                  Search
                </button>
              </form>
              {matching.length === 0 ? (
                <p className="text-ink-soft text-sm">
                  No metered app matches this search.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <caption className="sr-only">
                      Metered apps with installed and started devices
                    </caption>
                    <thead className="border-line text-ink-faint border-b text-xs">
                      <tr>
                        {[
                          "App",
                          "Program files",
                          "Installed",
                          "Started",
                          "Not started",
                          "Starts, last 24 h",
                        ].map((title) => (
                          <th
                            key={title}
                            scope="col"
                            className="px-3 py-3 font-medium"
                          >
                            {title}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {matching
                        .slice((appPage - 1) * APP_PAGE, appPage * APP_PAGE)
                        .map((app) => (
                          <tr
                            key={app.entry.id}
                            className={`border-line border-b last:border-b-0 ${app.entry.id === selected?.entry.id ? "bg-brand-soft/50" : ""}`}
                          >
                            <th scope="row" className="px-3 py-3 font-medium">
                              <Link
                                className="hover:underline"
                                href={href(
                                  { app: app.entry.id, dpage: undefined },
                                  "#devices",
                                )}
                              >
                                {app.entry.name}
                              </Link>
                              <span className="text-ink-faint block text-xs font-normal">
                                {app.entry.publisher}
                              </span>
                            </th>
                            <td className="px-3 py-3 font-mono text-xs">
                              {app.entry.programs.join(", ") || (
                                <Pill tone="waste">Unknown</Pill>
                              )}
                            </td>
                            <td className="px-3 py-3 tabular-nums">
                              {app.installed}
                            </td>
                            <td className="px-3 py-3 tabular-nums">
                              {app.started}
                              {app.startedElsewhere > 0 && (
                                <span className="text-ink-faint block text-xs">
                                  +{app.startedElsewhere} not reported installed
                                </span>
                              )}
                            </td>
                            <td className="text-waste-text px-3 py-3 font-semibold tabular-nums">
                              {app.notStarted}
                            </td>
                            <td className="px-3 py-3 tabular-nums">
                              {app.starts}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
              {appPages > 1 && (
                <nav
                  className="mt-4 flex items-center gap-4"
                  aria-label="App pages"
                >
                  {appPage > 1 && (
                    <ButtonLink href={href({ page: appPage - 1 }, "#apps")}>
                      Previous
                    </ButtonLink>
                  )}
                  <span className="text-ink-soft text-sm">
                    Page {appPage} of {appPages}
                  </span>
                  {appPage < appPages && (
                    <ButtonLink href={href({ page: appPage + 1 }, "#apps")}>
                      Next
                    </ButtonLink>
                  )}
                </nav>
              )}
            </Card>
          </section>

          {selected && (
            <section id="devices" className="scroll-mt-6">
              <Card title={`Devices · ${selected.entry.name}`}>
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <p className="text-ink-soft max-w-2xl text-sm">
                    Devices where Intune reports {selected.entry.name} installed
                    or where it was started. Devices only, never user names. A
                    start does not measure working time.
                  </p>
                  {!demo && (
                    <ButtonAnchor
                      href={`/api/export/metering?app=${encodeURIComponent(selected.entry.id)}`}
                    >
                      Export this app
                    </ButtonAnchor>
                  )}
                </div>
                {devices.length === 0 ? (
                  <p className="text-ink-soft text-sm">
                    No device reports this app installed or started.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <caption className="sr-only">
                        {selected.entry.name} by device
                      </caption>
                      <thead className="border-line text-ink-faint border-b text-xs">
                        <tr>
                          {[
                            "Device",
                            "Installed",
                            "Last start",
                            "Starts, last 24 h",
                            "Evidence",
                          ].map((title) => (
                            <th
                              key={title}
                              scope="col"
                              className="px-3 py-3 font-medium"
                            >
                              {title}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {devices
                          .slice(
                            (devicePage - 1) * DEVICE_PAGE,
                            devicePage * DEVICE_PAGE,
                          )
                          .map((item) => (
                            <tr
                              key={item.row.deviceId}
                              className="border-line border-b last:border-b-0"
                            >
                              <th scope="row" className="px-3 py-3 font-medium">
                                {item.row.deviceName}
                              </th>
                              <td className="px-3 py-3">
                                {item.installed ? "Yes" : "Not reported"}
                              </td>
                              <td className="px-3 py-3 whitespace-nowrap">
                                {item.last ? fmtDateTime(item.last) : "None"}
                              </td>
                              <td className="px-3 py-3 tabular-nums">
                                {item.row.payload ? item.starts : ""}
                              </td>
                              <td className="px-3 py-3">
                                <Pill tone={SIGNAL_TONE[item.signal]}>
                                  {SIGNAL_LABELS[item.signal]}
                                </Pill>
                                {item.signal === "unknown" &&
                                  STATUS_HINT[item.row.status] && (
                                    <span className="text-ink-faint mt-1 block text-xs">
                                      {STATUS_HINT[item.row.status]}
                                    </span>
                                  )}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {devicePages > 1 && (
                  <nav
                    className="mt-4 flex items-center gap-4"
                    aria-label="Device pages"
                  >
                    {devicePage > 1 && (
                      <ButtonLink
                        href={href({ dpage: devicePage - 1 }, "#devices")}
                      >
                        Previous
                      </ButtonLink>
                    )}
                    <span className="text-ink-soft text-sm">
                      Page {devicePage} of {devicePages}
                    </span>
                    {devicePage < devicePages && (
                      <ButtonLink
                        href={href({ dpage: devicePage + 1 }, "#devices")}
                      >
                        Next
                      </ButtonLink>
                    )}
                  </nav>
                )}
                <p className="text-ink-faint mt-4 text-xs">
                  “App not started” requires {days} days of collector coverage
                  ending at the report date. Reports older than eight days are
                  stale. Missing results remain unknown.
                </p>
              </Card>
            </section>
          )}
        </>
      )}
      {!demo && admin && report && connection && (
        <section id="program-files" className="scroll-mt-6">
          <Card title="Program files">
            <p className="text-ink-soft mb-1 text-sm">
              <strong className="text-ink font-medium">
                {metered} apps metered automatically
              </strong>
              {unresolved > 0 && (
                <>
                  {" · "}
                  <strong className="text-waste-text font-medium">
                    {unresolved} need a program file
                  </strong>
                </>
              )}
              {excluded > 0 && <> · {excluded} left out</>}
            </p>
            <p className="text-ink-soft mb-4 text-sm">
              LicenseMeter knows the program files of common licensed software
              and reads Intune detection rules. Add a program file only for apps
              it does not recognise, then update the collector in Setup.
            </p>
            <MeteringApps
              key={`${connection.revision}`}
              onlyUnknown={unresolved > 0}
              apps={report.catalog.map(
                ({ id, name, publisher, programs, source, excluded }) => ({
                  id,
                  name,
                  publisher,
                  programs,
                  source,
                  excluded,
                }),
              )}
            />
          </Card>
        </section>
      )}
      <MeteringFootnote />
    </div>
  );
}
