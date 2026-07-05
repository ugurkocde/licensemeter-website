import { fmtMoney } from "~/lib/format";

export type TrendPoint = {
  day: string;
  spendCents: number;
  wasteCents: number;
};

const W = 680;
const H = 180;
const PAD = { top: 16, right: 8, bottom: 24, left: 8 };

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
        PAD.left + (i / Math.max(points.length - 1, 1)) * (W - PAD.left - PAD.right);
      const y =
        H - PAD.bottom - (pick(p) / max) * (H - PAD.top - PAD.bottom);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

/**
 * Spend vs waste over the collected daily snapshots. Server-rendered SVG:
 * the ledger aesthetic wants a precise line, not an animated chart library.
 */
export const TrendChart = ({
  points,
  currency,
}: {
  points: TrendPoint[];
  currency: string;
}) => {
  // A line needs at least three daily snapshots to be meaningful. Rather than
  // vanish on a fresh workspace, show a short placeholder so the section stays
  // visible and sets the expectation that trends fill in over time.
  if (points.length < 3) {
    return (
      <section data-tour="trend" className="rise rise-3 mt-10">
        <h2 className="text-xs font-medium tracking-[0.18em] text-ink-faint uppercase">
          Trend
        </h2>
        <div className="mt-3 border border-dashed border-line bg-card px-4 py-8 text-center text-sm text-ink-soft">
          Spend and waste trends appear here after a few daily syncs.
        </div>
      </section>
    );
  }

  const max = Math.max(...points.map((p) => p.spendCents), 1);
  const spendPath = buildPath(points, (p) => p.spendCents, max);
  const wastePath = buildPath(points, (p) => p.wasteCents, max);
  const first = points[0]!;
  const last = points[points.length - 1]!;

  return (
    <section data-tour="trend" className="rise rise-3 mt-10">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xs font-medium tracking-[0.18em] text-ink-faint uppercase">
          Trend ({points.length} days)
        </h2>
        <span className="text-xs text-ink-soft">
          Waste {fmtMoney(first.wasteCents, currency)} →{" "}
          <span className="font-medium text-waste-text">
            {fmtMoney(last.wasteCents, currency)}
          </span>
          /mo
        </span>
      </div>
      <div className="mt-3 border border-line bg-card p-4">
        <svg
          width="100%"
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`Monthly spend and waste trend over ${points.length} days. Spend ${fmtMoney(last.spendCents, currency)}, waste ${fmtMoney(last.wasteCents, currency)} per month.`}
        >
          <line
            x1={PAD.left}
            y1={H - PAD.bottom}
            x2={W - PAD.right}
            y2={H - PAD.bottom}
            stroke="var(--color-line-strong)"
            strokeWidth="1"
          />
          <path
            d={`${wastePath} L${W - PAD.right} ${H - PAD.bottom} L${PAD.left} ${H - PAD.bottom} Z`}
            fill="var(--color-waste-soft)"
            opacity="0.7"
          />
          <path d={spendPath} fill="none" stroke="var(--color-ink-soft)" strokeWidth="1.5" />
          <path d={wastePath} fill="none" stroke="var(--color-waste)" strokeWidth="1.5" />
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
        {/* The chart is a finance figure: a screen reader needs the per-day
            numbers, not just the headline summary on the SVG. */}
        <table className="sr-only">
          <caption>
            Monthly spend and waste per day over {points.length} days.
          </caption>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Monthly spend</th>
              <th scope="col">Monthly waste</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.day}>
                <th scope="row">{fmtAxisDate(p.day)}</th>
                <td>{fmtMoney(p.spendCents, currency)}</td>
                <td>{fmtMoney(p.wasteCents, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-ink-soft">
          <span className="font-mono sm:hidden">
            {fmtAxisDate(first.day)} → {fmtAxisDate(last.day)}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 bg-ink-soft" /> Monthly spend
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 bg-waste" /> Monthly waste
          </span>
        </div>
      </div>
    </section>
  );
};
