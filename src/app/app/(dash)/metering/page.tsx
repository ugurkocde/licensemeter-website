import { eq } from "drizzle-orm";
import Link from "next/link";
import { ButtonAnchor, ButtonLink, Card, Pill } from "~/components/ui";
import { FeatureLockPanel } from "~/components/workspace/FeatureLock";
import {
  EvidenceLegend,
  HealthList,
  InstalledVsStarted,
  Recency,
} from "~/components/workspace/MeteringCharts";
import { MeteringApps } from "~/components/workspace/MeteringApps";
import { MeteringDisable } from "~/components/workspace/MeteringDisable";
import { MeteringRefresh } from "~/components/workspace/MeteringRefresh";
import { MeteringSetup } from "~/components/workspace/MeteringSetup";
import { fmtDateTime } from "~/lib/format";
import { SIGNAL_LABELS, type MeteringSignal } from "~/lib/metering";
import { hasRole, requireAccess } from "~/server/access";
import { db } from "~/server/db";
import { meteringConnections } from "~/server/db/schema";
import { hasFeature } from "~/server/entitlement";
import type { CatalogEntry } from "~/server/metering/catalog";
import { meteringDemo } from "~/server/metering/demo";
import {
  meteringConfigured,
  meteringErrorText,
  METERING_ERRORS,
} from "~/server/metering/graph";
import {
  readCatalog,
  readMetering,
  type MeteringReport,
} from "~/server/metering/live";
import {
  deviceApps,
  recencyBuckets,
  summarize,
  type CollectorVersion,
} from "~/server/metering/summary";
import { requestDeadline } from "~/server/sync/deadline";

export const metadata = { title: "Software Metering" };
// Results are read live from Intune on each view and never stored.
export const maxDuration = 300;
const ERRORS: Record<string, string> = {
  ...METERING_ERRORS,
  invalid_state:
    "This consent request expired or was already used. Start a new request from this workspace.",
  not_allowed:
    "A workspace Admin must start and finish metering consent in the same session.",
  consent_declined:
    "Metering consent was declined. No new metering access was enabled.",
  wrong_tenant:
    "Approve consent for the Microsoft tenant connected to this workspace.",
  enable_first: "Enable Software Metering before granting consent.",
  rate_limited: "Please wait before starting another consent request.",
  plan_required: "Software Metering is included in the Pro plan.",
};
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
  invalid_output: "Check the selected package",
};

const Tile = ({
  label,
  value,
  note,
  tone = "",
}: {
  label: string;
  value: React.ReactNode;
  note: string;
  tone?: string;
}) => (
  <div className="border-line bg-card shadow-card rounded-2xl border p-5">
    <p className="text-ink-faint text-xs">{label}</p>
    <p className={`font-display mt-2 text-2xl tabular-nums ${tone}`}>{value}</p>
    <p className="text-ink-soft mt-1 text-xs">{note}</p>
  </div>
);

