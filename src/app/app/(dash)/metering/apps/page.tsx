import { ButtonAnchor, ButtonLink, Pill } from "~/components/ui";
import {
  MeteringAppList,
  type MeteringAppRow,
} from "~/components/workspace/MeteringAppList";
import { MeteringAppSettings } from "~/components/workspace/MeteringAppSettings";
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

const Stat = ({
  label,
  value,
  tone = "",
}: {
  label: string;
  value: number;
  tone?: string;
}) => (
  <div className="bg-subtle rounded-lg px-3 py-2">
    <dt className="text-ink-faint text-xs">{label}</dt>
    <dd className={`text-lg font-semibold tabular-nums ${tone}`}>{value}</dd>
  </div>
);

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
  const stats = new Map(summary?.apps.map((app) => [app.entry.id, app]));
  const rows: MeteringAppRow[] = (report?.catalog ?? [])
    .map((entry) => {
      const app = stats.get(entry.id);
      return {
        id: entry.id,
        name: entry.name,
        publisher: entry.publisher,
        copies: entry.appIds.length,
        status: entry.excluded
          ? "excluded"
          : entry.programs.length
            ? "metered"
            : "unknown",
        installed: app?.installed ?? 0,
        started: app?.started ?? 0,
        notStarted: app?.notStarted ?? 0,
        starts: app?.starts ?? 0,
      } satisfies MeteringAppRow;
    })
    .sort(
      (a, b) =>
        b.installed - a.installed ||
        b.started - a.started ||
        a.name.localeCompare(b.name),
    );
  const entry =
    report?.catalog.find((item) => item.id === param("app").toLowerCase()) ??
    report?.catalog.find((item) => item.id === rows[0]?.id);
  const app = entry ? stats.get(entry.id) : undefined;
  const devices =
    report && entry && !entry.excluded && entry.programs.length
      ? deviceApps(report, entry, versions, days).filter(
          (item) => item.installed || item.signal === "started",
        )
      : [];
  const devicePages = Math.max(1, Math.ceil(devices.length / DEVICE_PAGE));
  const devicePage = Math.min(
    devicePages,
    Math.max(1, Number.parseInt(param("dpage"), 10) || 1),
  );
  const pageHref = (page: number) =>
    `/app/metering/apps?app=${encodeURIComponent(entry?.id ?? "")}&dpage=${page}#devices`;
  const editable = !demo && admin && Boolean(connection);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 pb-8">
      <MeteringHeader
        view={view}
        title="Apps"
        lead="Every Windows app you deploy through Intune. Open one to see its devices and change how it is metered."
      />
      <MeteringNotices view={view} />
      {!summary || !report ? (
        <FinishSetup view={view} />
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <section aria-label="Apps">
            <MeteringAppList rows={rows} selected={entry?.id ?? null} />
          </section>
          {entry && (
            <section
              id="app"
              aria-labelledby="app-title"
              className="border-line bg-card shadow-card scroll-mt-6 rounded-2xl border lg:sticky lg:top-6"
            >
              <div className="border-line flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
                <div className="min-w-0">
                  <h2 id="app-title" className="text-lg font-semibold">
                    {entry.name}
                  </h2>
                  <p className="text-ink-faint text-sm">
                    {entry.publisher}
                    {entry.programs.length > 0 && (
                      <>
                        {" · "}
                        <span className="font-mono text-xs">
                          {entry.programs.join(", ")}
                        </span>
                      </>
                    )}
                  </p>
                </div>
                {!demo && devices.length > 0 && (
                  <ButtonAnchor
                    href={`/api/export/metering?app=${encodeURIComponent(entry.id)}`}
                  >
                    Export
                  </ButtonAnchor>
                )}
              </div>

              <div className="flex flex-col gap-6 px-5 py-4">
                {entry.excluded ? (
                  <p className="text-ink-soft text-sm">
                    This app is left out. Devices do not watch it.
                  </p>
                ) : !entry.programs.length ? (
                  <p className="text-ink-soft text-sm">
                    LicenseMeter does not know which program file this app
                    starts.
                    {editable
                      ? " Enter it below to meter the app."
                      : " An admin can add it here."}
                  </p>
                ) : (
                  <>
                    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <Stat label="Installed" value={app?.installed ?? 0} />
                      <Stat
                        label="Started"
                        value={app?.started ?? 0}
                        tone="text-brand-text"
                      />
                      <Stat
                        label="Not started"
                        value={app?.notStarted ?? 0}
                        tone="text-waste-text"
                      />
                      <Stat label="Starts, 24 h" value={app?.starts ?? 0} />
                    </dl>
                    <div id="devices" className="scroll-mt-6">
                      <h3 className="mb-2 text-sm font-medium">Devices</h3>
                      {devices.length === 0 ? (
                        <p className="text-ink-soft text-sm">
                          No device reports this app installed or started.
                        </p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-sm">
                            <caption className="sr-only">
                              {entry.name} by device
                            </caption>
                            <thead className="border-line text-ink-faint border-b text-xs">
                              <tr>
                                {["Device", "Last start", "Evidence"].map(
                                  (title) => (
                                    <th
                                      key={title}
                                      scope="col"
                                      className="py-2 pr-3 font-medium"
                                    >
                                      {title}
                                    </th>
                                  ),
                                )}
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
                                    <th
                                      scope="row"
                                      className="py-2.5 pr-3 font-medium"
                                    >
                                      {item.row.deviceName}
                                      {!item.installed && (
                                        <span className="text-ink-faint block text-xs font-normal">
                                          Not reported installed
                                        </span>
                                      )}
                                    </th>
                                    <td className="py-2.5 pr-3 whitespace-nowrap">
                                      {item.last
                                        ? fmtDateTime(item.last)
                                        : "None"}
                                      {item.starts > 0 && (
                                        <span className="text-ink-faint block text-xs">
                                          {item.starts} in the last 24 h
                                        </span>
                                      )}
                                    </td>
                                    <td className="py-2.5">
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
                          className="mt-3 flex items-center gap-4"
                          aria-label="Device pages"
                        >
                          {devicePage > 1 && (
                            <ButtonLink href={pageHref(devicePage - 1)}>
                              Previous
                            </ButtonLink>
                          )}
                          <span className="text-ink-soft text-sm">
                            Page {devicePage} of {devicePages}
                          </span>
                          {devicePage < devicePages && (
                            <ButtonLink href={pageHref(devicePage + 1)}>
                              Next
                            </ButtonLink>
                          )}
                        </nav>
                      )}
                      <p className="text-ink-faint mt-3 text-xs">
                        Devices only, never user names. “App not started” needs{" "}
                        {days} days of collector coverage.
                      </p>
                    </div>
                  </>
                )}

                {editable && (
                  <div className="border-line border-t pt-4">
                    <h3 className="mb-3 text-sm font-medium">Settings</h3>
                    <MeteringAppSettings
                      key={`${entry.id}:${connection?.revision}`}
                      id={entry.id}
                      programs={entry.programs}
                      source={entry.source}
                      excluded={entry.excluded}
                      updateIntune={
                        report.canWrite && Boolean(report.collector)
                      }
                    />
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      )}
      <MeteringFootnote />
    </div>
  );
}
