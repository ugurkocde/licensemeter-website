import { and, eq, gt } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { appBaseUrl } from "~/env";
import { GUID } from "~/lib/metering";
import { apiAccess } from "~/server/access";
import { audit } from "~/server/audit";
import { db } from "~/server/db";
import { reclaimConnections, reclaimConsentStates } from "~/server/db/schema";
import { hasFeature } from "~/server/entitlement";
import { ReclaimError, verifyReclaimCredential } from "~/server/reclaim/graph";

export const maxDuration = 60;

const STATE_TTL_MS = 900_000;

export async function GET(req: NextRequest) {
  const back = (error?: string) =>
    NextResponse.redirect(
      `${appBaseUrl()}/app/reclaim${error ? `?error=${error}` : "?connected=1"}`,
    );
  const params = req.nextUrl.searchParams;
  const nonce = params.get("state");
  const tid = params.get("tenant");
  if (!nonce || !GUID.test(nonce)) return back("invalid_state");
  const ctx = await apiAccess("owner");
  if (!ctx) return back("owner_required");
  if (ctx.tenant.isDemo || ctx.user.isDemo) return back("demo");
  if (!hasFeature(ctx.entitlement, "reclaim")) return back("plan_required");
  const where = and(
    eq(reclaimConsentStates.state, nonce),
    eq(reclaimConsentStates.tenantId, ctx.tenant.id),
    eq(reclaimConsentStates.oid, ctx.user.oid),
    gt(reclaimConsentStates.createdAt, new Date(Date.now() - STATE_TTL_MS)),
  );
  const state = await db.query.reclaimConsentStates.findFirst({ where });
  if (!state) return back("invalid_state");
  if (params.get("error")) {
    await db.delete(reclaimConsentStates).where(where);
    return back("consent_declined");
  }
  if (
    params.get("admin_consent") !== "True" ||
    !tid ||
    !GUID.test(tid) ||
    tid.toLowerCase() !== state.tid.toLowerCase() ||
    tid.toLowerCase() !== ctx.tenant.tid?.toLowerCase()
  )
    return back("wrong_tenant");

  // The query string is forgeable: only a token holding the permission for
  // this tenant proves consent.
  const now = new Date();
  try {
    await verifyReclaimCredential({ mode: "managed", tid: state.tid });
  } catch (err) {
    const code = err instanceof ReclaimError ? err.code : "unavailable";
    // Keep the unverified row so "Verify consent" can finish it later, and
    // record why, so the page can explain.
    await db
      .update(reclaimConnections)
      .set({ lastVerifyError: code })
      .where(
        and(
          eq(reclaimConnections.id, state.connectionId),
          eq(reclaimConnections.tenantId, ctx.tenant.id),
        ),
      );
    return back(code);
  }
  const accepted = await db.transaction(async (tx) => {
    // Consume first, atomically: a replaced connection has a new id, so an
    // old callback cannot resurrect it.
    const [used] = await tx
      .delete(reclaimConsentStates)
      .where(where)
      .returning();
    if (!used) return false;
    const [connected] = await tx
      .update(reclaimConnections)
      .set({ consentedAt: now, lastVerifiedAt: now, lastVerifyError: null })
      .where(
        and(
          eq(reclaimConnections.id, state.connectionId),
          eq(reclaimConnections.tenantId, ctx.tenant.id),
          eq(reclaimConnections.tid, state.tid),
          eq(reclaimConnections.mode, "managed"),
        ),
      )
      .returning();
    return Boolean(connected);
  });
  if (!accepted) return back("invalid_state");
  await audit(ctx, "reclaim_connected", { mode: "managed" });
  return back();
}
