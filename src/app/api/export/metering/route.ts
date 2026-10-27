import { eq } from "drizzle-orm";
import { SIGNAL_LABELS } from "~/lib/metering";
import { apiAccess } from "~/server/access";
import { audit } from "~/server/audit";
import { csvResponse, toCsv } from "~/server/csv";
import { db } from "~/server/db";
import { meteringConnections } from "~/server/db/schema";
import { hasFeature } from "~/server/entitlement";
import { meteringErrorText } from "~/server/metering/graph";
import { readMetering } from "~/server/metering/live";
import { deviceApps } from "~/server/metering/summary";
import { rateLimitDurable } from "~/server/rateLimit";
import { requestDeadline } from "~/server/sync/deadline";

export const maxDuration = 300;

/** Device and app pairs where the app is installed or was started; ?app= narrows to one app. */
export async function GET(req: Request) {
  const ctx = await apiAccess("viewer");
  if (!ctx || ctx.tenant.isDemo)
    return new Response("Not allowed", { status: 403 });
  if (!hasFeature(ctx.entitlement, "metering"))
    return new Response("Software Metering is included in the Pro plan.", {
      status: 402,
    });
  const connection = await db.query.meteringConnections.findFirst({
    where: eq(meteringConnections.tenantId, ctx.tenant.id),
  });
  if (
    !connection?.consentedAt ||
    connection.tid.toLowerCase() !== ctx.tenant.tid?.toLowerCase()
  )
    return new Response("Metering is not configured", { status: 409 });
  if (
    !(await rateLimitDurable(`metering-export:${ctx.tenant.id}`, 10, 600_000))
  )
    return new Response("Please retry shortly.", { status: 429 });
  // Read live from Intune for this download only; nothing is stored.
  let report;
  try {
    report = await readMetering(connection, { deadline: requestDeadline() });
  } catch (err) {
    return new Response(meteringErrorText(err), { status: 502 });
  }
  const only = new URL(req.url).searchParams.get("app")?.toLowerCase();
  const entries = report.catalog.filter(
    (entry) => !entry.excluded && (!only || entry.id === only),
  );
  const rows: (string | number | null | undefined)[][] = [];
  for (const entry of entries)
    for (const item of deviceApps(
      report,
      entry,
      connection.collectors,
      connection.inactivityDays,
    )) {
      if (!item.installed && item.signal !== "started") continue;
      rows.push([
        item.row.deviceName,
        entry.name,
        entry.programs.join(" "),
        item.installed ? "Yes" : "No",
        SIGNAL_LABELS[item.signal],
        item.last?.toISOString(),
        item.row.payload ? item.starts : null,
        item.row.payload?.s,
        item.row.payload?.e,
        connection.inactivityDays,
        item.row.status,
        report.readAt.toISOString(),
      ]);
      if (rows.length > 100_000)
        return new Response("Export exceeds the supported size", {
          status: 413,
        });
    }
  const csv = toCsv([
    [
      "Device",
      "Application",
      "Program files",
      "Installed (Intune)",
      "Evidence",
      "Last start (UTC)",
      "Starts in last 24 hours",
      "Coverage begins (UTC)",
      "Report date (UTC)",
      "Observation days",
      "Collector status",
      "Read from Intune (UTC)",
    ],
    ...rows,
  ]);
  await audit(ctx, "export_metering_csv", { rows: rows.length });
  return csvResponse("licensemeter-software-metering.csv", csv);
}
