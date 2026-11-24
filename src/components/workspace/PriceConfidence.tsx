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
  const { customPercent, estimatePercent, unpricedPercent } = confidence;
  const tone =
    customPercent >= 70 ? "moss" : customPercent >= 40 ? "gold" : "slate";
  const level =
    customPercent >= 70 ? "High" : customPercent >= 40 ? "Moderate" : "Low";
  return (
    <details>
      <summary className="cursor-pointer">
        <Pill
          tone={tone}
          className="max-w-full !whitespace-normal !normal-case"
        >
          Price confidence: {level} ({customPercent}% from your prices)
        </Pill>
      </summary>
      <p className="text-ink-soft mt-2 text-xs leading-relaxed">
        Your prices {customPercent}% · List estimates {estimatePercent}% ·
        Unpriced {unpricedPercent}%. Shares are weighted by purchased seats and
        estimated list prices.{" "}
        <Link className="underline underline-offset-4" href="/app/licenses">
          Edit prices
        </Link>
      </p>
    </details>
  );
}
