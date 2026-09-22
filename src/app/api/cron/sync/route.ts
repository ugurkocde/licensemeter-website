import { eq, exists, isNotNull, or } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { db } from "~/server/db";
import { adobeConnections, saasConnections, tenants } from "~/server/db/schema";
import { notifyOps } from "~/server/ops";
import { runSync } from "~/server/sync/runSync";
import { requireCronAuth } from "~/server/cronAuth";

export const maxDuration = 300;

/**
 * Stop starting new tenant syncs past this point so the in-flight ones can
 * finish inside maxDuration instead of being killed mid-write.
 */
const DEQUEUE_BUDGET_MS = 240_000;

/** Nightly sync across all connected tenants. Protected by CRON_SECRET. */
export const GET = async (req: NextRequest) => {
  const denied = requireCronAuth(req);
  if (denied) return denied;
  const start = Date.now();

  // Tenants with anything to sync: a Microsoft consent (the demo tenant has
  // consentedAt set by its seed) or at least one Adobe/SaaS connection.
  // Pure CSV-import workspaces have no live source and are left out.
  const allTenants = await db.query.tenants.findMany({
    where: or(
      isNotNull(tenants.consentedAt),
      exists(
        db
          .select({ tenantId: saasConnections.tenantId })
          .from(saasConnections)
          .where(eq(saasConnections.tenantId, tenants.id)),
      ),
      exists(
        db
          .select({ tenantId: adobeConnections.tenantId })
          .from(adobeConnections)
          .where(eq(adobeConnections.tenantId, tenants.id)),
      ),
    ),
  });

  // Bounded concurrency: sequential syncs would exceed maxDuration once a
  // handful of tenants are connected (worst case ~90s each on retry paths).
  const CONCURRENCY = 3;
  const results: { tenantId: string; status: string }[] = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < allTenants.length) {
      if (Date.now() - start > DEQUEUE_BUDGET_MS) return;
      const tenant = allTenants[cursor++]!;
      try {
        const result = await runSync(tenant.id);
        results.push({ tenantId: tenant.id, status: result.status });
      } catch (err) {
        void notifyOps(
          `sync failed for tenant ${tenant.name ?? tenant.tid}: ${err instanceof Error ? err.message : String(err)}`,
          { key: `sync:${tenant.id}`, cooldownMs: 60 * 60 * 1000 },
        );
        results.push({ tenantId: tenant.id, status: "failed" });
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, allTenants.length) }, worker),
  );

  const synced = new Set(results.map((r) => r.tenantId));
  const unsynced = allTenants.filter((t) => !synced.has(t.id)).map((t) => t.id);
  if (unsynced.length > 0) {
    void notifyOps(
      `nightly sync ran out of time: ${unsynced.length} of ${allTenants.length} tenants not synced`,
      { key: "cron:sync:budget", cooldownMs: 6 * 60 * 60 * 1000 },
    );
  }

  return NextResponse.json({ synced: results.length, results, unsynced });
};
