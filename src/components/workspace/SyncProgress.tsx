"use client";

import { LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";

import { SyncStepList } from "~/components/workspace/SyncStepList";
import type { SyncStep } from "~/server/types";

/** "0:07", "1:42", "12:05": minutes and seconds of a running sync. */
export const fmtElapsed = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

/**
 * Time since `since` (epoch ms) as "m:ss"; `since` undefined counts from mount
 * and null stops the clock. Ticks land on whole seconds after the origin, so
 * two clocks on one origin (the button and the checklist) always agree. The
 * value is null until mounted: the server render never guesses the time.
 */
export const useElapsed = (since: number | null | undefined): string | null => {
  const [elapsed, setElapsed] = useState<string | null>(null);
  useEffect(() => {
    if (since === null) {
      setElapsed(null);
      return;
    }
    const origin = since ?? Date.now();
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const ms = Date.now() - origin;
      setElapsed(fmtElapsed(ms));
      timer = setTimeout(tick, 1005 - (((ms % 1000) + 1000) % 1000));
    };
    tick();
    return () => clearTimeout(timer);
  }, [since]);
  return elapsed;
};

/**
 * Live checklist of a running sync: a title with the elapsed time, then the
 * steps finished so far with the next one shown as in progress. It holds no
 * live region of its own; the caller decides what gets announced.
 */
export const SyncProgress = ({
  title,
  hint,
  steps,
  since,
}: {
  title: string;
  hint?: string;
  steps: readonly SyncStep[];
  /** When the run started (epoch ms); defaults to when this mounted. */
  since?: number;
}) => {
  const elapsed = useElapsed(since);
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-ink flex items-center gap-2.5 text-sm font-medium">
          <span
            aria-hidden="true"
            className="bg-brand inline-block size-2 shrink-0 rounded-full motion-safe:animate-pulse"
          />
          {title}
        </p>
        {/* Ticks every second, so it stays out of the accessibility tree:
            a screen reader would otherwise reread it constantly. */}
        <span
          aria-hidden="true"
          className="tnum text-ink-faint shrink-0 font-mono text-xs"
        >
          {elapsed}
        </span>
      </div>
      {hint && <p className="text-ink-soft mt-1 pl-[18px] text-xs">{hint}</p>}
      <div className="mt-3">
        <SyncStepList
          steps={steps}
          checks
          trailing={
            <li className="border-line-strong text-ink-soft inline-flex items-center gap-1.5 rounded-md border border-dashed px-2 py-0.5 text-[11px] leading-5">
              <LoaderCircle
                aria-hidden="true"
                className="text-brand size-3 shrink-0 motion-safe:animate-spin"
              />
              {steps.length === 0 ? "Starting" : "Working"}
            </li>
          }
        />
      </div>
    </div>
  );
};
