import Link from "next/link";
import { ButtonAnchor, ButtonLink, Card } from "~/components/ui";
import { FeatureLockPanel } from "~/components/workspace/FeatureLock";
import { MeteringDisable } from "~/components/workspace/MeteringDisable";
import { MeteringRefresh } from "~/components/workspace/MeteringRefresh";
import { fmtDateTime } from "~/lib/format";
import type { MeteringView, SetupStep } from "~/server/metering/view";

/** Without the plan nothing is read; an Admin can still disable metering. */
export function MeteringLocked({
  view,
  overQuantity,
}: {
  view: MeteringView;
  overQuantity: boolean;
}) {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 pb-8">
      <FeatureLockPanel feature="metering" overQuantity={overQuantity} />
      {view.connection && view.admin && (
        <Card title="Existing metering setup">
          <p className="text-ink-soft mb-3 text-sm">
            LicenseMeter does not read metering results while the plan does not
            include Software Metering. Reading resumes after an upgrade.
          </p>
          <MeteringDisable />
        </Card>
      )}
    </div>
  );
}

export function MeteringHeader({
  view,
  title,
  lead,
  actions = true,
}: {
  view: MeteringView;
  title: string;
  lead: string;
  actions?: boolean;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-brand-deep text-xs font-medium tracking-widest uppercase">
          Software Metering
        </p>
        <h1 className="font-display mt-2 text-3xl tracking-tight">{title}</h1>
        <p className="text-ink-soft mt-2 max-w-2xl text-sm">{lead}</p>
      </div>
      {actions && view.report && !view.demo && (
        <div className="flex flex-wrap items-start gap-3">
          <MeteringRefresh />
          <ButtonAnchor variant="primary" href="/api/export/metering">
            Export CSV
          </ButtonAnchor>
        </div>
      )}
    </header>
  );
}

export function MeteringNotices({ view }: { view: MeteringView }) {
  return (
    <>
      {view.demo && (
        <div className="border-brand bg-brand-soft rounded-xl border p-4 text-sm">
          <strong>Sample metering report.</strong> These fictional devices and
          apps show how the evidence reads. No Microsoft permissions or Windows
          devices are connected.
        </div>
      )}
      {view.readError && (
        <p
          role="alert"
          className="bg-gold-soft text-ink rounded-xl p-4 text-sm"
        >
          {view.readError} Results are read live from Intune and are not stored,
          so none can be shown until the next successful read.
        </p>
      )}
      {view.summary && view.summary.notWatched.length > 0 && (
        <p className="bg-waste-soft text-ink rounded-xl p-4 text-sm">
          <strong>
            {view.summary.notWatched.length === 1
              ? "1 app is not watched yet"
              : `${view.summary.notWatched.length} apps are not watched yet`}
            :
          </strong>{" "}
          {view.summary.notWatched
            .slice(0, 4)
            .map((entry) => entry.name)
            .join(", ")}
          {view.summary.notWatched.length > 4 ? ", …" : ""}. They were added to
          Intune after the collector in “{view.report?.collector?.name}” was
          generated.{" "}
          {view.admin ? (
            <Link className="underline" href="/app/metering/setup#deploy">
              Update the collector
            </Link>
          ) : (
            "A workspace Admin can update the collector"
          )}
          .
        </p>
      )}
    </>
  );
}

const STEPS: {
  key: Exclude<SetupStep, "done" | "choose" | "unavailable">;
  label: string;
}[] = [
  { key: "connect", label: "Connect to Microsoft" },
  { key: "deploy", label: "Deploy the collector in Intune" },
  { key: "waiting", label: "First device report" },
];

