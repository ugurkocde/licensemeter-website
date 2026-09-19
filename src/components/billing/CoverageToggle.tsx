"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";

import {
  attachWorkspaceAction,
  detachWorkspaceAction,
} from "~/app/app/(dash)/billing/actions";
import { Button } from "~/components/ui";

/**
 * Attach or detach one workspace. The server action decides whether the caller
 * may; a refusal is shown next to the button and announced.
 */
export const CoverageToggle = ({
  tenantId,
  workspaceName,
  attached,
}: {
  tenantId: string;
  workspaceName: string;
  attached: boolean;
}) => {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();
  const router = useRouter();

  const run = () => {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = attached
          ? await detachWorkspaceAction(tenantId)
          : await attachWorkspaceAction(tenantId);
        if (!res.ok) {
          setError(res.error ?? "That did not work. Try again.");
          return;
        }
        router.refresh();
      } catch {
        setError("No connection. Check your network and try again.");
      }
    });
  };

  return (
    <div className="flex min-w-0 flex-col gap-1 sm:items-end">
      <Button
        type="button"
        onClick={run}
        disabled={pending}
        aria-busy={pending || undefined}
        aria-describedby={error ? errorId : undefined}
        className="w-full sm:w-auto"
      >
        {pending ? "Saving…" : attached ? "Detach" : "Attach"}
        <span className="sr-only"> {workspaceName}</span>
      </Button>
      <span
        id={errorId}
        role="status"
        aria-live="polite"
        className={error ? "text-danger-text text-xs sm:text-right" : "sr-only"}
      >
        {error}
      </span>
    </div>
  );
};
