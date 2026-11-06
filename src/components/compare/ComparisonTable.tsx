import type { StatusQuoComparison } from "~/lib/compare/types";

const HEAD =
  "text-ink-faint px-4 py-3 text-xs font-medium tracking-[0.18em] uppercase";

/** The dimension-by-dimension table every status-quo comparison renders. */
export const ComparisonTable = ({
  comparison,
}: {
  comparison: StatusQuoComparison;
}) => (
  <div className="border-line mt-8 overflow-x-auto border">
    <table className="w-full min-w-[640px] border-collapse text-sm">
      <thead>
        <tr className="border-line bg-card border-b text-left">
          <th scope="col" className={HEAD}>
            Dimension
          </th>
          <th scope="col" className={HEAD}>
            {comparison.themLabel}
          </th>
          <th scope="col" className={HEAD}>
            LicenseMeter
          </th>
        </tr>
      </thead>
      <tbody>
        {comparison.rows.map((row) => (
          <tr
            key={row.dimension}
            className="border-line border-b last:border-b-0"
          >
            <th
              scope="row"
              className="text-ink px-4 py-4 text-left align-top font-medium whitespace-nowrap"
            >
              {row.dimension}
            </th>
            <td className="text-ink-soft px-4 py-4 align-top leading-relaxed">
              {row.them}
            </td>
            <td className="text-ink-soft bg-card px-4 py-4 align-top leading-relaxed">
              {row.licensemeter}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);
