import type { SyncRunStatus } from "~/server/types";

/** The latest sync run as SyncStatusProvider takes it from a server page. */
export const syncStatusRun = (
  run: { id: string; status: SyncRunStatus; startedAt: Date } | undefined,
): { id: string; status: SyncRunStatus; startedAt: string } | null =>
  run
    ? { id: run.id, status: run.status, startedAt: run.startedAt.toISOString() }
    : null;
