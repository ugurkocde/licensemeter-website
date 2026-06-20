"use client";

import { useEffect, useState } from "react";

import type { SyncStep } from "~/server/types";

type RunInfo = {
  status: "running" | "success" | "partial" | "failed";
  steps: SyncStep[];
  error: string | null;
} | null;

const POLL_INTERVAL_MS = 2500;
/* Stop after ~3 minutes: a stale ?status=syncing URL with no live run would
   otherwise poll forever. */
const MAX_TICKS = Math.floor((3 * 60 * 1000) / POLL_INTERVAL_MS);

/** Polls sync status after admin consent until the first sync lands. */
export const ConnectPoller = () => {
  const [run, setRun] = useState<RunInfo>(null);
  const [tick, setTick] = useState(0);
  const expired = tick >= MAX_TICKS;

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch("/api/sync", { cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as { run: RunInfo };
        if (cancelled) return;
        setRun(body.run);
        if (body.run?.status === "success" || body.run?.status === "partial") {
          window.location.href = "/app";
        }
      } catch {
        // transient network error; keep polling
      }
    };
    void poll();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (expired) return;
    const id = setInterval(() => setTick((t) => t + 1), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [expired]);

  useEffect(() => {
    if (tick === 0 || tick >= MAX_TICKS) return;
    void fetch("/api/sync", { cache: "no-store" })
      .then(async (res) => (res.ok ? ((await res.json()) as { run: RunInfo }) : null))
      .then((body) => {
        if (!body) return;
        setRun(body.run);
        if (body.run?.status === "success" || body.run?.status === "partial") {
          window.location.href = "/app";
        }
      })
      .catch(() => undefined);
  }, [tick]);

  /* One persistent live region from first render; its content swaps between
     the running line and the failure box so the change is announced. */
  return (
    <div role="status" aria-live="polite">
      {run?.status === "failed" ? (
        <div className="border border-danger-soft bg-danger-soft/50 p-4 text-sm text-danger-text">
          <p className="font-medium">The first sync failed.</p>
          <p className="mt-1">
            {run.error ?? "Check the sync history in settings."}
          </p>
        </div>
      ) : expired ? (
        <div className="text-sm text-ink-soft">
          <p>This is taking longer than expected.</p>
          <p className="mt-1">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="cursor-pointer underline underline-offset-4 hover:text-ink"
            >
              Refresh this page
            </button>
            , or come back in a minute.
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-3 text-sm text-ink-soft">
          <span
            aria-hidden="true"
            className="inline-block size-2 rounded-full bg-brand motion-safe:animate-pulse"
          />
          Running the first sync: pulling licenses, users and usage reports…
        </div>
      )}
    </div>
  );
};
