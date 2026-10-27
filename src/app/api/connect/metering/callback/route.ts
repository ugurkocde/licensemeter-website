import { and, eq, gt } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { appBaseUrl } from "~/env";
import { GUID } from "~/lib/metering";
import { apiAccess } from "~/server/access";
import { audit } from "~/server/audit";
import { db } from "~/server/db";
import { meteringConnections, meteringConsentStates } from "~/server/db/schema";
import { MeteringError, verifyMeteringConsent } from "~/server/metering/graph";

export const maxDuration = 120;
export async function GET(req: NextRequest) {
  const back = (error?: string) =>
    NextResponse.redirect(
      `${appBaseUrl()}/app/metering${error ? `?error=${error}` : "?connected=1"}`,
    );
  const params = req.nextUrl.searchParams;
  const nonce = params.get("state");
  const tid = params.get("tenant");
  if (!nonce || !GUID.test(nonce)) return back("invalid_state");
  const ctx = await apiAccess("admin");
  if (!ctx || ctx.tenant.isDemo) return back("not_allowed");
  const where = and(
    eq(meteringConsentStates.state, nonce),
    eq(meteringConsentStates.tenantId, ctx.tenant.id),
    eq(meteringConsentStates.oid, ctx.user.oid),
    gt(meteringConsentStates.createdAt, new Date(Date.now() - 900_000)),
  );
  const state = await db.query.meteringConsentStates.findFirst({ where });
  if (!state) return back("invalid_state");
  if (params.get("error")) return back("consent_declined");
  if (
    params.get("admin_consent") !== "True" ||
    !tid ||
    !GUID.test(tid) ||
    tid.toLowerCase() !== state.tid.toLowerCase() ||
    tid.toLowerCase() !== ctx.tenant.tid?.toLowerCase()
  )
    return back("wrong_tenant");
  // A query-string consent result is not evidence of authorization.
  try {
    await verifyMeteringConsent(tid);
  } catch (err) {
    return back(err instanceof MeteringError ? err.code : "consent");
  }
  const accepted = await db.transaction(async (tx) => {
    // Consume first, atomically. A disabled/re-enabled connection has a new id
    // and cannot be resurrected with an old callback.
    const [used] = await tx
      .delete(meteringConsentStates)
      .where(
        and(
          where,
          gt(meteringConsentStates.createdAt, new Date(Date.now() - 900_000)),
        ),
      )
      .returning();
    if (!used) return false;
    const [connected] = await tx
      .update(meteringConnections)
      .set({ consentedAt: new Date() })
      .where(
        and(
          eq(meteringConnections.id, state.connectionId),
          eq(meteringConnections.tenantId, ctx.tenant.id),
          eq(meteringConnections.tid, state.tid),
        ),
      )
      .returning();
    return Boolean(connected);
  });
  if (!accepted) return back("invalid_state");
  await audit(ctx, "connector_connected", {
    provider: "windows_metering",
    stage: "consent_verified",
  });
  return back();
}