export default async function MeteringPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireAccess("viewer");
  const sp = await searchParams;
  const param = (key: string) => (typeof sp[key] === "string" ? sp[key] : "");
  const connection = await db.query.meteringConnections.findFirst({
    where: eq(meteringConnections.tenantId, ctx.tenant.id),
  });
  // Without the plan, nothing is read from Intune. Settings stay so an
  // upgrade resumes, and an Admin can still disable metering.
  if (!hasFeature(ctx.entitlement, "metering"))
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-6 pb-8">
        <FeatureLockPanel
          feature="metering"
          overQuantity={ctx.entitlement.state === "overQuantity"}
        />
        {connection && hasRole(ctx, "admin") && (
          <Card title="Existing metering setup">
            <p className="text-ink-soft mb-3 text-sm">
              LicenseMeter does not read metering results while the plan does
              not include Software Metering. Reading resumes after an upgrade.
              Disable metering to delete its settings, then revoke the separate
              app’s consent in Microsoft Entra and unassign the collector in
              Intune.
            </p>
            <MeteringDisable />
          </Card>
        )}
      </div>
    );

  const demo = ctx.tenant.isDemo;
  const admin = hasRole(ctx, "admin");
  const linked = Boolean(
    !demo &&
    connection?.consentedAt &&
    connection.tid.toLowerCase() === ctx.tenant.tid?.toLowerCase(),
  );
  let report: MeteringReport | null = null;
  let catalog: CatalogEntry[] | null = null;
  let versions: CollectorVersion[] = connection?.collectors ?? [];
  let readError: string | null = null;
  if (demo) {
    const sample = meteringDemo();
    report = sample.report;
    versions = sample.collectors;
  } else if (linked && connection)
    try {
      if (connection.scriptId)
        report = await readMetering(connection, {
          deadline: requestDeadline(),
        });
      else if (admin)
        catalog = await readCatalog(connection, {
          deadline: requestDeadline(),
        });
    } catch (err) {
      readError = meteringErrorText(err);
    }
  catalog = report?.catalog ?? catalog;
  const days = connection?.inactivityDays ?? 60;
  const summary = report ? summarize(report, versions, days) : null;

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
    return `/app/metering${search ? `?${search}` : ""}${hash}`;
  };
  const error = ERRORS[param("error")] ?? null;
  // Apps without a known program file are not metered, so they stay out of
  // the chart instead of reading as missing evidence.
  const chartApps = apps
    .filter((app) => app.installed > 0 && app.entry.programs.length > 0)
    .slice(0, 10);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 pb-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-brand-deep text-xs font-medium tracking-widest uppercase">
            Windows application evidence
          </p>
          <h1 className="font-display mt-2 text-3xl tracking-tight">
            Software Metering
          </h1>
          <p className="text-ink-soft mt-2 max-w-2xl text-sm">
            Which Windows apps you deploy through Intune are installed, and
            whether they were started. Read live from Intune; nothing is stored
            and no user names are shown.
          </p>
        </div>
        {report && !demo && (
          <div className="flex flex-wrap items-start gap-3">
            <MeteringRefresh />
            <ButtonAnchor variant="primary" href="/api/export/metering">
              Export CSV
            </ButtonAnchor>
          </div>
        )}
      </header>
      {demo && (
        <div className="border-brand bg-brand-soft rounded-xl border p-4 text-sm">
          <strong>Sample metering report.</strong> These fictional devices and
          apps show how the evidence reads. No Microsoft permissions or Windows
          devices are connected.
        </div>
      )}
      {error && (
        <p
          role="alert"
          className="bg-danger-soft text-danger-text rounded-xl p-4 text-sm"
        >
          {error}
        </p>
      )}
      {readError && (
        <p
          role="alert"
          className="bg-gold-soft text-ink rounded-xl p-4 text-sm"
        >
          {readError} Results are read live from Intune and are not stored, so
          none can be shown until the next successful read.
        </p>
      )}
      {summary && summary.health.outdated > 0 && (
        <p className="bg-waste-soft text-ink rounded-xl p-4 text-sm">
          <strong>
            {summary.health.outdated} devices run an older app list.
          </strong>{" "}
          Your Intune apps changed since the collector was generated.{" "}
          {admin ? (
            <Link className="underline" href="#setup">
              Download the collector again and replace the detection script
            </Link>
          ) : (
            "Ask a workspace Admin to update the collector"
          )}
          . Apps it does not watch show “Script update needed”.
        </p>
      )}

      {summary && report && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Tile
              label="Windows devices in Intune"
              value={summary.devices}
              note={`${summary.devices - summary.health.noReport} with a collector result`}
            />
            <Tile
              label="Reporting with full coverage"
              value={
                <>
                  {summary.health.reporting}{" "}
                  <span className="text-ink-faint text-base">
                    of {summary.devices}
                  </span>
                </>
              }
              note={`${summary.health.collecting} still collecting`}
            />
            <Tile
              label="Installed, not started"
              value={summary.notStarted}
              tone="text-waste-text"
              note={`Device and app pairs, ${days} days`}
            />
            <Tile
              label="Read from Intune"
              value={
                <span className="text-xl">
                  {demo ? "Sample data" : fmtDateTime(report.readAt)}
                </span>
              }
              note={`Observation period ${days} days`}
            />
          </div>

          <Card title="Installed vs started">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <p className="text-ink-soft max-w-xl text-sm">
                Devices where Intune reports the app installed, by whether it
                was started in the last {days} days. Most installed apps first.
              </p>
              <EvidenceLegend />
            </div>
            {chartApps.length ? (
              <InstalledVsStarted
                apps={chartApps}
                days={days}
                hrefFor={(id) =>
                  href({ app: id, dpage: undefined }, "#devices")
                }
              />
            ) : (
              <p className="text-ink-soft text-sm">
                Intune reports none of the metered apps as installed on a
                Windows device yet.
              </p>
            )}
            {apps.length > chartApps.length && (
              <p className="text-ink-faint mt-4 text-xs">
                Showing {chartApps.length} of {apps.length} metered apps.{" "}
                <Link className="underline" href="#apps">
                  Search all apps
                </Link>
              </p>
            )}
          </Card>

          {selected && (
            <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
              <Card title="Days since last start">
                <p className="text-ink-soft mb-4 text-sm">
                  <strong className="text-ink font-medium">
                    {selected.entry.name}
                  </strong>
                  , installed devices with a start or full coverage. Choose
                  another app in the table below.
                </p>
                <Recency app={selected} buckets={recencyBuckets(days)} />
              </Card>
              <Card title="Collection health">
                <p className="text-ink-soft mb-3 text-sm">
                  Why a device has no usable evidence.
                </p>
                <HealthList health={summary.health} />
              </Card>
            </div>
          )}

          <section id="apps" className="scroll-mt-6">
            <Card title="Apps">
              <form
                className="mb-4 flex flex-wrap items-end gap-3"
                action="/app/metering#apps"
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

      {!demo && (
        <section id="setup" className="scroll-mt-6">
          <Card
            title={
              connection
                ? "Collection setup"
                : "Enable metering when you need it"
            }
          >
            <p className="text-ink-soft mb-4 text-sm">
              Requires supported Intune-managed Windows devices, Microsoft Entra
              join or hybrid join, and qualifying Remediations licenses (Windows
              Enterprise E3/E5, Education A3/A5, or Windows VDA per user). Start
              with a pilot before deploying broadly.
            </p>
            {admin ? (
              <MeteringSetup
                key={connection?.id ?? "disabled"}
                enabled={Boolean(connection)}
                consented={Boolean(connection?.consentedAt)}
                configured={meteringConfigured()}
                microsoftConnected={Boolean(
                  ctx.tenant.tid && ctx.tenant.consentedAt,
                )}
                scriptId={connection?.scriptId ?? null}
                scriptName={connection?.scriptName ?? null}
                days={days}
              />
            ) : (
              <p className="text-ink-soft text-sm">
                Ask a workspace Admin to enable and configure Software Metering.
              </p>
            )}
          </Card>
        </section>
      )}
      {!demo && admin && catalog && connection && (
        <Card title="Metered apps">
          <p className="text-ink-soft mb-4 text-sm">
            Every Windows app assigned in your Intune is metered. LicenseMeter
            knows the program files of common licensed software and reads Intune
            detection rules; add a program file for anything else, or leave an
            app out. Changes take effect after you download the collector again
            and replace the detection script in Intune.
          </p>
          <MeteringApps
            key={`${connection.revision}`}
            apps={catalog.map(
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
      )}
      <p className="text-ink-faint max-w-3xl text-xs leading-relaxed">
        Metering is optional and uses separate consent. The collector reports
        program starts and coverage to Intune, never user names, paths or
        command lines. LicenseMeter reads these results, device names and app
        install status from Intune when you view or export them and does not
        store them. These records may relate to employees; review your
        organization’s requirements before enabling collection.{" "}
        <Link
          className="underline"
          href="https://docs.licensemeter.com/connectors/windows-metering/"
        >
          Read setup, data handling, and removal instructions
        </Link>
        .
      </p>
    </div>
  );
}
