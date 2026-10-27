import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { GUID, METERING_MAX_PROGRAMS, PROGRAM } from "~/lib/metering";
import { apiAccess } from "~/server/access";
import { audit } from "~/server/audit";
import { isSameOrigin } from "~/server/auth/origin";
import { db } from "~/server/db";
import { hasFeature } from "~/server/entitlement";
import { meteringConnections } from "~/server/db/schema";
import {
  meteringClient,
  meteringConfigured,
  meteringErrorText,
  MeteringError,
  verifyMeteringConsent,
} from "~/server/metering/graph";
import { forgetMetering, readMetering } from "~/server/metering/live";
import { rateLimitDurable } from "~/server/rateLimit";
import { requestDeadline } from "~/server/sync/deadline";

export const maxDuration = 300;
const fail = (error: string, status = 400) =>
  NextResponse.json({ error }, { status });
const PLAN_REQUIRED = "Software Metering is included in the Pro plan.";
/** An Intune app id, or a Microsoft 365 Apps product inside one. */
const ENTRY_ID = z
  .string()
  .toLowerCase()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(:visio|:project)?$/,
  );
const command = z.discriminatedUnion("action", [
  z.object({ action: z.literal("enable") }),
  z.object({ action: z.literal("disable") }),
  z.object({ action: z.literal("refresh") }),
  z.object({ action: z.literal("verify") }),
  z.object({
    action: z.literal("configure"),
    // Only needed when several packages run the collector.
    scriptId: z.string().regex(GUID).optional(),
    inactivityDays: z.union([z.literal(30), z.literal(60), z.literal(90)]),
  }),
  z.object({
    action: z.literal("apps"),
    excluded: z.array(ENTRY_ID).max(2000),
    overrides: z
      .record(
        ENTRY_ID,
        z.array(z.string().trim().toLowerCase().regex(PROGRAM)).max(10),
      )
      .refine((value) => Object.keys(value).length <= 2000),
  }),
]);

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return fail("Not allowed", 403);
  const ctx = await apiAccess("admin");
  if (!ctx || ctx.tenant.isDemo) return fail("Not allowed", 403);
  const raw = await req.text();
  // Only the app list may be large: up to 2000 exclusions and override lists.
  if (raw.length > 262_144) return fail("Request too large", 413);
  let parsed;
  try {
    parsed = command.safeParse(JSON.parse(raw));
  } catch {
    return fail("Invalid request");
  }
  if (!parsed.success) return fail("Check your metering settings.");
  const data = parsed.data;
  if (data.action !== "apps" && raw.length > 4096)
    return fail("Request too large", 413);
  // Disabling stays possible after a downgrade; everything else needs the plan.
  if (data.action !== "disable" && !hasFeature(ctx.entitlement, "metering"))
    return fail(PLAN_REQUIRED, 402);
  const where = eq(meteringConnections.tenantId, ctx.tenant.id);
  if (data.action === "disable") {
    // Cascades include pending consent. Device results are never stored, so
    // only the short-lived read cache remains to clear.
    const [removed] = await db
      .delete(meteringConnections)
      .where(where)
      .returning({ id: meteringConnections.id });
    if (removed) forgetMetering(removed.id);
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
        let script: { id: string; name: string } | undefined;
        if (data.scriptId) {
          const collectors = await (
            await meteringClient(connection.tid)
          ).collectors();
          script = collectors.find(
            (entry) => entry.id === data.scriptId!.toLowerCase(),
          );
          if (!script)
            return fail(
              "Choose a package that runs the LicenseMeter collector.",
            );
        }
        const [updated] = await db
          .update(meteringConnections)
          .set({
            ...(script ? { scriptId: script.id, scriptName: script.name } : {}),
            inactivityDays: data.inactivityDays,
            revision: sql`${meteringConnections.revision} + 1`,
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
        forgetMetering(connection.id);
        await audit(ctx, "threshold_changed", {
          provider: "windows_metering",
          days: data.inactivityDays,
        });
      } else if (data.action === "apps") {
        const overrides = Object.fromEntries(
          Object.entries(data.overrides)
            .map(
              ([id, programs]) =>
                [id, [...new Set(programs)]] as [string, string[]],
            )
            .filter(([, programs]) => programs.length),
        );
        if (
          new Set(Object.values(overrides).flat()).size > METERING_MAX_PROGRAMS
        )
          return fail("Too many program files.");
        const [updated] = await db
          .update(meteringConnections)
          .set({
            excludedApps: [...new Set(data.excluded)],
            programOverrides: overrides,
            revision: sql`${meteringConnections.revision} + 1`,
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
        forgetMetering(connection.id);
        await audit(ctx, "metering_apps_changed", {
          excluded: data.excluded.length,
          overrides: Object.keys(overrides).length,
        });
      } else {
        // A fresh live read replaces the cached one; nothing is written.
        await readMetering(connection, {
          deadline: requestDeadline(),
          fresh: true,
        });
        await audit(ctx, "sync_triggered", { provider: "windows_metering" });
      }
    } catch (err) {
      return fail(meteringErrorText(err), 502);
    }
  }
  revalidatePath("/app/metering");
  return NextResponse.json({ ok: true });
}
