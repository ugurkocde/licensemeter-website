import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { GUID } from "~/lib/metering";
import { apiAccess } from "~/server/access";
import { audit } from "~/server/audit";
import { isSameOrigin } from "~/server/auth/origin";
import { db } from "~/server/db";
import {
  meteringConnections,
  meteringDevices,
  meteringHistory,
} from "~/server/db/schema";
import {
  meteringClient,
  meteringConfigured,
  meteringErrorText,
  MeteringError,
  verifyMeteringConsent,
} from "~/server/metering/graph";
import { syncMetering } from "~/server/metering/sync";
import { rateLimitDurable } from "~/server/rateLimit";
import { requestDeadline } from "~/server/sync/deadline";

export const maxDuration = 300;
const fail = (error: string, status = 400) =>
  NextResponse.json({ error }, { status });
const command = z.discriminatedUnion("action", [
  z.object({ action: z.literal("enable") }),
  z.object({ action: z.literal("disable") }),
  z.object({ action: z.literal("sync") }),
  z.object({ action: z.literal("verify") }),
  z.object({
    action: z.literal("configure"),
    scriptId: z.string().regex(GUID),
    inactivityDays: z.union([z.literal(30), z.literal(60), z.literal(90)]),
  }),
]);

/** Only a consenting, opted-in workspace can even list remediation packages. */
export async function GET() {
  const ctx = await apiAccess("admin");
  if (!ctx || ctx.tenant.isDemo) return fail("Not allowed", 403);
  const connection = await db.query.meteringConnections.findFirst({
    where: eq(meteringConnections.tenantId, ctx.tenant.id),
  });
  if (
    !connection?.consentedAt ||
    ctx.tenant.tid?.toLowerCase() !== connection.tid.toLowerCase()
  )
    return fail("Enable metering and grant its permissions first.", 409);
  if (
    !(await rateLimitDurable(`metering-packages:${ctx.tenant.id}`, 10, 60_000))
  )
    return fail("Please retry shortly.", 429);
  try {
    return NextResponse.json({
      packages: await (await meteringClient(connection.tid)).packages(),
    });
  } catch (err) {
    return fail(meteringErrorText(err), 502);
  }
}

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return fail("Not allowed", 403);
  const ctx = await apiAccess("admin");
  if (!ctx || ctx.tenant.isDemo) return fail("Not allowed", 403);
  const raw = await req.text();
  if (raw.length > 4096) return fail("Request too large", 413);
  let parsed;
  try {
    parsed = command.safeParse(JSON.parse(raw));
  } catch {
    return fail("Invalid request");
  }
  if (!parsed.success) return fail("Check your metering settings.");
  const data = parsed.data;
  const where = eq(meteringConnections.tenantId, ctx.tenant.id);
  if (data.action === "disable") {
    // Cascades include pending consent, observations and history. An in-flight
    // sync checks this connection's generation before committing anything.
    await db.delete(meteringConnections).where(where);
    await audit(ctx, "connector_disconnected", {
      provider: "windows_metering",
    });
  } else if (data.action === "enable") {
    if (
      !ctx.tenant.tid ||
      !GUID.test(ctx.tenant.tid) ||
      !ctx.tenant.consentedAt
    )
      return fail("Connect Microsoft 365 before enabling metering.", 409);
    if (!meteringConfigured())
      return fail(
        "Ask the operator to configure the separate Software Metering application.",
        503,
      );
    const existing = await db.query.meteringConnections.findFirst({ where });
    if (existing && existing.tid.toLowerCase() !== ctx.tenant.tid.toLowerCase())
      return fail(
        "Disable the previous metering connection before enabling it for this tenant.",
        409,
      );
    await db
      .insert(meteringConnections)
      .values({ tenantId: ctx.tenant.id, tid: ctx.tenant.tid })
      .onConflictDoNothing();
    await audit(ctx, "connector_connected", {
      provider: "windows_metering",
      stage: "enabled_without_consent",
    });
  } else {
    const connection = await db.query.meteringConnections.findFirst({ where });
    if (
      !connection ||
      connection.tid.toLowerCase() !== ctx.tenant.tid?.toLowerCase()
    )
      return fail("Enable metering for the connected tenant first.", 409);
    if (data.action !== "verify" && !connection.consentedAt)
      return fail("Grant metering permissions first.", 409);
    if (
      !(await rateLimitDurable(`metering-update:${ctx.tenant.id}`, 6, 600_000))
    )
      return fail("Please wait before trying again.", 429);
    try {
      if (data.action === "verify") {
        await verifyMeteringConsent(connection.tid);
        const [verified] = await db
          .update(meteringConnections)
          .set({ consentedAt: new Date() })
          .where(and(where, eq(meteringConnections.id, connection.id)))
          .returning();
        if (!verified) throw new MeteringError("changed");
        await audit(ctx, "connector_connected", {
          provider: "windows_metering",
          stage: "consent_verified",
        });
      } else if (data.action === "configure") {
        const packages = await (
          await meteringClient(connection.tid)
        ).packages();
        const script = packages.find((entry) => entry.id === data.scriptId);
        if (!script) return fail("Choose an available remediation package.");
        await db.transaction(async (tx) => {
          const [updated] = await tx
            .update(meteringConnections)
            .set({
              scriptId: script.id,
              scriptName: script.displayName,
              inactivityDays: data.inactivityDays,
              revision: sql`${meteringConnections.revision} + 1`,
              syncLock: null,
              syncStartedAt: null,
              ...(script.id !== connection.scriptId
                ? { lastSyncAt: null, lastError: null }
                : {}),
            })
            .where(
              and(
                where,
                eq(meteringConnections.id, connection.id),
                eq(meteringConnections.revision, connection.revision),
              ),
            )
            .returning();
          if (!updated) throw new MeteringError("changed");
          if (script.id !== connection.scriptId) {
            await tx
              .delete(meteringDevices)
              .where(eq(meteringDevices.tenantId, ctx.tenant.id));
            await tx
              .delete(meteringHistory)
              .where(eq(meteringHistory.tenantId, ctx.tenant.id));
          }
        });
        await audit(ctx, "threshold_changed", {
          provider: "windows_metering",
          days: data.inactivityDays,
        });
      } else {
        if (!connection.scriptId)
          return fail("Select a remediation package first.", 409);
        const result = await syncMetering(ctx.tenant.id, {
          deadline: requestDeadline(),
        });
        revalidatePath("/app/metering");
        if (result.status !== "ok")
          return fail(
            result.status === "skipped"
              ? "A refresh is already running or the configuration changed. Try again shortly."
              : "Metering could not refresh. Check the connection message on this page.",
            result.status === "skipped" ? 409 : 502,
          );
        await audit(ctx, "sync_triggered", { provider: "windows_metering" });
      }
    } catch (err) {
      return fail(meteringErrorText(err), 502);
    }
  }
  revalidatePath("/app/metering");
  return NextResponse.json({ ok: true });
}
