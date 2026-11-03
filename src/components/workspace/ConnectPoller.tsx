"use client";

import { Info } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";

import { Button } from "~/components/ui";
import { triggerSync } from "~/server/actions";
import type { SyncStep } from "~/server/types";

type RunInfo = {
  id: string;
  status: "running" | "success" | "partial" | "failed";
  steps: SyncStep[];
  error: string | null;
} | null;

const POLL_INTERVAL_MS = 2500;
/* Stop after ~3 minutes: a stale ?status=syncing URL with no live run would
   otherwise poll forever. */
const MAX_TICKS = Math.floor((3 * 60 * 1000) / POLL_INTERVAL_MS);

/** Polls sync status after admin consent until the first sync lands. The
 * destination defaults to the dashboard (the Microsoft onboarding flow wants
 * the user to land on their results); connector settings pages pass their own
 * route so the admin stays in context after adding a connector. */
export const ConnectPoller = ({
  redirectTo = "/app",
  retryUnavailable,
}: {
  redirectTo?: string;
  /** Set when the workspace holds no stored credential to sync with (an
   * instant scan, or a connector removed since): this line replaces Try
   * again and tells the viewer how to recover. */
  retryUnavailable?: string;
}) => {
  const [run, setRun] = useState<RunInfo>(null);
  const [tick, setTick] = useState(0);
  const [retrying, startRetry] = useTransition();
  const [retryError, setRetryError] = useState<string | null>(null);
  const expired = tick >= MAX_TICKS;

  /** Latest run, applied to state; redirects once the sync has landed. */
  const poll = useCallback(async (): Promise<RunInfo | undefined> => {
    try {
      const res = await fetch("/api/sync", { cache: "no-store" });
      if (!res.ok) return undefined;
      const body = (await res.json()) as { run: RunInfo };
      setRun(body.run);
      if (body.run?.status === "success" || body.run?.status === "partial") {
        window.location.href = redirectTo;
      }
      return body.run;
    } catch {
      return undefined; // transient network error; keep polling
    }
  }, [redirectTo]);

  useEffect(() => {
    if (tick < MAX_TICKS) void poll();
  }, [tick, poll]);

  useEffect(() => {
    if (expired) return;
    const id = setInterval(() => setTick((t) => t + 1), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [expired]);

  /* Runs the sync again. The poller keeps showing the running line meanwhile,
     then redirects on success or shows the new failure. */
  const retry = () => {
    const failedRun = run;
    startRetry(async () => {
      setRetryError(null);
      setRun(null);
      setTick(0);
      let result: Awaited<ReturnType<typeof triggerSync>>;
      try {
        result = await triggerSync();
      } catch {
        // Network failure or a server error before the run was recorded.
        result = { ok: false, error: "Could not start the sync. Try again." };
      }
      const latest = await poll();
      if (latest === undefined) setRun(failedRun);
      // No new run means the sync was refused before it started (role, demo
      // workspace); a new failed run speaks for itself in the box.
      if (
        !result.ok &&
        (latest === undefined || latest?.id === failedRun?.id)
      ) {
        setRetryError(result.error ?? "Could not start the sync.");
      }
    });
  };

  /* One persistent live region from first render; its content swaps between
     the running line and the failure box so the change is announced. */
  return (
    <div role="status" aria-live="polite">
      {run?.status === "failed" && !retrying ? (
        <div className="border-danger-soft bg-danger-soft/50 text-danger-text border p-4 text-sm">
          <p className="font-medium">The first sync failed.</p>
          <p className="mt-1">
            {run.error ?? "Check the sync history in settings."}
          </p>
          <div
            className={`${retryUnavailable ? "mt-2" : "mt-4"} flex flex-wrap items-center gap-x-5 gap-y-1`}
          >
            {retryUnavailable ? (
              <p className="text-ink">{retryUnavailable}</p>
            ) : (
              <Button type="button" onClick={retry}>
                Try again
              </Button>
            )}
            <Link
              href="/app/settings/sync-history"
              className="hover:text-ink -mx-1 inline-flex min-h-11 items-center rounded-md px-1 text-xs font-medium underline underline-offset-4"
            >
              View sync history
            </Link>
          </div>
          {retryError && (
            <p className="text-ink mt-3 flex items-start gap-2 text-xs">
              <Info
                aria-hidden="true"
                className="text-ink-soft mt-px size-3.5 shrink-0"
              />
              {retryError}
            </p>
          )}
        </div>
      ) : expired && !retrying ? (
        <div className="text-ink-soft text-sm">
          <p>This is taking longer than expected.</p>
          <p className="mt-1">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="hover:text-ink cursor-pointer underline underline-offset-4"
            >
              Refresh this page
            </button>
            , or come back in a minute.
          </p>
        </div>
      ) : (
        <div className="text-ink-soft flex items-center gap-3 text-sm">
          <span
            aria-hidden="true"
            className="bg-brand inline-block size-2 rounded-full motion-safe:animate-pulse"
          />
          Running the first sync: pulling licenses, users and usage reports…
        </div>
      )}
    </div>
  );
};
