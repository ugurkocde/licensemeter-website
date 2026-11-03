import { Pill } from "~/components/ui";
import { fmtDate } from "~/lib/format";

type Terms = {
  prepaidEnabled: number;
  trialUnits: number;
  nextLifecycleAt: Date | null;
};

/** "Trial ends" for a SKU only on trial, otherwise the paid seats' renewal. */
export const lifecycleLabel = (s: Terms): string =>
  s.trialUnits > 0 && s.trialUnits >= s.prepaidEnabled
    ? "Trial ends"
    : "Renews";

/**
 * Trial indicator and renewal or trial end date under a license name, from
 * Microsoft's subscription data. Renders nothing when there is neither.
 */
export const SkuTerms = ({ sku }: { sku: Terms }) =>
  sku.trialUnits > 0 || sku.nextLifecycleAt ? (
    <div className="text-ink-faint mt-1 flex flex-wrap items-center gap-2 text-[11px]">
      {sku.trialUnits > 0 && (
        <Pill tone="plum" title="Trial seats are not counted as paid seats">
          Trial · {sku.trialUnits}
        </Pill>
      )}
      {sku.nextLifecycleAt && (
        <span>
          {lifecycleLabel(sku)} {fmtDate(sku.nextLifecycleAt)}
        </span>
      )}
    </div>
  ) : null;
