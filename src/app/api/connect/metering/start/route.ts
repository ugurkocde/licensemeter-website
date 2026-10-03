import { and, eq, lt } from "drizzle-orm";
import { NextResponse } from "next/server";
import { appBaseUrl, env } from "~/env";
import { apiAccess } from "~/server/access";
import { isSameOrigin } from "~/server/auth/origin";
import { db } from "~/server/db";
import { meteringConnections, meteringConsentStates } from "~/server/db/schema";
import { meteringConfigured } from "~/server/metering/graph";
import { rateLimitDurable } from "~/server/rateLimit";

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return new Response("Not allowed", { status: 403 });
  const ctx = await apiAccess("admin");
  if (!ctx || ctx.tenant.isDemo)
    return new Response("Not allowed", { status: 403 });
  const back = (error: string) =>
    NextResponse.redirect(`${appBaseUrl()}/app/metering?error=${error}`, 303);
  if (!meteringConfigured()) return back("configuration");
  const connection = await db.query.meteringConnections.findFirst({
    where: eq(meteringConnections.tenantId, ctx.tenant.id),
  });
  if (
    !connection ||
    connection.tid.toLowerCase() !== ctx.tenant.tid?.toLowerCase()
  )
    return back("enable_first");
  if (
    !(await rateLimitDurable(`metering-consent:${ctx.tenant.id}`, 5, 600_000))
  )
    return back("rate_limited");
  await db
    .delete(meteringConsentStates)
    .where(
      and(
        eq(meteringConsentStates.tenantId, ctx.tenant.id),
        lt(meteringConsentStates.createdAt, new Date(Date.now() - 900_000)),
      ),
    );
  const state = crypto.randomUUID();
  await db.insert(meteringConsentStates).values({
    state,
    tenantId: ctx.tenant.id,
    connectionId: connection.id,
    oid: ctx.user.oid,
    tid: connection.tid,
  });
  const url = new URL(
    `https://login.microsoftonline.com/${connection.tid}/v2.0/adminconsent`,
  );
  url.searchParams.set("client_id", env.METERING_CLIENT_ID!);
  url.searchParams.set("scope", "https://graph.microsoft.com/.default");
  url.searchParams.set(
    "redirect_uri",
    `${appBaseUrl()}/api/connect/metering/callback`,
  );
  url.searchParams.set("state", state);
  return NextResponse.redirect(url, 303);
}
