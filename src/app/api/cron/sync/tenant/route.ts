import { eq } from "drizzle-orm";
import { after, NextResponse, type NextRequest } from "next/server";

import { requireCronAuth } from "~/server/cronAuth";
import { db } from "~/server/db";
import { tenants } from "~/server/db/schema";
import { notifyOps } from "~/server/ops";
import { requestDeadline } from "~/server/sync/deadline";
import { runSync } from "~/server/sync/runSync";

// The sync runs in after() and shares this budget.
export const maxDuration = 300;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One tenant of the nightly sync, dispatched by /api/cron/sync. Answers 202
 * as soon as the tenant is known and syncs after the response, so the
 * dispatcher is not held open and every tenant gets its own function budget.
 * Protected by CRON_SECRET like the other cron routes.
 */
export const POST = async (req: NextRequest) => {
  const deadline = requestDeadline();
  const denied = requireCronAuth(req);
  if (denied) return denied;

  const body: unknown = await req.json().catch(() => null);
  const tenantId =
    body && typeof body === "object" && "tenantId" in body
      ? body.tenantId
      : null;
  if (typeof tenantId !== "string" || !UUID.test(tenantId)) {
    return NextResponse.json({ error: "invalid_tenant" }, { status: 400 });
  }
  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
    columns: { id: true, name: true, tid: true },
  });
  if (!tenant) {
    return NextResponse.json({ error: "unknown_tenant" }, { status: 404 });
  }

  after(async () => {
    try {
      await runSync(tenant.id, { deadline });
    } catch (err) {
      // runSync records and alerts on failures it catches; this covers what
      // still throws (credential resolution, lock bookkeeping).
      void notifyOps(
        `sync failed for tenant ${tenant.name ?? tenant.tid}: ${err instanceof Error ? err.message : String(err)}`,
        { key: `sync:${tenant.id}`, cooldownMs: 60 * 60 * 1000 },
      );
    }
  });
  return NextResponse.json({ accepted: true }, { status: 202 });
};
