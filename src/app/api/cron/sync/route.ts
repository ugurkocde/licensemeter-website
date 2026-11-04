import { eq, exists, isNotNull, or } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { env } from "~/env";
import { db } from "~/server/db";
import { adobeConnections, saasConnections, tenants } from "~/server/db/schema";
import { notifyOps } from "~/server/ops";
import { requestDeadline } from "~/server/sync/deadline";
import { dispatchTenantSyncs } from "~/server/sync/dispatch";
import { runSync } from "~/server/sync/runSync";
import { requireCronAuth } from "~/server/cronAuth";

export const maxDuration = 300;

/**
 * Stop starting new tenant syncs past this point so the in-flight ones can
 * finish inside maxDuration instead of being killed mid-write.
 */
const DEQUEUE_BUDGET_MS = 240_000;

/**
 * Longest the hand-off to per-tenant invocations may take before the rest
 * falls back to this request, leaving the fallback most of its budget.
 */
const DISPATCH_BUDGET_MS = 30_000;

/**
 * Nightly sync across all connected tenants. Protected by CRON_SECRET.
 *
 * On Vercel every tenant is dispatched to /api/cron/sync/tenant, its own
 * invocation with its own 300s budget, so the nightly run scales with the
 * number of tenants. Tenants whose dispatch is not accepted, and every tenant
 * on a self-hosted server (no per-request limit, and the public URL may not be
 * reachable from inside the container), sync in this request instead.
 */
export const GET = async (req: NextRequest) => {
  const denied = requireCronAuth(req);
  if (denied) return denied;
  const start = Date.now();
  // One deadline for the whole invocation: every tenant sync clamps to it, so
  // the function is never killed mid-sync even when the queue is long.
  const deadline = requestDeadline();

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

  const fanOut = Boolean(process.env.VERCEL && env.APP_BASE_URL);
  let queue = allTenants;
  let dispatched = 0;
  if (fanOut && allTenants.length > 0) {
    const { accepted, rejected } = await dispatchTenantSyncs(
      allTenants.map((t) => t.id),
      {
        baseUrl: env.APP_BASE_URL!,
        secret: env.CRON_SECRET!,
        deadline: start + DISPATCH_BUDGET_MS,
      },
    );
    dispatched = accepted.length;
    const left = new Set(rejected);
    queue = allTenants.filter((t) => left.has(t.id));
    if (queue.length > 0) {
      void notifyOps(
        `nightly sync could not dispatch ${queue.length} of ${allTenants.length} tenants; syncing them in the cron request`,
        { key: "cron:sync:dispatch", cooldownMs: 6 * 60 * 60 * 1000 },
      );
    }
  }

  // Bounded concurrency: sequential syncs would exceed maxDuration once a
  // handful of tenants are connected (a new service principal can add up to
  // 2 min of waits per tenant).
  const CONCURRENCY = 3;
  const results: { tenantId: string; status: string }[] = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < queue.length) {
      if (Date.now() - start > DEQUEUE_BUDGET_MS) return;
      const tenant = queue[cursor++]!;
      try {
        const result = await runSync(tenant.id, { deadline });
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
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker),
  );

  const synced = new Set(results.map((r) => r.tenantId));
  const unsynced = queue.filter((t) => !synced.has(t.id)).map((t) => t.id);
  if (unsynced.length > 0) {
    void notifyOps(
      `nightly sync ran out of time: ${unsynced.length} of ${queue.length} tenants not synced`,
      { key: "cron:sync:budget", cooldownMs: 6 * 60 * 60 * 1000 },
    );
  }

  return NextResponse.json({
    dispatched,
    synced: results.length,
    results,
    unsynced,
  });
};
