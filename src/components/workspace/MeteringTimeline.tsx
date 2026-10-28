import Link from "next/link";
import { fmtDateTime } from "~/lib/format";
import { METERING_DAILY_DAYS, utcDay } from "~/lib/metering";
import type { DayBar, FleetDaily } from "~/server/metering/summary";
import { Tip } from "./MeteringCharts";

/**
 * Categorical slots 1 to 5 in fixed order, validated as an adjacent set on the
 * white card (CVD and normal-vision separation pass). Three sit below 3:1
 * contrast, so the legend carries every total and a table view is offered.
 * "Other" is the neutral, never a sixth hue.
 */
const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"];
const OTHER = "#a3acb9";
const DEVICES = "#64748b";

/** "28 Oct" for a UTC day number. */
export const fmtDay = (day: number) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(day * 86_400_000));

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? "" : "s"}`;

/** Tips of the outer columns open inwards, so they stay on screen. */
const alignAt = (index: number, length: number) =>
  index < 4 ? "start" : index >= length - 4 ? "end" : "center";

/** Today and every seventh day before it. */
function DayAxis({ days }: { days: number[] }) {
  return (
    <div
      aria-hidden="true"
      className="text-ink-faint mt-1.5 grid text-[11px]"
      style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
    >
      {days.map((day, index) => {
        const back = days.length - 1 - index;
        return (
          <span
            key={day}
            className={`whitespace-nowrap ${back === 0 ? "justify-self-end" : "justify-self-center"}`}
          >
            {back % 7 === 0 ? (back === 0 ? "Today" : fmtDay(day)) : ""}
          </span>
        );
      })}
    </div>
  );
}

/**
 * The chart's frame before any day was counted: hatched days, the axis and
 * the reason, so the chart reads as waiting rather than empty or broken.
 */
function NotCountedYet({
  days,
  height,
  message,
}: {
  days: number[];
  height: string;
  message: React.ReactNode;
}) {
  const list = days.length
    ? days
    : Array.from(
        { length: METERING_DAILY_DAYS },
        (_, index) => utcDay(Date.now()) - METERING_DAILY_DAYS + 1 + index,
      );
  return (
    <div>
      <div className={`relative ${height}`}>
        <div
          aria-hidden="true"
          className="border-line grid h-full items-end gap-[2px] border-b"
          style={{
            gridTemplateColumns: `repeat(${list.length}, minmax(0, 1fr))`,
          }}
        >
          {list.map((day) => (
            <span
              key={day}
              className="metering-hatch h-full rounded-t-[4px] opacity-25"
            />
          ))}
        </div>
        <div className="absolute inset-0 grid place-items-center p-3">
          <p className="bg-card border-line text-ink-soft max-w-sm rounded-lg border px-3 py-2 text-center text-sm shadow-sm">
            {message}
          </p>
        </div>
      </div>
      <DayAxis days={list} />
    </div>
  );
}

/** Counted days so far had no start: say when counting began, not "0 in 30 days". */
const quietSince = (since: Date, who: string) =>
  `Counting per day began ${fmtDateTime(since)}. No metered app has started ${who} since then; new starts show after the next hourly report.`;

const NoCount = () => (
  <span className="metering-hatch block h-full w-full rounded-t-[4px] opacity-40" />
);

/**
 * Metered app starts per day across the fleet, stacked by the most started
 * apps, with devices that started any app as a second, separate chart.
 */
export function FleetChart({
  fleet,
  hrefFor,
  empty,
}: {
  fleet: FleetDaily;
  hrefFor: (id: string) => string;
  /** Why no day is counted yet, shown inside the empty chart. */
  empty?: React.ReactNode;
}) {
  const { days, apps, other, countingSince } = fleet;
  if (
    countingSince &&
    days.every((bar) => !bar.starts) &&
    days.some((bar) => bar.starts === 0)
  )
    return (
      <NotCountedYet
        days={days.map((bar) => bar.day)}
        height="h-44"
        message={quietSince(countingSince, "on a reporting device")}
      />
    );
  if (days.every((bar) => bar.starts === null))
    return (
      <NotCountedYet
        days={days.map((bar) => bar.day)}
        height="h-44"
        message={
          empty ??
          "Starts per day appear once devices run the current collector. Each device counts from its first run after the update."
        }
      />
    );
  const max = Math.max(1, ...days.map((bar) => bar.starts ?? 0));
  const maxDevices = Math.max(1, ...days.map((bar) => bar.devices));
  const otherTotal = other.reduce((sum, value) => sum + value, 0);
  const columns = {
    gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`,
  };
  return (
    <div className="flex flex-col gap-5">
      <ul
        className="text-ink-soft flex flex-wrap gap-x-4 gap-y-1.5 text-xs"
        aria-label="Apps in the chart"
      >
        {apps.map((app, index) => (
          <li key={app.id}>
            <Link
              href={hrefFor(app.id)}
              className="inline-flex items-center gap-1.5 hover:underline"
            >
              <span
                aria-hidden="true"
                className="size-2.5 rounded-[3px]"
                style={{ background: SERIES[index] }}
              />
              <span className="text-ink">{app.name}</span>
              <span className="tabular-nums">{app.total}</span>
            </Link>
          </li>
        ))}
        {otherTotal > 0 && (
          <li className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="size-2.5 rounded-[3px]"
              style={{ background: OTHER }}
            />
            <span className="text-ink">Other apps</span>
            <span className="tabular-nums">{otherTotal}</span>
          </li>
        )}
      </ul>

      <div>
        <div
          className="border-line grid h-44 items-end gap-[2px] border-b"
          style={columns}
        >
          {days.map((bar, index) => {
            const label = fmtDay(bar.day);
            const parts = [
              ...apps.map((app, slot) => ({
                name: app.name,
                count: app.starts[index]!,
                color: SERIES[slot]!,
              })),
              { name: "Other apps", count: other[index]!, color: OTHER },
            ].filter((part) => part.count > 0);
            const summary =
              bar.starts === null
                ? "No device counted starts this day."
                : `${plural(bar.starts, "start")} on ${plural(bar.devices, "device")}.`;
            return (
              <div
                key={bar.day}
                tabIndex={0}
                aria-label={`${label}: ${summary} ${parts.map((part) => `${part.name} ${part.count}`).join(", ")}`}
                className="group relative flex h-full flex-col-reverse gap-[2px] outline-none"
              >
                {bar.starts === null ? (
                  <NoCount />
                ) : (
                  parts.map((part, slot) => (
                    <span
                      key={part.name}
                      className={
                        slot === parts.length - 1 ? "rounded-t-[4px]" : ""
                      }
                      style={{
                        background: part.color,
                        height: `${(part.count / max) * 100}%`,
                        minHeight: 2,
                      }}
                    />
                  ))
                )}
                <Tip
                  title={label}
                  align={alignAt(index, days.length)}
                  body={
                    <>
                      {summary}
                      {parts.map((part) => (
                        <span
                          key={part.name}
                          className="flex items-center gap-1.5"
                        >
                          <span
                            aria-hidden="true"
                            className="size-2 rounded-[2px]"
                            style={{ background: part.color }}
                          />
                          {part.name}: {part.count}
                        </span>
                      ))}
                    </>
                  }
                />
              </div>
            );
          })}
        </div>
        <DayAxis days={days.map((bar) => bar.day)} />
      </div>

      <div>
        <p className="text-ink-soft mb-1.5 text-xs">Devices with a start</p>
        <div
          className="border-line grid h-12 items-end gap-[2px] border-b"
          style={columns}
        >
          {days.map((bar, index) => (
            <div
              key={bar.day}
              className="group relative flex h-full flex-col justify-end"
              aria-hidden="true"
            >
              {bar.starts === null ? (
                <NoCount />
              ) : (
                bar.devices > 0 && (
                  <span
                    className="rounded-t-[4px]"
                    style={{
                      background: DEVICES,
                      height: `${(bar.devices / maxDevices) * 100}%`,
                      minHeight: 2,
                    }}
                  />
                )
              )}
              <Tip
                title={fmtDay(bar.day)}
                align={alignAt(index, days.length)}
                body={
                  bar.starts === null
                    ? "No device counted starts this day."
                    : `${plural(bar.devices, "device")} started a metered app, of ${bar.counted} counting.`
                }
              />
            </div>
          ))}
        </div>
      </div>

      <details className="text-sm">
        <summary className="text-ink-soft cursor-pointer text-xs">
          Show as table
        </summary>
        <div className="mt-3 max-h-80 overflow-auto">
          <table className="w-full text-left text-xs tabular-nums">
            <caption className="sr-only">Metered app starts per day</caption>
            <thead className="text-ink-faint border-line border-b">
              <tr>
                <th scope="col" className="py-1.5 pr-3 font-medium">
                  Day (UTC)
                </th>
                {apps.map((app) => (
                  <th
                    key={app.id}
                    scope="col"
                    className="py-1.5 pr-3 font-medium"
                  >
                    {app.name}
                  </th>
                ))}
                {otherTotal > 0 && (
                  <th scope="col" className="py-1.5 pr-3 font-medium">
                    Other apps
                  </th>
                )}
                <th scope="col" className="py-1.5 pr-3 font-medium">
                  Starts
                </th>
                <th scope="col" className="py-1.5 font-medium">
                  Devices
                </th>
              </tr>
            </thead>
            <tbody>
              {[...days.keys()].reverse().map((index) => {
                const bar = days[index]!;
                return (
                  <tr
                    key={bar.day}
                    className="border-line border-b last:border-b-0"
                  >
                    <th
                      scope="row"
                      className="py-1.5 pr-3 font-normal whitespace-nowrap"
                    >
                      {fmtDay(bar.day)}
                    </th>
                    {bar.starts === null ? (
                      <td
                        className="text-ink-faint py-1.5"
                        colSpan={apps.length + (otherTotal > 0 ? 3 : 2)}
                      >
                        Not counted
                      </td>
                    ) : (
                      <>
                        {apps.map((app) => (
                          <td key={app.id} className="py-1.5 pr-3">
                            {app.starts[index]}
                          </td>
                        ))}
                        {otherTotal > 0 && (
                          <td className="py-1.5 pr-3">{other[index]}</td>
                        )}
                        <td className="py-1.5 pr-3 font-medium">
                          {bar.starts}
                        </td>
                        <td className="py-1.5">{bar.devices}</td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

/**
 * Starts per day for one app or one device, a single series. Hatched days
 * were not counted, or fall before watching restarted, so starts may be
 * missing there.
 */
export function DailyStarts({
  bars,
  title,
  unit = "device",
  empty,
  since,
}: {
  bars: DayBar[] | null;
  /** Names the series in tips and the accessible label. */
  title: string;
  /** What "devices" counts: devices for an app, or none for one device. */
  unit?: "device" | "none";
  /** Why no day is counted yet, shown inside the empty chart. */
  empty?: React.ReactNode;
  /** Counting per day began within the chart's days. */
  since?: Date | null;
}) {
  if (
    since &&
    bars?.every((bar) => !bar.starts) &&
    bars.some((bar) => bar.starts === 0)
  )
    return (
      <NotCountedYet
        days={bars.map((bar) => bar.day)}
        height="h-28"
        message={quietSince(
          since,
          unit === "none" ? "on this device" : "on a reporting device",
        )}
      />
    );
  if (!bars || bars.every((bar) => bar.starts === null))
    return (
      <NotCountedYet
        days={bars?.map((bar) => bar.day) ?? []}
        height="h-28"
        message={
          empty ??
          "No starts per day yet. They appear once devices run the current collector."
        }
      />
    );
  const max = Math.max(1, ...bars.map((bar) => bar.starts ?? 0));
  const total = bars.reduce((sum, bar) => sum + (bar.starts ?? 0), 0);
  return (
    <div>
      <p className="text-ink-soft mb-2 text-xs">
        <span className="text-ink font-semibold tabular-nums">{total}</span>{" "}
        {total === 1 ? "start" : "starts"}{" "}
        {since ? `since ${fmtDateTime(since)}` : `in ${bars.length} days`}
      </p>
      <div
        className="border-line grid h-28 items-end gap-[2px] border-b"
        style={{
          gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))`,
        }}
      >
        {bars.map((bar, index) => {
          const label = fmtDay(bar.day);
          const text =
            bar.starts === null
              ? "Not counted."
              : `${plural(bar.starts, "start")}${unit === "device" ? ` on ${plural(bar.devices, "device")}` : ""}.${bar.partial ? " Watching restarted that day or later, so starts may be missing." : ""}`;
          return (
            <div
              key={bar.day}
              tabIndex={0}
              aria-label={`${title}, ${label}: ${text}`}
              className="group relative flex h-full flex-col justify-end outline-none"
            >
              {bar.starts === null ? (
                <NoCount />
              ) : (
                <>
                  {bar.partial && (
                    <span className="metering-hatch absolute inset-0 rounded-t-[4px] opacity-25" />
                  )}
                  {bar.starts > 0 && (
                    <span
                      className="bg-brand relative rounded-t-[4px]"
                      style={{
                        height: `${(bar.starts / max) * 100}%`,
                        minHeight: 2,
                      }}
                    />
                  )}
                </>
              )}
              <Tip
                title={label}
                align={alignAt(index, bars.length)}
                body={text}
              />
            </div>
          );
        })}
      </div>
      <DayAxis days={bars.map((bar) => bar.day)} />
      {bars.some((bar) => bar.starts === null || bar.partial) && (
        <p className="text-ink-faint mt-2 flex items-center gap-1.5 text-[11px]">
          <span
            aria-hidden="true"
            className="metering-hatch size-2.5 rounded-[3px]"
          />
          Hatched days were not counted, or fall before watching restarted. Days
          are UTC.
        </p>
      )}
    </div>
  );
}

/** A 30-day strip for table rows; the cell's text carries the numbers. */
export function StartsStrip({ bars }: { bars: DayBar[] | null }) {
  if (!bars) return null;
  const max = Math.max(1, ...bars.map((bar) => bar.starts ?? 0));
  return (
    <span
      aria-hidden="true"
      className="grid h-5 w-28 items-end gap-px"
      style={{ gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))` }}
    >
      {bars.map((bar) =>
        bar.starts === null ? (
          <span key={bar.day} className="metering-hatch h-full opacity-40" />
        ) : (
          <span
            key={bar.day}
            className={bar.starts > 0 ? "bg-brand rounded-t-[2px]" : "bg-line"}
            style={{
              height: bar.starts > 0 ? `${(bar.starts / max) * 100}%` : 1,
              minHeight: 2,
            }}
          />
        ),
      )}
    </span>
  );
}

/** Total starts over the bars, or null when none were counted. */
export const totalStarts = (bars: DayBar[] | null) =>
  bars?.some((bar) => bar.starts !== null)
    ? bars.reduce((sum, bar) => sum + (bar.starts ?? 0), 0)
    : null;

/** "Not counted", "1 start" or "12 starts", for table cells. */
export const startsLabel = (bars: DayBar[] | null, since?: Date | null) => {
  const total = totalStarts(bars);
  if (total === null) return "Not counted";
  return since
    ? `${plural(total, "start")} since ${fmtDay(utcDay(since.getTime()))}`
    : plural(total, "start");
};
