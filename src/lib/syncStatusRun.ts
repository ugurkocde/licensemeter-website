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
