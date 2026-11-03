import type { SyncRunStatus } from "~/server/types";

/** The latest sync run as SyncStatusProvider takes it from a server page. */
export const syncStatusRun = (
  run: { id: string; status: SyncRunStatus; startedAt: Date } | undefined,
): { id: string; status: SyncRunStatus; startedAt: string } | null =>
  run
    ? { id: run.id, status: run.status, startedAt: run.startedAt.toISOString() }
    : null;

/**
 * Whether a finished run is the one the status panel was following, so its
 * result is shown. `watchedId` is a run seen running while following, or the
 * run Sync now attached to: it counts whatever its start time, because the
 * concurrency lock hands back a run that may have started before the click.
 * Otherwise, while following a Sync now click (`baseline` set), only a run
 * other than the one that was latest before the click, started no earlier
 * than `baseline.after` on the server clock, counts. Without a baseline any
 * finished run counts.
 */
export const isFollowedRun = (
  run: { id: string; startedAt: string },
  opts: {
    watchedId: string | null;
    baseline: { id: string | null; after: number } | null;
    offsetMs: number;
  },
): boolean => {
  if (opts.watchedId !== null && run.id === opts.watchedId) return true;
  const b = opts.baseline;
  if (b === null) return true;
  return (
    run.id !== b.id && Date.parse(run.startedAt) - opts.offsetMs >= b.after
  );
};

/**
 * What a status read whose latest run is not running means for the watch:
 * - "run": it is the followed run; show its result.
 * - "wait": keep polling. While Sync now is in flight its own result decides
 *   (a finished run seen meanwhile is older); a known run is still being
 *   followed; or, for a run followed on load, nothing else can be meant.
 * - "fallback": a Sync now click whose action has returned, with no run of
 *   its own: show the stored refusal, or go idle. Any read of the click's
 *   watch may decide this, so a failed final read only defers it.
 */
export const finishedReadOutcome = (read: {
  followed: boolean;
  actionPending: boolean;
  clickWatch: boolean;
  watching: boolean;
}): "run" | "wait" | "fallback" => {
  if (read.actionPending) return "wait";
  if (read.followed) return "run";
  if (read.watching || !read.clickWatch) return "wait";
  return "fallback";
};
