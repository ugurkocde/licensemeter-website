import { CalendarClock } from "lucide-react";

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
    <div className="text-ink-soft mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px]">
      {sku.trialUnits > 0 && (
        <Pill tone="plum" title="Trial seats are not counted as paid seats">
          Trial · {sku.trialUnits}
          <span className="sr-only"> seats, not counted as paid</span>
        </Pill>
      )}
      {sku.nextLifecycleAt && (
        <span className="inline-flex items-center gap-1">
          <CalendarClock
            aria-hidden="true"
            className="text-ink-faint size-3.5 shrink-0"
          />
          {lifecycleLabel(sku)}{" "}
          <time
            className="tnum"
            dateTime={sku.nextLifecycleAt.toISOString().slice(0, 10)}
          >
            {fmtDate(sku.nextLifecycleAt)}
          </time>
        </span>
      )}
    </div>
  ) : null;
