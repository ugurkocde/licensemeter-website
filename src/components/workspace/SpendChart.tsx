import { fmtMoney } from "~/lib/format";

export type SpendPoint = { day: string; cents: number };

export type SpendSeries = {
  label: string;
  points: SpendPoint[];
};

const W = 680;
const H = 180;
const PAD = { top: 16, right: 8, bottom: 24, left: 8 };

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
export const SpendChart = ({ series }: { series: SpendSeries[] }) => {
  // A line needs three days to mean anything; freshly connected tenants see
  // a note instead of a silently missing section.
  if (series.every((s) => s.points.length < 3))
    return (
      <section className="rise rise-3 mt-10">
        <h2 className="text-xs font-medium tracking-[0.18em] text-ink-faint uppercase">
          Daily API spend
        </h2>
        <p className="mt-3 border border-line bg-card p-4 text-sm text-ink-soft">
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
  const latestParts = series
    .filter((s) => s.points.length > 0)
    .map(
      (s) =>
        `${s.label} ${fmtMoney(s.points[s.points.length - 1]!.cents, "USD")}`,
    );

  return (
    <section className="rise rise-3 mt-10">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xs font-medium tracking-[0.18em] text-ink-faint uppercase">
          Daily API spend ({days.length} days)
        </h2>
        <span className="text-xs text-ink-soft">
          Latest: {latestParts.join(" · ")}
        </span>
      </div>
      <div className="mt-3 border border-line bg-card p-4">
        <svg
          width="100%"
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`Daily API spend over ${days.length} days. Latest daily totals: ${latestParts.join(", ")}.`}
        >
          <line
            x1={PAD.left}
            y1={H - PAD.bottom}
            x2={W - PAD.right}
            y2={H - PAD.bottom}
            stroke="var(--color-line-strong)"
            strokeWidth="1"
          />
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
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-ink-soft">
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
      </div>
    </section>
  );
};
