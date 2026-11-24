import Link from "next/link";
import { ButtonLink, Pill } from "~/components/ui";
import { PlanBadge } from "~/components/workspace/FeatureLock";
import { TRIAL_DAYS } from "~/lib/pricing";
import { upgradePath } from "~/lib/upgrade";
import type { priceConfidence } from "~/server/waste/spend";

export const savingsTrialLabel = `Start ${TRIAL_DAYS}-day trial`;

export function PriceConfidenceLocked() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span>Price confidence</span>
      <PlanBadge feature="savingsLedger" locked />
      <ButtonLink href={upgradePath("savingsLedger")} className="text-xs">
        {savingsTrialLabel}
      </ButtonLink>
    </div>
  );
}

export function PriceConfidenceBadge({
  confidence,
}: {
  confidence: ReturnType<typeof priceConfidence>;
}) {
  const { customPercent, estimatePercent, unpricedSeats } = confidence;
  const tone =
    customPercent >= 80 ? "moss" : customPercent >= 40 ? "gold" : "slate";
  return (
    <details>
      <summary className="cursor-pointer">
        <Pill
          tone={tone}
          className="max-w-full !whitespace-normal !normal-case"
        >
          Price confidence: {customPercent}% real prices
        </Pill>
      </summary>
      <p className="text-ink-soft mt-2 text-xs leading-relaxed">
        {customPercent}% of priced spend uses your prices. {estimatePercent}%
        uses list estimates. {unpricedSeats.toLocaleString()} seats have a zero
        or missing price.{" "}
        <Link className="underline underline-offset-4" href="/app/licenses">
          Edit prices
        </Link>
      </p>
    </details>
  );
}
