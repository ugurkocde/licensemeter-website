import { and, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { db } from "~/server/db";
import { findings, savingsLedger, tenants } from "~/server/db/schema";
import type { ResolutionReason } from "~/server/types";

import { vendorLabel, type SeatSource } from "~/server/waste/spend";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function reverseDisconnectedSavings(
  tx: Transaction,
  tenantId: string,
  source: SeatSource,
  now = new Date(),
) {
  await tx
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .for("update");
  // A disconnected source can no longer verify any active savings.
  await tx
    .update(savingsLedger)
    .set({
      reversedAt: sql`greatest(${savingsLedger.realizedAt}, ${now.toISOString()}::timestamptz)`,
    })
    .where(
      and(
        eq(savingsLedger.tenantId, tenantId),
        eq(savingsLedger.vendor, vendorLabel(source)),
        isNull(savingsLedger.reversedAt),
      ),
    );
}

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

// Express each UTC timestamp in whole calendar months plus its fraction of
// the current month. Subtracting two positions prorates even partial months.
const monthPosition = (date: ReturnType<typeof sql>) => {
  const start = sql`date_trunc('month', ${date})`;
  return sql`(extract(year from ${date}) * 12 + extract(month from ${date})
    + extract(epoch from (${date} - ${start}))
      / extract(epoch from (${start} + interval '1 month' - ${start})))`;
};

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
  const start = monthPosition(
    sql`(${savingsLedger.realizedAt} at time zone 'UTC')`,
  );
  const end = monthPosition(
    sql`(least(${savingsLedger.reversedAt}, ${now.toISOString()}::timestamptz) at time zone 'UTC')`,
  );
  const scope = and(
    eq(savingsLedger.tenantId, tenantId),
    eq(savingsLedger.currency, currency),
    lte(savingsLedger.realizedAt, now),
  );
  const [entries, resolved, [totals]] = await Promise.all([
    db.query.savingsLedger.findMany({
      where: and(scope, gte(savingsLedger.realizedAt, since)),
      columns: {
        id: true,
        rule: true,
        vendor: true,
        skuId: true,
        reason: true,
        monthlyCents: true,
        currency: true,
        realizedAt: true,
        reversedAt: true,
      },
      orderBy: [desc(savingsLedger.realizedAt), desc(savingsLedger.id)],
    }),
    noLongerFlagged(tenantId, since, now),
    db
      .select({
        runRate: sql<number>`coalesce(sum(${savingsLedger.monthlyCents}) filter (
        where ${savingsLedger.reversedAt} is null or ${savingsLedger.reversedAt} > ${now.toISOString()}::timestamptz
      ), 0)::float8`,
        cumulative: sql<number>`coalesce(round(sum(${savingsLedger.monthlyCents} * (${end} - ${start}))), 0)::float8`,
      })
      .from(savingsLedger)
      .where(scope),
  ]);
  const buckets = new Map<string, number>();
  for (const entry of entries) {
    const month = entry.realizedAt.toISOString().slice(0, 7);
    buckets.set(month, (buckets.get(month) ?? 0) + entry.monthlyCents);
  }
  const series = months.map((month) => ({
    month,
    cents: buckets.get(month) ?? 0,
  }));
  return {
    realizedThisMonth: series.at(-1)?.cents ?? 0,
    series,
    runRate: totals?.runRate ?? 0,
    cumulative: totals?.cumulative ?? 0,
    entries,
    noLongerFlagged: resolved,
  };
}
