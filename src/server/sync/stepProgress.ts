import { and, eq } from "drizzle-orm";

import { db } from "~/server/db";
import { syncRuns } from "~/server/db/schema";
import type { SyncStep } from "~/server/types";

/**
 * The step log of one sync run. `record` appends a step and persists the log
 * so far to the running sync_runs row, which lets the status poll show
 * progress while the run is still going.
 *
 * Writes are fire and forget but single flight: at most one write is in
 * flight, and steps recorded meanwhile are coalesced into one follow-up write
 * of the latest log. That keeps the cost at one primary-key UPDATE per burst,
 * keeps writes in order (a slow write can never land after a newer one), and
 * never blocks the step that triggered it. A failed write is logged once and
 * swallowed: progress is a display aid and must never fail the sync.
 *
 * Callers await `settled()` before the final status write. That waits for at
 * most one small in-flight UPDATE, capped at a couple of seconds, so the final
 * write normally never races a progress write. Anything that still lands later
 * (a stalled write past the cap) is a no-op through the `status = 'running'`
 * guard in `persistRunSteps`.
 */
export type StepLog = {
  readonly steps: SyncStep[];
  record: (step: SyncStep) => void;
  settled: () => Promise<void>;
};

/** Longest the final write waits for an in-flight progress write. */
const SETTLE_LIMIT_MS = 2000;

export const createStepLog = (
  persist: (steps: SyncStep[]) => Promise<unknown>,
): StepLog => {
  const steps: SyncStep[] = [];
  let dirty = false;
  let warned = false;
  let inFlight: Promise<void> | null = null;

  const pump = async (): Promise<void> => {
    // Start on a microtask: `inFlight` is assigned before the loop can reset
    // it, and steps recorded in the same tick share the first write.
    await Promise.resolve();
    while (dirty) {
      dirty = false;
      try {
        await persist(steps.slice());
      } catch (err) {
        if (!warned) {
          warned = true;
          console.warn(
            "[sync] progress write failed",
            err instanceof Error ? err.message : String(err),
          );
        }
      }
    }
    // No await between the last `dirty` check and this reset, so a step
    // recorded after it always starts a new pump.
    inFlight = null;
  };

  return {
    steps,
    record: (step) => {
      steps.push(step);
      dirty = true;
      inFlight ??= pump();
    },
    settled: async () => {
      if (!inFlight) return;
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        inFlight,
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, SETTLE_LIMIT_MS);
        }),
      ]);
      clearTimeout(timer);
    },
  };
};

/**
 * Store the steps so far on a run that is still running. The status guard
 * makes a late write a no-op once the run has its final status and steps.
 */
export const persistRunSteps = (
  runId: string,
  steps: SyncStep[],
): Promise<unknown> =>
  db
    .update(syncRuns)
    .set({ steps })
    .where(and(eq(syncRuns.id, runId), eq(syncRuns.status, "running")));
