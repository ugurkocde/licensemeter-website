import Link from "next/link";
import type { AppSummary, HealthKey } from "~/server/metering/summary";

/**
 * Evidence colours, validated as a categorical set (light surface, adjacent
 * and all pairs): started = brand teal, not started = waste amber, still
 * collecting = blue. "No data" is the neutral hatch, never a fourth hue.
 */
export const EVIDENCE = {
  started: { label: "App started", fill: "bg-brand", text: "text-white" },
  notStarted: { label: "App not started", fill: "bg-waste", text: "text-ink" },
  collecting: {
    label: "Still collecting",
    fill: "bg-[#2a78d6]",
    text: "text-white",
  },
  noData: { label: "No data", fill: "metering-hatch", text: "text-ink" },
} as const;
type EvidenceKey = keyof typeof EVIDENCE;
const ORDER: EvidenceKey[] = ["started", "notStarted", "collecting", "noData"];
const HINTS: Record<EvidenceKey, string> = {
  started: "started at least once in the period",
  notStarted: "full coverage and no start: review the license",
  collecting: "the collector has not covered the full period yet",
  noData: "no valid result, stale report or script update needed",
};

export const EvidenceLegend = () => (
  <ul
    className="text-ink-soft flex flex-wrap gap-x-4 gap-y-1.5 text-xs"
    aria-label="Legend"
  >
    {ORDER.map((key) => (
      <li key={key} className="inline-flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className={`size-2.5 rounded-[3px] ${EVIDENCE[key].fill}`}
        />
        {EVIDENCE[key].label}
      </li>
    ))}
  </ul>
);

/** Hover/focus detail for a mark; the same text is the accessible name. */
const Tip = ({ title, body }: { title: string; body: string }) => (
  <span
    role="tooltip"
    className="bg-ink shadow-float pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden w-max max-w-60 -translate-x-1/2 rounded-lg px-2.5 py-1.5 text-left text-xs font-normal text-white group-hover:block group-focus-visible:block"
  >
    <strong className="block font-medium">{title}</strong>
    {body}
  </span>
);

/** Installed devices per app, split by evidence. The headline chart. */
export function InstalledVsStarted({
  apps,
  days,
  hrefFor,
}: {
  apps: AppSummary[];
  days: number;
  hrefFor: (id: string) => string;
}) {
  const max = Math.max(1, ...apps.map((app) => app.installed));
  return (
    <div className="flex flex-col gap-3">
      {apps.map((app) => {
        const counts: Record<EvidenceKey, number> = {
          started: app.started,
          notStarted: app.notStarted,
          collecting: app.collecting,
          noData: app.noData,
        };
        return (
          <div
            key={app.entry.id}
            className="grid grid-cols-[minmax(0,9rem)_1fr_3.5rem] items-center gap-3 sm:grid-cols-[minmax(0,12rem)_1fr_4.5rem]"
          >
            <Link
              href={hrefFor(app.entry.id)}
              className="min-w-0 hover:underline"
            >
              <span className="block truncate text-sm">{app.entry.name}</span>
              <span className="text-ink-faint block truncate font-mono text-[11px]">
                {app.entry.programs.join(", ") || "Program file unknown"}
              </span>
            </Link>
            <div
              className="flex h-6 gap-0.5"
              style={{ width: `${Math.max(4, (app.installed / max) * 100)}%` }}
              aria-label={`${app.entry.name}: installed on ${app.installed} devices`}
            >
              {app.installed === 0 ? (
                <span className="text-ink-faint self-center text-xs whitespace-nowrap">
                  Not reported installed
                </span>
              ) : (
                ORDER.filter((key) => counts[key] > 0).map((key) => (
                  <span
                    key={key}
                    tabIndex={0}
                    aria-label={`${app.entry.name}: ${EVIDENCE[key].label}, ${counts[key]} of ${app.installed} installed devices`}
                    className={`group relative flex min-w-1 items-center justify-center rounded text-[11px] font-semibold outline-none ${EVIDENCE[key].fill} ${EVIDENCE[key].text}`}
                    style={{ flex: counts[key] }}
                  >
                    {counts[key] / app.installed >= 0.12 ? counts[key] : ""}
                    <Tip
                      title={app.entry.name}
                      body={`${EVIDENCE[key].label}: ${counts[key]} of ${app.installed} installed devices, ${HINTS[key]}.`}
                    />
                  </span>
                ))
              )}
            </div>
            <span className="text-waste-text text-right text-xs font-semibold tabular-nums">
              {app.installed ? app.notStarted : ""}
            </span>
          </div>
        );
      })}
      <p className="text-ink-faint grid grid-cols-[minmax(0,9rem)_1fr_3.5rem] gap-3 text-[11px] sm:grid-cols-[minmax(0,12rem)_1fr_4.5rem]">
        <span />
        <span>
          Bar length is the number of devices with the app installed. Evidence
          covers {days} days.
        </span>
        <span className="text-right">Not started</span>
      </p>
    </div>
  );
}

