import Link from "next/link";
import { Card } from "~/components/ui";
import {
  EvidenceLegend,
  HealthList,
  InstalledVsStarted,
  Recency,
} from "~/components/workspace/MeteringCharts";
import {
  CollectingNotice,
  FinishSetup,
  MeteringFootnote,
  MeteringHeader,
  MeteringLocked,
  MeteringNotices,
  RecentStarts,
} from "~/components/workspace/MeteringParts";
import { fmtDateTime } from "~/lib/format";
import { requireAccess } from "~/server/access";
import { recencyBuckets } from "~/server/metering/summary";
import { loadMetering } from "~/server/metering/view";

export const metadata = { title: "Software Metering" };
// Results are read live from Intune on each view and never stored.
export const maxDuration = 300;

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

export default async function MeteringPage() {
  const ctx = await requireAccess("viewer");
  const view = await loadMetering(ctx);
  if (!view.allowed)
    return (
      <MeteringLocked
        view={view}
        overQuantity={ctx.entitlement.state === "overQuantity"}
      />
    );
  const { report, summary, days, demo } = view;
  const apps = summary?.apps ?? [];
  // Apps without a known program file are not metered, so they stay out of
  // the chart instead of reading as missing evidence.
  const chartApps = apps
    .filter((app) => app.installed > 0 && app.entry.programs.length > 0)
    .slice(0, 10);
  const selected = chartApps[0] ?? apps.find((app) => app.installed > 0);
  // The dashboard shows as soon as the collector is deployed; evidence fills
  // in as devices report, so there is no separate waiting view.
  const live =
    view.step === "waiting" ||
    view.step === "done" ||
    Boolean(summary && summary.health.reporting > 0);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 pb-8">
      <MeteringHeader
        view={view}
        title="Dashboard"
        lead="Which Windows apps you deploy through Intune are installed, and whether they were started. Read live from Intune; nothing is stored and no user names are shown."
      />
      <MeteringNotices view={view} />
      <FinishSetup view={view} />
      {summary && report && live && (
        <>
          <CollectingNotice view={view} />
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
                  `/app/metering/apps?app=${encodeURIComponent(id)}#devices`
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
                <Link className="underline" href="/app/metering/apps">
                  Search all apps
                </Link>
              </p>
            )}
          </Card>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <div className="flex flex-col gap-6">
              {selected && (
                <Card title="Days since last start">
                  <p className="text-ink-soft mb-4 text-sm">
                    <strong className="text-ink font-medium">
                      {selected.entry.name}
                    </strong>
                    , installed devices with a start or full coverage. Choose
                    another app on the Apps page.
                  </p>
                  <Recency app={selected} buckets={recencyBuckets(days)} />
                </Card>
              )}
              <Card title="Recent app starts">
                <RecentStarts view={view} />
              </Card>
            </div>
            <Card title="Collection health">
              <p className="text-ink-soft mb-3 text-sm">
                Why a device has no usable evidence.
              </p>
              <HealthList health={summary.health} />
              {summary.health.noReport > 0 && (
                <p className="text-ink-faint mt-3 text-xs">
                  Devices outside the collector’s assignment never report. That
                  is expected during a pilot.
                </p>
              )}
            </Card>
          </div>
        </>
      )}
      <MeteringFootnote />
    </div>
  );
}
