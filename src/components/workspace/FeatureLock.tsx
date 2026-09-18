import { Lock } from "lucide-react";
import type { ReactNode } from "react";

import { ButtonLink } from "~/components/ui";
import { featureCopy } from "~/lib/featureCopy";
import { planName } from "~/lib/planLabel";
import { upgradePath } from "~/lib/upgrade";
import {
  hasFeature,
  planFor,
  type Entitlement,
  type Feature,
} from "~/server/entitlement";

/**
 * Inline marker for a nav item or button that leads to a locked feature. The
 * plan is always there as text: visible by default, screen-reader only when
 * the host has no room for it.
 */
export const LockMark = ({
  feature,
  showPlan = true,
  className = "",
}: {
  feature: Feature;
  showPlan?: boolean;
  className?: string;
}) => (
  <span
    className={`inline-flex shrink-0 items-center gap-1 text-[11px] font-medium tracking-wide uppercase ${className}`}
  >
    <Lock aria-hidden="true" className="size-3.5" />
    <span className={showPlan ? undefined : "sr-only"}>
      <span className="sr-only">, requires </span>
      {planName(planFor(feature))}
    </span>
  </span>
);

/**
 * Stands in for a feature page or section the workspace has not paid for:
 * what the feature is, which plan includes it, and the way to get it.
 */
export const FeatureLockPanel = ({
  feature,
  overQuantity = false,
}: {
  feature: Feature;
  /** The account has an MSP plan, but this workspace is beyond its quantity. */
  overQuantity?: boolean;
}) => {
  const { label, description } = featureCopy(feature);
  const plan = planName(planFor(feature));
  const headingId = `feature-lock-${feature}`;
  return (
    <section
      aria-labelledby={headingId}
      className="border-line bg-card shadow-card mx-auto flex max-w-md flex-col items-center rounded-2xl border px-6 py-10 text-center"
    >
      <span
        aria-hidden="true"
        className="border-line bg-canvas text-ink-faint mb-3 flex size-10 items-center justify-center rounded-lg border"
      >
        <Lock className="size-5" />
      </span>
      <h2 id={headingId} className="text-ink font-medium">
        {label}
      </h2>
      <p className="text-ink-soft mt-1 text-sm leading-relaxed">
        {description}
      </p>
      <p className="text-ink-faint mt-4 text-xs font-medium tracking-[0.14em] uppercase">
        {overQuantity ? "Not covered by your MSP plan" : `Included in ${plan}`}
      </p>
      <ButtonLink
        href={upgradePath(feature)}
        variant="primary"
        className="mt-4"
      >
        {overQuantity ? "Review your plan" : `Upgrade to ${plan}`}
      </ButtonLink>
    </section>
  );
};

/**
 * Renders children when the workspace has the feature, the lock panel
 * otherwise. Self-hosted installs and the demo workspace have every feature,
 * so they always get the children.
 */
export const FeatureGate = ({
  entitlement,
  feature,
  children,
}: {
  entitlement: Entitlement;
  feature: Feature;
  children: ReactNode;
}) =>
  hasFeature(entitlement, feature) ? (
    <>{children}</>
  ) : (
    <FeatureLockPanel
      feature={feature}
      overQuantity={entitlement.state === "overQuantity"}
    />
  );
