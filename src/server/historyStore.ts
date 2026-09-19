import { and, desc, eq, gte, lt } from "drizzle-orm";

import { db } from "~/server/db";
import { snapshots } from "~/server/db/schema";
import type { Entitlement } from "~/server/entitlement";
import { historyStartDay, showHistoryHint } from "~/server/history";

export type WasteHistory = {
  /** Newest first, never older than the workspace's history window. */
  rows: (typeof snapshots.$inferSelect)[];
  /**
   * True when the plan's window, not `limit`, is what hides older snapshots
   * from this read: the cue for the "Showing the last 12 months" line.
   */
  cutOff: boolean;
};

/**
 * The one way to read a workspace's snapshot time series for a chart, a
 * comparison or an export. It only narrows what is read: rows outside the
 * window stay in the table. Lookups of the current state (the latest snapshot)
 * and everything that writes snapshots do not belong here.
 */
export async function loadWasteHistory(
  tenantId: string,
  entitlement: Pick<Entitlement, "features">,
  options: { now?: Date; limit?: number } = {},
): Promise<WasteHistory> {
  const { now = new Date(), limit } = options;
  const startDay = historyStartDay(entitlement, now);

  const rows = await db.query.snapshots.findMany({
    where: and(eq(snapshots.tenantId, tenantId), gte(snapshots.day, startDay)),
    orderBy: desc(snapshots.day),
    limit,
  });

  // Plans with the full window never see the hint, and a read that filled its
  // limit was cut by the limit, so both skip the second query.
  const windowBound = limit === undefined || rows.length < limit;
  if (!windowBound || !showHistoryHint(entitlement, true)) {
    return { rows, cutOff: false };
  }

  const [older] = await db
    .select({ day: snapshots.day })
    .from(snapshots)
    .where(and(eq(snapshots.tenantId, tenantId), lt(snapshots.day, startDay)))
    .limit(1);
  return { rows, cutOff: showHistoryHint(entitlement, older !== undefined) };
}
