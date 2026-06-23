"use client";

import { useActionState } from "react";

import { Button } from "~/components/ui";
import type { ActionResult } from "~/server/msp";

type Action = (tenantId: string) => Promise<ActionResult>;

/**
 * Attach / detach control for one portfolio row. Wraps the attach/detach server
 * actions (passed in as props to keep the client/server split clean) in
 * useActionState for a pending state and inline error. A row over the
 * large-tenant seat cap is disabled with the contact-us hint (the server blocks
 * it too); the count of attached tenants drives the billed quantity, reconciled
 * server-side on every (de)attach.
 */
export const MspPortfolioActions = ({
  tenantId,
  attached,
  blocked,
  blockedReason,
  attachAction,
  detachAction,
}: {
  tenantId: string;
  attached: boolean;
  /** Over the large-tenant seat cap: Attach is disabled (priced separately). */
  blocked: boolean;
  blockedReason: string;
  attachAction: Action;
  detachAction: Action;
}) => {
  const [result, formAction, pending] = useActionState(
    async (_prev: ActionResult | null): Promise<ActionResult> =>
      attached ? detachAction(tenantId) : attachAction(tenantId),
    null,
  );

  if (!attached && blocked) {
    return (
      <span className="text-xs text-ink-faint">{blockedReason}</span>
    );
  }

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <Button variant="micro" disabled={pending} className="py-1.5">
        {pending ? "…" : attached ? "Detach" : "Attach"}
      </Button>
      {result && !result.ok && (
        <span
          role="status"
          aria-live="polite"
          className="text-xs text-danger-text"
        >
          {result.error ?? "Something went wrong"}
        </span>
      )}
    </form>
  );
};
