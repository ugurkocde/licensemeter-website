import type { ReactNode } from "react";

import { ButtonLink, Card } from "~/components/ui";
import type { EntitlementState } from "~/server/entitlement";

/** Default body copy per lock reason; explicit children always override. */
const lockCopy = (state?: EntitlementState): string =>
  state === "incomplete"
    ? "Your payment didn't complete. Finish paying to restore exports, nightly sync, alerts and the full findings detail."
    : "Your trial has ended. Subscribe to restore exports, nightly sync, alerts and the full findings detail.";

/**
 * Shown in place of gated content once a workspace is soft-locked. Owners get
 * the route to the plan picker; everyone else is told who can act. `state`
 * tailors the default copy (e.g. an incomplete first payment vs an ended trial).
 */
export const PaywallCard = ({
  isOwner,
  title = "Upgrade to view this",
  state,
  children,
}: {
  isOwner: boolean;
  title?: string;
  state?: EntitlementState;
  children?: ReactNode;
}) => (
  <Card title={title}>
    <div className="flex flex-col gap-4">
      <p className="max-w-2xl text-sm text-ink-soft">
        {children ?? lockCopy(state)}
      </p>
      {isOwner ? (
        <div>
          <ButtonLink href="/app/billing" variant="primary">
            {state === "incomplete" ? "Complete payment" : "Choose a plan"}
          </ButtonLink>
        </div>
      ) : (
        <p className="text-sm text-ink-faint">
          Ask a workspace owner to upgrade.
        </p>
      )}
    </div>
  </Card>
);