/** Where setup stands, as three ticked or pending steps. */
export function SetupProgress({ step }: { step: SetupStep }) {
  // Choosing among several packages is part of deploying; an unreadable
  // tenant is at least connected.
  const reached =
    step === "done"
      ? 3
      : step === "choose" || step === "unavailable"
        ? 1
        : STEPS.findIndex((s) => s.key === step);
  return (
    <ol className="flex flex-col gap-2">
      {STEPS.map((item, index) => {
        const done = index < reached;
        const current = index === reached;
        return (
          <li key={item.key} className="flex items-center gap-3 text-sm">
            <span
              aria-hidden="true"
              className={`grid size-6 place-items-center rounded-full text-xs font-semibold ${
                done
                  ? "bg-brand text-white"
                  : current
                    ? "border-brand text-brand-deep border-2"
                    : "border-line-strong text-ink-faint border"
              }`}
            >
              {done ? "✓" : index + 1}
            </span>
            <span
              className={
                done
                  ? "text-ink-soft"
                  : current
                    ? "font-medium"
                    : "text-ink-faint"
              }
            >
              {item.label}
              <span className="sr-only">
                {done ? ", done" : current ? ", next" : ", not started"}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Shown on the dashboard until setup is complete. */
export function FinishSetup({ view }: { view: MeteringView }) {
  const text: Record<Exclude<SetupStep, "done" | "unavailable">, string> = {
    connect:
      "Connect the separate, read-only Software Metering app to your Microsoft tenant.",
    deploy:
      "Download the collector and add it to Intune as a Remediations script. LicenseMeter finds it automatically.",
    choose:
      "Several Remediations packages run the collector. Choose the one LicenseMeter reads in Setup.",
    waiting:
      "The collector is deployed. The first device results can take a few hours to appear in Intune.",
  };
  // While waiting for the first report, the dashboard shows a collecting strip.
  if (
    view.step === "done" ||
    view.step === "unavailable" ||
    view.step === "waiting"
  )
    return null;
  return (
    <Card title="Finish setup">
      <div className="grid gap-6 sm:grid-cols-[1fr_auto] sm:items-center">
        <div className="flex flex-col gap-4">
          <SetupProgress step={view.step} />
          <p className="text-ink-soft text-sm">{text[view.step]}</p>
        </div>
        {view.admin ? (
          <ButtonLink variant="primary" href="/app/metering/setup">
            Continue setup
          </ButtonLink>
        ) : (
          <p className="text-ink-soft text-sm">
            A workspace Admin completes setup.
          </p>
        )}
      </div>
    </Card>
  );
}

/** "First day of 60", then "Day 3 of 60". */
export const coverageLabel = (days: number, period: number) =>
  days < 1 ? `First day of ${period}` : `Day ${days} of ${period}`;

/**
 * A slim strip above the dashboard while no device has covered the whole
 * period yet. The charts below fill in as results arrive.
 */
export function CollectingNotice({ view }: { view: MeteringView }) {
  const summary = view.summary;
  if (!summary || summary.health.reporting > 0) return null;
  const waiting = summary.reporting === 0;
  const progress = Math.min(1, summary.coverageDays / view.days);
  return (
    <div className="border-line bg-card flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border px-4 py-3 text-sm">
      <div className="flex min-w-48 flex-1 items-center gap-3">
        <span className="font-medium whitespace-nowrap">
          {waiting
            ? "Waiting for the first device report"
            : coverageLabel(summary.coverageDays, view.days)}
        </span>
        {!waiting && (
          <div
            className="bg-subtle h-1.5 max-w-40 flex-1 overflow-hidden rounded-full"
            role="progressbar"
            aria-label="Coverage of the observation period"
            aria-valuemin={0}
            aria-valuemax={view.days}
            aria-valuenow={summary.coverageDays}
          >
            <div
              className="bg-brand h-full rounded-full"
              style={{ width: `${Math.max(3, progress * 100)}%` }}
            />
          </div>
        )}
      </div>
      <p className="text-ink-soft basis-full text-xs sm:basis-auto sm:text-sm">
        {waiting
          ? "The collector is deployed. First results can take a few hours to appear in Intune."
          : `Starts show as they arrive. “App not started” needs ${view.days} days without a start.`}
      </p>
    </div>
  );
}

/** Newest app starts across devices, so first results are visible at once. */
export function RecentStarts({ view }: { view: MeteringView }) {
  const summary = view.summary;
  if (!summary) return null;
  return summary.recentStarts.length ? (
    <ul className="flex flex-col">
      {summary.recentStarts.map((start, index) => (
        <li
          key={`${start.device}-${start.app}-${index}`}
          className="border-line flex justify-between gap-3 border-b py-2 text-sm last:border-b-0"
        >
          <span className="min-w-0 truncate">
            <span className="font-medium">{start.app}</span>
            <span className="text-ink-faint"> · {start.device}</span>
          </span>
          <span className="text-ink-soft whitespace-nowrap">
            {fmtDateTime(start.at)}
          </span>
        </li>
      ))}
    </ul>
  ) : (
    <p className="text-ink-soft text-sm">
      {summary.reporting > 0
        ? "None of the metered apps has been started on a reporting device yet."
        : "App starts appear here once the first device reports."}
    </p>
  );
}

export const MeteringFootnote = () => (
  <p className="text-ink-faint max-w-3xl text-xs leading-relaxed">
    The collector reports program starts and coverage to Intune, never user
    names, paths or command lines. LicenseMeter reads these results, device
    names and app install status from Intune when you view or export them and
    does not store them.{" "}
    <Link
      className="underline"
      href="https://docs.licensemeter.com/connectors/windows-metering/"
    >
      How Software Metering works
    </Link>
    .
  </p>
);
