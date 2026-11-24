import { and, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { db } from "~/server/db";
import { findings, savingsLedger } from "~/server/db/schema";
import type { ResolutionReason } from "~/server/types";

export const DAY_MS = 86_400_000;
export const RESOLUTION_LABELS: Record<
  ResolutionReason | "unrecorded",
  string
> = {
  license_removed: "License removed",
  seats_reduced: "Purchased seats reduced",
  excluded: "Excluded",
  threshold_changed: "Inactivity threshold changed",
  activity_resumed: "Activity resumed or account enabled",
  seats_assigned: "Idle seats assigned",
  source_removed: "Source removed",
  price_changed: "Price changed",
  other: "Other",
  unrecorded: "Reason not recorded",
};

function noLongerFlagged(tenantId: string, since: Date, now: Date) {
  return db
    .select({
      reason: findings.resolutionReason,
      count: sql<number>`count(*)::int`,
    })
    .from(findings)
    .where(
      and(
        eq(findings.tenantId, tenantId),
        eq(findings.status, "resolved"),
        gte(findings.resolvedAt, since),
        lte(findings.resolvedAt, now),
        sql`coalesce(${findings.resolutionReason}, '') not in ('license_removed', 'seats_reduced')`,
      ),
    )
    .groupBy(findings.resolutionReason);
}

export async function loadRecentSavings(
  tenantId: string,
  currency: string,
  now = new Date(),
  days = 30,
) {
  const since = new Date(now.getTime() - days * DAY_MS);
  const [[active], resolved] = await Promise.all([
    db
      .select({
        cents: sql<number>`coalesce(sum(${savingsLedger.monthlyCents}), 0)::float8`,
        count: sql<number>`count(*)::int`,
      })
      .from(savingsLedger)
      .where(
        and(
          eq(savingsLedger.tenantId, tenantId),
          eq(savingsLedger.currency, currency),
          gte(savingsLedger.realizedAt, since),
          lte(savingsLedger.realizedAt, now),
          isNull(savingsLedger.reversedAt),
        ),
      ),
    noLongerFlagged(tenantId, since, now),
  ]);
  return {
    cents: active?.cents ?? 0,
    reclaimed: active?.count ?? 0,
    reasonNotRecorded: resolved.find((row) => row.reason === null)?.count ?? 0,
    noLongerFlagged: resolved.reduce((sum, row) => sum + row.count, 0),
  };
}

const monthStart = (date: Date, offset = 0) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1));

export function accruedSavings(
  monthlyCents: number,
  start: Date,
  end: Date,
): number {
  let accrued = 0;
  for (let cursor = start; cursor < end;) {
    const month = monthStart(cursor);
    const next = monthStart(cursor, 1);
    const segmentEnd = new Date(Math.min(end.getTime(), next.getTime()));
    accrued +=
      (monthlyCents * (segmentEnd.getTime() - cursor.getTime())) /
      (next.getTime() - month.getTime());
    cursor = segmentEnd;
  }
  return accrued;
}

/** Call only after checking the workspace's savingsLedger entitlement. */
export async function loadSavingsLedger(
  tenantId: string,
  currency: string,
  now = new Date(),
) {
  const months = Array.from({ length: 24 }, (_, i) =>
    monthStart(now, i - 23)
      .toISOString()
      .slice(0, 7),
  );
  const since = monthStart(now, -23);
  const [entries, resolved] = await Promise.all([
    db.query.savingsLedger.findMany({
      where: and(
        eq(savingsLedger.tenantId, tenantId),
        eq(savingsLedger.currency, currency),
        lte(savingsLedger.realizedAt, now),
      ),
      orderBy: [desc(savingsLedger.realizedAt), desc(savingsLedger.id)],
    }),
    noLongerFlagged(tenantId, since, now),
  ]);
  const buckets = new Map<string, number>();
  let runRate = 0;
  let cumulative = 0;
  for (const entry of entries) {
    const month = entry.realizedAt.toISOString().slice(0, 7);
    buckets.set(month, (buckets.get(month) ?? 0) + entry.monthlyCents);
    if (!entry.reversedAt) runRate += entry.monthlyCents;
    const until = new Date(
      Math.min(now.getTime(), entry.reversedAt?.getTime() ?? Infinity),
    );
    cumulative += accruedSavings(entry.monthlyCents, entry.realizedAt, until);
  }
  const series = months.map((month) => ({
    month,
    cents: buckets.get(month) ?? 0,
  }));
  return {
    realizedThisMonth: series.at(-1)?.cents ?? 0,
    series,
    runRate,
    cumulative: Math.round(cumulative),
    entries: entries.filter((entry) => entry.realizedAt >= since),
    noLongerFlagged: resolved,
  };
}
