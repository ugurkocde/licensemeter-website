import type { ReactNode } from "react";

import { ButtonLink, Card } from "~/components/ui";

/**
 * Shown in place of gated content once a workspace is soft-locked. Owners get
 * the route to the plan picker; everyone else is told who can act.
 */
export const PaywallCard = ({
  isOwner,
  title = "Upgrade to view this",
  children,
}: {
  isOwner: boolean;
  title?: string;
  children?: ReactNode;
}) => (
  <Card title={title}>
    <div className="flex flex-col gap-4">
      <p className="max-w-2xl text-sm text-ink-soft">
        {children ??
          "Your trial has ended. Subscribe to restore exports, nightly sync, alerts and the full findings detail."}
      </p>
      {isOwner ? (
        <div>
          <ButtonLink href="/app/billing" variant="primary">
            Choose a plan
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
