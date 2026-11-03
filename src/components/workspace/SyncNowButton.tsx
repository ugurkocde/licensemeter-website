"use client";

import { RefreshCw } from "lucide-react";

import { Button } from "~/components/ui";
import { useElapsed } from "~/components/workspace/SyncProgress";
import { useSyncStatus } from "~/components/workspace/SyncStatus";

/**
 * Starts a full workspace sync. Lives inside a SyncStatusProvider, which runs
 * the action and shows progress and the outcome in its status panel below
 * the header. While any run is going the button shows a spinner and the
 * elapsed time at a fixed width, so neighbouring buttons never move. It stays
 * focusable (aria-disabled, not disabled) so keyboard focus is not lost.
 */
export const SyncNowButton = () => {
  const { view, start } = useSyncStatus();
  const running = view.kind === "running";
  const elapsed = useElapsed(running ? view.since : null);

  return (
    <Button
      type="button"
      variant="secondary"
      aria-disabled={running || undefined}
      onClick={start}
      className="aria-disabled:hover:border-line-strong aria-disabled:hover:bg-card min-w-[10.5rem] aria-disabled:cursor-progress"
      title="Runs a full workspace sync across every connected service, not just this one."
    >
      <RefreshCw
        aria-hidden="true"
        className={`text-ink-soft size-4 shrink-0 ${running ? "motion-safe:animate-spin" : ""}`}
      />
      {running ? (
        <span>
          Syncing{" "}
          <span className="tnum text-ink-soft inline-block w-[2.25rem] text-left font-mono text-xs">
            {elapsed}
          </span>
        </span>
      ) : (
        "Sync now"
      )}
    </Button>
  );
};
