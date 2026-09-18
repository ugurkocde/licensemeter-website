import { ButtonLink, Card } from "~/components/ui";
import type { PriceCoverage } from "~/lib/priceCoverage";

/**
 * Price-book confidence nudge that remains visible until every relevant product
 * has a contract price; partial configuration must never look exact.
 */
export const PriceAccuracyCard = ({
  coverage,
}: {
  coverage: PriceCoverage;
}) => (
  <Card title="Price accuracy">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="max-w-2xl">
        <p className="text-ink text-sm font-medium">
          {coverage.customProducts} of {coverage.totalProducts} product prices
          use your contract values.
        </p>
        <p className="text-ink-soft mt-1 text-sm">
          {coverage.spendPercent}% of current spend is covered by custom prices
          {coverage.estimateProducts > 0
            ? `; ${coverage.estimateProducts} use list estimates`
            : ""}
          {coverage.unpricedProducts > 0
            ? `; ${coverage.unpricedProducts} are unpriced`
            : ""}
          .
        </p>
        <div
          className="bg-line mt-3 h-1.5 w-full max-w-sm overflow-hidden rounded-full"
          role="meter"
          aria-label="Contract price coverage"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={coverage.spendPercent}
        >
          <div
            className="bg-brand h-full rounded-full"
            style={{ width: `${coverage.spendPercent}%` }}
          />
        </div>
      </div>
      <ButtonLink href="/app/licenses">Set your prices</ButtonLink>
    </div>
  </Card>
);
