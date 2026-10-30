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
import { COLLECTOR_RELEASE } from "~/server/metering/catalog";
import { generateCollector } from "~/server/metering/collector";
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
  // Write in Intune, only for LicenseMeter's own collector package.
  z.object({
    action: z.literal("deploy"),
    assign: z.enum(["all", "none"]),
  }),
  z.object({ action: z.literal("update") }),
  // One app's settings from the Apps page; optionally pushed to Intune at once.
  z.object({
    action: z.literal("app"),
    id: ENTRY_ID,
    // Omitted: keep as is. Empty: back to automatic. Otherwise: admin entry.
    programs: z
      .array(z.string().trim().toLowerCase().regex(PROGRAM))
      .max(10)
      .optional(),
    excluded: z.boolean(),
    updateIntune: z.boolean(),
  }),
  z.object({ action: z.literal("verify") }),
  z.object({
    action: z.literal("configure"),
    // Only needed when several packages run the collector.
    scriptId: z.string().regex(GUID).optional(),
    inactivityDays: z.union([z.literal(30), z.literal(60), z.literal(90)]),
  }),
]);

type MeteringConnection = typeof meteringConnections.$inferSelect;

/**
 * After LicenseMeter writes the collector to Intune. forgetMetering only
 * clears this process, and the page can render in another one that still
 * holds the previous read, so a new revision moves every cache to a new key.
 */
async function collectorWritten(connection: MeteringConnection) {
  await db
    .update(meteringConnections)
    .set({ revision: sql`${meteringConnections.revision} + 1` })
    .where(
      and(
        eq(meteringConnections.tenantId, connection.tenantId),
        eq(meteringConnections.id, connection.id),
      ),
    );
  forgetMetering(connection.id);
}

/**
 * After an app setting is saved: writes the new program list to the collector
 * in Intune, or leaves it alone when neither the list nor the collector changed.
 */
async function updateAfterSave(
  ctx: NonNullable<Awaited<ReturnType<typeof apiAccess>>>,
  connection: MeteringConnection,
) {
  const client = await meteringClient(connection.tid, requestDeadline());
  if (!client.canWrite) throw new MeteringError("write");
  const existing = await client.collectors();
  const chosen =
    existing.find((pkg) => pkg.id === connection.scriptId?.toLowerCase()) ??
    (existing.length === 1 ? existing[0] : undefined);
  if (!chosen)
    return fail(
      "Saved. The collector package was not found in Intune; create it in Setup.",
      409,
    );
  const generated = await generateCollector(connection, requestDeadline());
  const changed =
    generated.id !== chosen.catalogId || chosen.release < COLLECTOR_RELEASE;
  if (changed) {
    await client.updateCollector(chosen.id, generated.script);
    await collectorWritten(connection);
    await audit(ctx, "metering_collector_updated", {
      programs: generated.programs.length,
    });
  } else forgetMetering(connection.id);
  revalidatePath("/app/metering", "layout");
  return NextResponse.json({
    ok: true,
    intune: changed ? "updated" : "current",
  });
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
      } else if (data.action === "deploy" || data.action === "update") {
        const client = await meteringClient(connection.tid, requestDeadline());
        if (!client.canWrite) throw new MeteringError("write");
        const existing = await client.collectors();
        const chosen =
          existing.find(
            (pkg) => pkg.id === connection.scriptId?.toLowerCase(),
          ) ?? (existing.length === 1 ? existing[0] : undefined);
        if (data.action === "deploy" && existing.length)
          return fail(
            "The collector already runs in Intune. Update it instead.",
            409,
          );
        if (data.action === "update" && !chosen)
          return fail("Choose the collector package in Setup first.", 409);
        const generated = await generateCollector(
          connection,
          requestDeadline(),
        );
        if (data.action === "deploy") {
          try {
            await client.createCollector(
              generated.script,
              data.assign === "all",
            );
          } finally {
            // The package can exist in Intune even when its assignment failed.
            await collectorWritten(connection);
          }
          await audit(ctx, "metering_collector_created", {
            assigned: data.assign,
            programs: generated.programs.length,
          });
        } else {
          await client.updateCollector(chosen!.id, generated.script);
          await collectorWritten(connection);
          await audit(ctx, "metering_collector_updated", {
            programs: generated.programs.length,
          });
        }
      } else if (data.action === "app") {
        const overrides = { ...connection.programOverrides };
        if (data.programs !== undefined) {
          const programs = [...new Set(data.programs)];
          if (programs.length) overrides[data.id] = programs;
          else delete overrides[data.id];
        }
        if (
          new Set(Object.values(overrides).flat()).size > METERING_MAX_PROGRAMS
        )
          return fail("Too many program files.");
        const excluded = new Set(connection.excludedApps);
        if (data.excluded) excluded.add(data.id);
        else excluded.delete(data.id);
        const [updated] = await db
          .update(meteringConnections)
          .set({
            excludedApps: [...excluded],
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
          excluded: data.excluded ? 1 : 0,
          overrides: data.programs?.length ?? 0,
        });
        if (data.updateIntune) {
          try {
            return await updateAfterSave(ctx, updated);
          } catch (err) {
            return fail(`Saved. ${meteringErrorText(err)}`, 502);
          }
        }
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
  revalidatePath("/app/metering", "layout");
  return NextResponse.json({ ok: true });
}
