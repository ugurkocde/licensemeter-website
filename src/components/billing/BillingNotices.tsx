import { CircleCheck, Lock } from "lucide-react";

import {
  isComingSoon,
  type BillingNotice,
} from "~/components/billing/billingView";
import { Pill } from "~/components/ui";
import { featureCopy } from "~/lib/featureCopy";
import { planName } from "~/lib/planLabel";
import { planFor, type Feature } from "~/server/entitlement";

const NOTICE_TEXT: Record<BillingNotice, { title: string; body: string }> = {
  checkout: {
    title: "Thank you, your payment went through.",
    body: "Activating the plan can take a minute. Reload this page if it still shows the old plan.",
  },
  marketplace: {
    title: "Your Microsoft Marketplace subscription is linked.",
    body: "Activating the plan can take a minute. Reload this page if it still shows the old plan.",
  },
};

/** Confirmation after coming back from Polar or the Marketplace landing page. */
export const ConfirmationNotice = ({ notice }: { notice: BillingNotice }) => {
  const { title, body } = NOTICE_TEXT[notice];
  return (
    <div
      role="status"
      className="border-good-soft bg-good-soft text-good-text flex items-start gap-3 rounded-2xl border px-4 py-3.5"
    >
      <CircleCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      <div className="min-w-0 text-sm">
        <p className="font-medium">{title}</p>
        <p className="mt-0.5">{body}</p>
      </div>
    </div>
  );
};

/**
 * What the locked feature is and which plan has it, for someone who followed a
 * lock here. The same copy as FeatureLockPanel, without sending them in a
 * circle: the way forward is the plan list right below.
 */
export const FeatureExplainer = ({
  feature,
  overQuantity,
}: {
  feature: Feature;
  overQuantity: boolean;
}) => {
  const { label, description } = featureCopy(feature);
  const plan = planName(planFor(feature));
  const headingId = `billing-feature-${feature}`;
  return (
    <section
      aria-labelledby={headingId}
      className="border-line bg-card shadow-card flex items-start gap-4 rounded-2xl border p-5"
    >
      <span
        aria-hidden="true"
        className="border-line bg-canvas text-ink-faint flex size-10 shrink-0 items-center justify-center rounded-lg border"
      >
        <Lock className="size-5" />
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id={headingId} className="text-ink font-medium">
            {label}
          </h2>
          {isComingSoon(feature) && <Pill tone="outline">Coming soon</Pill>}
        </div>
        <p className="text-ink-soft mt-1 text-sm leading-relaxed">
          {description}
        </p>
        <p className="text-ink-faint mt-3 text-xs font-medium tracking-[0.14em] uppercase">
          {overQuantity
            ? "Not covered by your MSP plan"
            : `Included in ${plan}`}
        </p>
      </div>
    </section>
  );
};
