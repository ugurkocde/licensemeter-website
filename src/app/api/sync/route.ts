import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { apiAccess } from "~/server/access";
import { audit } from "~/server/audit";
import { isSameOrigin } from "~/server/auth/origin";
import { db } from "~/server/db";
import { syncRuns } from "~/server/db/schema";
import { rateLimitDurable } from "~/server/rateLimit";
import { runSync } from "~/server/sync/runSync";

export const maxDuration = 300;

/** Latest sync run for the caller's workspace (used for status polling). */
export const GET = async () => {
  const ctx = await apiAccess("viewer");
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const latest = await db.query.syncRuns.findFirst({
    where: eq(syncRuns.tenantId, ctx.tenant.id),
    orderBy: desc(syncRuns.startedAt),
  });
  return NextResponse.json({
    run: latest
      ? {
          id: latest.id,
          status: latest.status,
          startedAt: latest.startedAt,
          finishedAt: latest.finishedAt,
          steps: latest.steps,
          error: latest.error,
        }
      : null,
  });
};

/** Manual "Sync now". Mirrors the triggerSync server action's guards. */
export const POST = async (req: Request) => {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const ctx = await apiAccess("admin");
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!ctx.entitlement.active)
    return NextResponse.json({ error: "upgrade_required" }, { status: 402 });
  // runSync holds its own concurrency lock; this only blunts hammering the
  // endpoint with costly Graph pulls.
  if (!(await rateLimitDurable(`sync:${ctx.tenant.id}`, 3, 10 * 60 * 1000))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  await audit(ctx, "sync_triggered", {});
  const result = await runSync(ctx.tenant.id);
  revalidatePath("/app", "layout");
  return NextResponse.json(result);
};
