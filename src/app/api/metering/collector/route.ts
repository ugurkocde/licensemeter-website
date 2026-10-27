import { and, eq } from "drizzle-orm";
import { apiAccess } from "~/server/access";
import { audit } from "~/server/audit";
import { db } from "~/server/db";
import { meteringConnections } from "~/server/db/schema";
import { hasFeature } from "~/server/entitlement";
import {
  catalogId,
  catalogPrograms,
  collectorScript,
} from "~/server/metering/catalog";
import { meteringErrorText } from "~/server/metering/graph";
import { readCatalog } from "~/server/metering/live";
import { rateLimitDurable } from "~/server/rateLimit";
import { requestDeadline } from "~/server/sync/deadline";

export const maxDuration = 300;
const fail = (message: string, status: number) =>
  new Response(message, { status });

/**
 * The collector for this workspace: every assigned Windows app with a known
 * program file, minus exclusions. Its program list is kept as a setting so
 * device results can be read against the version each device runs.
 */
export async function GET() {
  const ctx = await apiAccess("admin");
  if (!ctx || ctx.tenant.isDemo) return fail("Not allowed", 403);
  if (!hasFeature(ctx.entitlement, "metering"))
    return fail("Software Metering is included in the Pro plan.", 402);
  const connection = await db.query.meteringConnections.findFirst({
    where: eq(meteringConnections.tenantId, ctx.tenant.id),
  });
  if (
    !connection?.consentedAt ||
    connection.tid.toLowerCase() !== ctx.tenant.tid?.toLowerCase()
  )
    return fail("Grant metering permissions first.", 409);
  if (
    !(await rateLimitDurable(
      `metering-collector:${ctx.tenant.id}`,
      10,
      600_000,
    ))
  )
    return fail("Please retry shortly.", 429);
  let programs: string[];
  try {
    programs = catalogPrograms(
      await readCatalog(connection, { deadline: requestDeadline() }),
    );
  } catch (err) {
    return fail(meteringErrorText(err), 502);
  }
  if (!programs.length)
    return fail(
      "No assigned Windows app in Intune has a known program file yet. Add program files on the Software Metering page.",
      409,
    );
  const id = catalogId(programs);
  const versions = [
    { id, programs, at: new Date().toISOString() },
    ...connection.collectors.filter((version) => version.id !== id),
  ].slice(0, 10);
  await db
    .update(meteringConnections)
    .set({ collectors: versions })
    .where(
      and(
        eq(meteringConnections.tenantId, ctx.tenant.id),
        eq(meteringConnections.id, connection.id),
      ),
    );
  await audit(ctx, "metering_collector_downloaded", {
    programs: programs.length,
  });
  return new Response(await collectorScript(programs), {
    headers: {
      "Content-Type": "text/plain; charset=us-ascii",
      "Content-Disposition":
        'attachment; filename="Collect-LicenseMeterUsage.ps1"',
      "Cache-Control": "no-store",
    },
  });
}
