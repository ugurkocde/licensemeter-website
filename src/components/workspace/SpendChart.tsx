import { fmtMoney } from "~/lib/format";

export type SpendPoint = { day: string; cents: number };

export type SpendSeries = {
  label: string;
  points: SpendPoint[];
};

const W = 680;
const H = 180;
const PAD = { top: 16, right: 8, bottom: 24, left: 76 };
const Y_TICKS = [0, 0.5, 1] as const;

/** Axis dates in the app's date style, without the year ("27 Apr"). */
const fmtAxisDate = (day: string): string =>
  new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" }).format(
    new Date(day),
  );

/** Line tones by series position: ink first (OpenAI), brand second (Anthropic). */
const STROKES = ["var(--color-ink-soft)", "var(--color-brand)"];
const SWATCHES = ["bg-ink-soft", "bg-brand"];

/**
 * Daily AI API spend per provider. Server-rendered SVG sibling of TrendChart:
 * up to two series share one y-scale, the x-axis is the union of both
 * series' days, and amounts are USD cents exactly as billed.
 */
export const SpendChart = ({
  series,
  sample = false,
}: {
  series: SpendSeries[];
  sample?: boolean;
}) => {
  // A line needs three days to mean anything; freshly connected tenants see
  // a note instead of a silently missing section.
  if (series.every((s) => s.points.length < 3))
    return (
      <section className="rise rise-3 mt-10">
        <h2 className="text-ink-faint text-xs font-medium tracking-[0.18em] uppercase">
          Daily API spend
        </h2>
        <p className="border-line bg-card text-ink-soft mt-3 border p-4 text-sm">
          The spend chart appears once three or more days of cost data are in.
        </p>
      </section>
    );

  const days = [
    ...new Set(series.flatMap((s) => s.points.map((p) => p.day))),
  ].sort();
  const dayIndex = new Map(days.map((d, i) => [d, i]));
  const xOf = (day: string): number =>
    PAD.left +
    ((dayIndex.get(day) ?? 0) / Math.max(days.length - 1, 1)) *
      (W - PAD.left - PAD.right);
  const max = Math.max(
    ...series.flatMap((s) => s.points.map((p) => p.cents)),
    1,
  );
  const pathOf = (points: SpendPoint[]): string =>
    points
      .map((p, i) => {
        const y = H - PAD.bottom - (p.cents / max) * (H - PAD.top - PAD.bottom);
        return `${i === 0 ? "M" : "L"}${xOf(p.day).toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");

  const firstDay = days[0]!;
  const lastDay = days[days.length - 1]!;
  // Per-series day → cents lookup for the screen-reader data table below.
  const centsBySeries = series.map(
    (s) => new Map(s.points.map((p) => [p.day, p.cents])),
  );
  const latestParts = series
    .filter((s) => s.points.length > 0)
    .map(
      (s) =>
        `${s.label} ${fmtMoney(s.points[s.points.length - 1]!.cents, "USD")}`,
    );
  const csv = [
    [
      "date",
      ...series.map((item) => `${item.label}${sample ? " (sample)" : ""}`),
    ].join(","),
    ...days.map((day) =>
      [
        day,
        ...centsBySeries.map((values) =>
          values.has(day) ? ((values.get(day) ?? 0) / 100).toFixed(2) : "",
        ),
      ].join(","),
    ),
  ].join("\n");

  return (
    <section className="rise rise-3 mt-10">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-ink-faint text-xs font-medium tracking-[0.18em] uppercase">
          Daily API spend ({days.length} days)
        </h2>
        <span className="text-ink-soft text-xs">
          Latest: {latestParts.join(" · ")}
        </span>
      </div>
      <div className="border-line bg-card mt-3 border p-4">
        <svg
          width="100%"
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`Daily API spend over ${days.length} days. Latest daily totals: ${latestParts.join(", ")}.`}
        >
          {Y_TICKS.map((ratio) => {
            const y = H - PAD.bottom - ratio * (H - PAD.top - PAD.bottom);
            return (
              <g key={ratio}>
                <line
                  x1={PAD.left}
                  y1={y}
                  x2={W - PAD.right}
                  y2={y}
                  stroke="var(--color-line-strong)"
                  strokeWidth="1"
                  opacity={ratio === 0 ? 1 : 0.45}
                />
                <text
                  x={PAD.left - 8}
                  y={y}
                  textAnchor="end"
                  dominantBaseline="middle"
                  className="fill-ink-faint font-mono"
                  fontSize="9"
                >
                  {fmtMoney(Math.round(max * ratio), "USD")}
                </text>
              </g>
            );
          })}
          {series.map(
            (s, i) =>
              s.points.length > 0 && (
                <path
                  key={s.label}
                  d={pathOf(s.points)}
                  fill="none"
                  stroke={STROKES[i] ?? "var(--color-brand)"}
                  strokeWidth="1.5"
                />
              ),
          )}
          {series.map((item, index) => {
            const point = item.points[item.points.length - 1];
            if (!point) return null;
            const y =
              H - PAD.bottom - (point.cents / max) * (H - PAD.top - PAD.bottom);
            return (
              <circle
                key={`${item.label}-latest`}
                cx={xOf(point.day)}
                cy={y}
                r="5"
                fill={STROKES[index] ?? "var(--color-brand)"}
              >
                <title>{`${item.label}: ${fmtMoney(point.cents, "USD")} on ${fmtAxisDate(point.day)}`}</title>
              </circle>
            );
          })}
          {/* In-chart labels scale with the viewBox. Below sm they would render
              unreadably small, so the legend line carries the range instead. */}
          <text
            x={PAD.left}
            y={H - 8}
            className="fill-ink-faint font-mono max-sm:hidden"
            fontSize="11"
          >
            {fmtAxisDate(firstDay)}
          </text>
          <text
            x={W - PAD.right}
            y={H - 8}
            textAnchor="end"
            className="fill-ink-faint font-mono max-sm:hidden"
            fontSize="11"
          >
            {fmtAxisDate(lastDay)}
          </text>
        </svg>
        <div className="text-ink-soft mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[11px]">
          <span className="font-mono sm:hidden">
            {fmtAxisDate(firstDay)} → {fmtAxisDate(lastDay)}
          </span>
          {series.map((s, i) => (
            <span key={s.label} className="flex items-center gap-1.5">
              <span
                className={`inline-block h-0.5 w-4 ${SWATCHES[i] ?? "bg-brand"}`}
              />{" "}
              {s.label}
            </span>
          ))}
        </div>
        <div className="border-line mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <details className="min-w-0 text-sm">
            <summary className="text-ink-soft hover:text-ink inline-flex min-h-11 cursor-pointer touch-manipulation items-center font-medium">
              View daily values
            </summary>
            <div className="max-w-full overflow-x-auto">
              <table className="mt-2 w-full table-fixed text-left text-xs">
                <caption className="sr-only">
                  Daily API spend per provider.
                </caption>
                <thead className="text-ink-faint">
                  <tr>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      Date
                    </th>
                    {series.map((item) => (
                      <th
                        key={item.label}
                        scope="col"
                        className="px-2 py-2 text-right font-medium sm:px-4"
                      >
                        {item.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="text-ink-soft font-mono">
                  {days.map((day) => (
                    <tr key={day} className="border-line border-t">
                      <th scope="row" className="py-2 pr-4 font-normal">
                        {fmtAxisDate(day)}
                      </th>
                      {centsBySeries.map((map, index) => (
                        <td
                          key={series[index]!.label}
                          className="tnum px-2 py-2 text-right text-[11px] sm:px-4 sm:text-xs"
                        >
                          {map.has(day)
                            ? fmtMoney(map.get(day)!, "USD")
                            : "none"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <a
            href={`data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`}
            download={
              sample
                ? "licensemeter-ai-spend-sample.csv"
                : "licensemeter-ai-spend.csv"
            }
            className="text-ink-soft hover:text-ink inline-flex min-h-11 items-center text-xs font-medium underline-offset-4 hover:underline"
          >
            Export Chart CSV
          </a>
        </div>
      </div>
    </section>
  );
};
