import Link from "next/link";

import { fmtMoney } from "~/lib/format";

export type TrendPoint = {
  day: string;
  spendCents: number;
  wasteCents: number;
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

const buildPath = (
  points: TrendPoint[],
  pick: (p: TrendPoint) => number,
  max: number,
): string =>
  points
    .map((p, i) => {
      const x =
        PAD.left +
        (i / Math.max(points.length - 1, 1)) * (W - PAD.left - PAD.right);
      const y = H - PAD.bottom - (pick(p) / max) * (H - PAD.top - PAD.bottom);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

/**
 * One quiet line for a chart the 12-month history window cut short. The page
 * decides when that is the case; older snapshots stay stored either way.
 */
const HistoryWindowHint = ({ href }: { href: string }) => (
  <p className="text-ink-faint mt-2 text-xs">
    Showing the last 12 months.{" "}
    <Link href={href} className="hover:text-ink underline underline-offset-4">
      Pro and MSP show 24 months.
    </Link>
  </p>
);

/**
 * Spend vs waste over the collected daily snapshots. Server-rendered SVG:
 * the ledger aesthetic wants a precise line, not an animated chart library.
 */
export const TrendChart = ({
  points,
  currency,
  windowUpgradeHref,
}: {
  points: TrendPoint[];
  currency: string;
  /** Set only when the plan's history window hides older snapshots. */
  windowUpgradeHref?: string;
}) => {
  // A line needs at least three daily snapshots to be meaningful. Rather than
  // vanish on a fresh workspace, show a short placeholder so the section stays
  // visible and sets the expectation that trends fill in over time.
  if (points.length < 3) {
    return (
      <section data-tour="trend" className="rise rise-3 mt-10">
        <h2 className="text-ink-faint text-xs font-medium tracking-[0.18em] uppercase">
          Trend
        </h2>
        <div className="border-line bg-card text-ink-soft mt-3 border border-dashed px-4 py-8 text-center text-sm">
          Spend and waste trends appear here after a few daily syncs.
        </div>
        {windowUpgradeHref && <HistoryWindowHint href={windowUpgradeHref} />}
      </section>
    );
  }

  const max = Math.max(
    ...points.flatMap((p) => [p.spendCents, p.wasteCents]),
    1,
  );
  const spendPath = buildPath(points, (p) => p.spendCents, max);
  const wastePath = buildPath(points, (p) => p.wasteCents, max);
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const lastX = W - PAD.right;
  const yOf = (value: number) =>
    H - PAD.bottom - (value / max) * (H - PAD.top - PAD.bottom);
  const csv = [
    "date,monthly_spend,monthly_waste",
    ...points.map(
      (point) =>
        `${point.day},${(point.spendCents / 100).toFixed(2)},${(point.wasteCents / 100).toFixed(2)}`,
    ),
  ].join("\n");

  return (
    <section data-tour="trend" className="rise rise-3 mt-10">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-ink-faint text-xs font-medium tracking-[0.18em] uppercase">
          Trend ({points.length} days)
        </h2>
        <span className="text-ink-soft text-xs">
          Waste {fmtMoney(first.wasteCents, currency)} →{" "}
          <span className="text-waste-text font-medium">
            {fmtMoney(last.wasteCents, currency)}
          </span>
          /mo
        </span>
      </div>
      <div className="border-line bg-card mt-3 border p-4">
        <svg
          width="100%"
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`Monthly spend and waste trend over ${points.length} days. Spend ${fmtMoney(last.spendCents, currency)}, waste ${fmtMoney(last.wasteCents, currency)} per month.`}
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
                  {fmtMoney(Math.round(max * ratio), currency)}
                </text>
              </g>
            );
          })}
          <path
            d={`${wastePath} L${W - PAD.right} ${H - PAD.bottom} L${PAD.left} ${H - PAD.bottom} Z`}
            fill="var(--color-waste-soft)"
            opacity="0.7"
          />
          <path
            d={spendPath}
            fill="none"
            stroke="var(--color-ink-soft)"
            strokeWidth="1.5"
          />
          {[
            {
              label: "Monthly spend",
              value: last.spendCents,
              color: "var(--color-ink-soft)",
            },
            {
              label: "Monthly waste",
              value: last.wasteCents,
              color: "var(--color-waste)",
            },
          ].map((point) => (
            <circle
              key={point.label}
              cx={lastX}
              cy={yOf(point.value)}
              r="5"
              fill={point.color}
            >
              <title>{`${point.label}: ${fmtMoney(point.value, currency)} on ${fmtAxisDate(last.day)}`}</title>
            </circle>
          ))}
          <path
            d={wastePath}
            fill="none"
            stroke="var(--color-waste)"
            strokeWidth="1.5"
          />
          {/* In-chart labels scale with the viewBox. Below sm they would render
              unreadably small, so the legend line carries the range instead. */}
          <text
            x={PAD.left}
            y={H - 8}
            className="fill-ink-faint font-mono max-sm:hidden"
            fontSize="11"
          >
            {fmtAxisDate(first.day)}
          </text>
          <text
            x={W - PAD.right}
            y={H - 8}
            textAnchor="end"
            className="fill-ink-faint font-mono max-sm:hidden"
            fontSize="11"
          >
            {fmtAxisDate(last.day)}
          </text>
        </svg>
        <div className="text-ink-soft mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[11px]">
          <span className="font-mono sm:hidden">
            {fmtAxisDate(first.day)} → {fmtAxisDate(last.day)}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="bg-ink-soft inline-block h-0.5 w-4" /> Monthly
            spend
          </span>
          <span className="flex items-center gap-1.5">
            <span className="bg-waste inline-block h-0.5 w-4" /> Monthly waste
          </span>
        </div>
        <div className="border-line mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <details className="min-w-0 text-sm">
            <summary className="text-ink-soft hover:text-ink inline-flex min-h-11 cursor-pointer touch-manipulation items-center font-medium">
              View daily values
            </summary>
            <div className="max-w-full overflow-x-auto">
              <table className="mt-2 w-full table-fixed text-left text-xs">
                <caption className="sr-only">
                  Monthly spend and waste per day.
                </caption>
                <thead className="text-ink-faint">
                  <tr>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      Date
                    </th>
                    <th
                      scope="col"
                      className="px-2 py-2 text-right font-medium sm:px-4"
                    >
                      Spend
                    </th>
                    <th
                      scope="col"
                      className="py-2 pl-2 text-right font-medium sm:pl-4"
                    >
                      Waste
                    </th>
                  </tr>
                </thead>
                <tbody className="text-ink-soft font-mono">
                  {points.map((point) => (
                    <tr key={point.day} className="border-line border-t">
                      <th scope="row" className="py-2 pr-4 font-normal">
                        {fmtAxisDate(point.day)}
                      </th>
                      <td className="tnum px-2 py-2 text-right text-[11px] sm:px-4 sm:text-xs">
                        {fmtMoney(point.spendCents, currency)}
                      </td>
                      <td className="tnum py-2 pl-2 text-right text-[11px] sm:pl-4 sm:text-xs">
                        {fmtMoney(point.wasteCents, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <a
            href={`data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`}
            download="licensemeter-spend-waste-trend.csv"
            className="text-ink-soft hover:text-ink inline-flex min-h-11 items-center text-xs font-medium underline-offset-4 hover:underline"
          >
            Export Chart CSV
          </a>
        </div>
      </div>
      {windowUpgradeHref && <HistoryWindowHint href={windowUpgradeHref} />}
    </section>
  );
};