/** Installed devices by days since the last start, then "not started". */
export function Recency({
  app,
  buckets,
}: {
  app: AppSummary;
  buckets: number[];
}) {
  const labels = buckets.map((limit, index) =>
    index === 0 ? `≤ ${limit} days` : `${buckets[index - 1]! + 1}–${limit}`,
  );
  labels.push(`Not in ${buckets.at(-1)} days`);
  const max = Math.max(1, ...app.recency);
  return (
    <div
      className="border-line relative grid h-48 items-end gap-2 border-b pb-6"
      style={{
        gridTemplateColumns: `repeat(${labels.length}, minmax(0, 1fr))`,
      }}
    >
      {app.recency.map((count, index) => {
        const last = index === labels.length - 1;
        return (
          <div
            key={labels[index]}
            tabIndex={0}
            aria-label={`${labels[index]}: ${count} devices`}
            className="group relative flex h-full flex-col items-center justify-end outline-none"
          >
            <span className="mb-1 text-xs font-semibold tabular-nums">
              {count}
            </span>
            <span
              className={`w-3/4 max-w-12 rounded-t ${last ? "bg-waste" : "bg-brand"}`}
              style={{ height: `${Math.max(2, (count / max) * 130)}px` }}
            />
            <span className="text-ink-faint absolute -bottom-5 text-[11px] whitespace-nowrap">
              {labels[index]}
            </span>
            <Tip
              title={app.entry.name}
              body={
                last
                  ? `${count} installed devices with full coverage and no start.`
                  : index === 0
                    ? `${count} installed devices last started it in the last ${buckets[0]} days.`
                    : `${count} installed devices last started it ${labels[index]} days ago.`
              }
            />
          </div>
        );
      })}
    </div>
  );
}

const HEALTH: {
  key: HealthKey;
  label: string;
  hint: string;
  tone: string;
  mark: string;
}[] = [
  {
    key: "reporting",
    label: "Reporting",
    hint: "Full coverage, current script",
    tone: "bg-good-soft text-good-text",
    mark: "✓",
  },
  {
    key: "collecting",
    label: "Still collecting",
    hint: "Less than the full period so far",
    tone: "bg-[#e5effb] text-[#1c5cab]",
    mark: "…",
  },
  {
    key: "outdated",
    label: "Script update needed",
    hint: "Runs an older app list",
    tone: "bg-waste-soft text-waste-text",
    mark: "↻",
  },
  {
    key: "noReport",
    label: "No collector result",
    hint: "Not assigned or not reported yet",
    tone: "bg-danger-soft text-danger-text",
    mark: "!",
  },
  {
    key: "auditOff",
    label: "Process auditing off",
    hint: "Enable Audit Process Creation",
    tone: "bg-danger-soft text-danger-text",
    mark: "!",
  },
  {
    key: "stale",
    label: "Report stale",
    hint: "No report for over eight days",
    tone: "bg-waste-soft text-waste-text",
    mark: "⏱",
  },
  {
    key: "error",
    label: "Collection error",
    hint: "Gap, reset or invalid output",
    tone: "bg-danger-soft text-danger-text",
    mark: "!",
  },
];

export const HealthList = ({
  health,
}: {
  health: Record<HealthKey, number>;
}) => (
  <ul className="flex flex-col gap-2">
    {HEALTH.filter(
      (item) => item.key === "reporting" || health[item.key] > 0,
    ).map((item) => (
      <li
        key={item.key}
        className="bg-subtle grid grid-cols-[1.5rem_1fr_auto] items-center gap-2 rounded-xl px-3 py-2 text-sm"
      >
        <span
          aria-hidden="true"
          className={`grid size-6 place-items-center rounded-md text-xs font-bold ${item.tone}`}
        >
          {item.mark}
        </span>
        <span>
          <span className="block font-medium">{item.label}</span>
          <span className="text-ink-faint block text-xs">{item.hint}</span>
        </span>
        <span className="font-semibold tabular-nums">{health[item.key]}</span>
      </li>
    ))}
  </ul>
);
