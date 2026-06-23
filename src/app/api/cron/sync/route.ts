import { isNotNull } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { db } from "~/server/db";
import { tenants } from "~/server/db/schema";
import { notifyOps } from "~/server/ops";
import { runSync } from "~/server/sync/runSync";
import { requireCronAuth } from "~/server/cronAuth";

export const maxDuration = 300;

/** Nightly sync across all connected tenants. Protected by CRON_SECRET. */
export const GET = async (req: NextRequest) => {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  // CSV-trial workspaces (consentedAt null) have no Graph access. Syncing
  // them could only fail. The demo tenant has consentedAt set by its seed.
  const allTenants = await db.query.tenants.findMany({
    where: isNotNull(tenants.consentedAt),
  });

  // Bounded concurrency: sequential syncs would exceed maxDuration once a
  // handful of tenants are connected (worst case ~45s each on retry paths).
  const CONCURRENCY = 3;
  const results: { tenantId: string; status: string }[] = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < allTenants.length) {
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

  return NextResponse.json({ synced: results.length, results });
};
