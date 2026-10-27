import { eq } from "drizzle-orm";
import { apiAccess } from "~/server/access";
import { audit } from "~/server/audit";
import { db } from "~/server/db";
import { meteringConnections } from "~/server/db/schema";
import { hasFeature } from "~/server/entitlement";
import { generateCollector } from "~/server/metering/collector";
import { MeteringError, meteringErrorText } from "~/server/metering/graph";
import { rateLimitDurable } from "~/server/rateLimit";
import { requestDeadline } from "~/server/sync/deadline";

export const maxDuration = 300;
const fail = (message: string, status: number) =>
  new Response(message, { status });

/** Download of the collector for this workspace's current Intune app list. */
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
  let collector;
  try {
    collector = await generateCollector(connection, requestDeadline());
  } catch (err) {
    return fail(
      meteringErrorText(err),
      err instanceof MeteringError && err.code === "programs" ? 409 : 502,
    );
  }
  await audit(ctx, "metering_collector_downloaded", {
    programs: collector.programs.length,
  });
  return new Response(collector.script, {
    headers: {
      "Content-Type": "text/plain; charset=us-ascii",
      "Content-Disposition":
        'attachment; filename="Collect-LicenseMeterUsage.ps1"',
      "Cache-Control": "no-store",
    },
  });
}
