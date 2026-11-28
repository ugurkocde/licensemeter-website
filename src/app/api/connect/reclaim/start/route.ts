import { and, eq, lt } from "drizzle-orm";
import { NextResponse } from "next/server";

import { appBaseUrl, env } from "~/env";
import { apiAccess } from "~/server/access";
import { isSameOrigin } from "~/server/auth/origin";
import { db } from "~/server/db";
import { reclaimConnections, reclaimConsentStates } from "~/server/db/schema";
import { hasFeature } from "~/server/entitlement";
import { rateLimitDurable } from "~/server/rateLimit";
import { reclaimConfigured } from "~/server/reclaim/graph";

const STATE_TTL_MS = 900_000;

/**
 * Starts admin consent for the managed reclaim app. Only an Owner may grant
 * LicenseMeter write access to licenses, and only for the Microsoft tenant
 * already connected to this workspace.
 */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return new Response("Not allowed", { status: 403 });
  const back = (error: string) =>
    NextResponse.redirect(`${appBaseUrl()}/app/reclaim?error=${error}`, 303);
  const ctx = await apiAccess("owner");
  if (!ctx) return back("owner_required");
  if (ctx.tenant.isDemo || ctx.user.isDemo) return back("demo");
  if (!hasFeature(ctx.entitlement, "reclaim")) return back("plan_required");
  if (!reclaimConfigured()) return back("configuration");
  const tid = ctx.tenant.tid?.toLowerCase();
  if (!tid) return back("microsoft_first");
  if (!(await rateLimitDurable(`reclaim-consent:${ctx.tenant.id}`, 5, 600_000)))
    return back("rate_limited");

  const connection = await db.transaction(async (tx) => {
    // Create first, so two starts at once lock the same row instead of
    // racing to insert it.
    await tx
      .insert(reclaimConnections)
      .values({ tenantId: ctx.tenant.id, mode: "managed", tid })
      .onConflictDoNothing({ target: reclaimConnections.tenantId });
    const [current] = await tx
      .select()
      .from(reclaimConnections)
      .where(eq(reclaimConnections.tenantId, ctx.tenant.id))
      .for("update");
    if (current?.mode === "byo") return null;
    if (current?.tid === tid) return current;
    // A row for an earlier tenant is replaced, so its id (and any consent
    // callback bound to it) cannot carry over to the new tenant.
    if (current)
      await tx
        .delete(reclaimConnections)
        .where(eq(reclaimConnections.tenantId, ctx.tenant.id));
    const [created] = await tx
      .insert(reclaimConnections)
      .values({ tenantId: ctx.tenant.id, mode: "managed", tid })
      .returning();
    return created ?? null;
  });
  if (!connection) return back("byo_connected");

  await db
    .delete(reclaimConsentStates)
    .where(
      and(
        eq(reclaimConsentStates.tenantId, ctx.tenant.id),
        lt(reclaimConsentStates.createdAt, new Date(Date.now() - STATE_TTL_MS)),
      ),
    );
  const state = crypto.randomUUID();
  await db.insert(reclaimConsentStates).values({
    state,
    tenantId: ctx.tenant.id,
    connectionId: connection.id,
    oid: ctx.user.oid,
    tid,
  });
  const url = new URL(
    `https://login.microsoftonline.com/${tid}/v2.0/adminconsent`,
  );
  url.searchParams.set("client_id", env.RECLAIM_CLIENT_ID!);
  url.searchParams.set("scope", "https://graph.microsoft.com/.default");
  url.searchParams.set(
    "redirect_uri",
    `${appBaseUrl()}/api/connect/reclaim/callback`,
  );
  url.searchParams.set("state", state);
  return NextResponse.redirect(url, 303);
}
