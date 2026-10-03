import { eq } from "drizzle-orm";
import { METERED_APPS, meteringSignal, SIGNAL_LABELS } from "~/lib/metering";
import { apiAccess } from "~/server/access";
import { audit } from "~/server/audit";
import { csvResponse, toCsv } from "~/server/csv";
import { db } from "~/server/db";
import { meteringConnections, meteringDevices } from "~/server/db/schema";

export async function GET(req: Request) {
  const ctx = await apiAccess("viewer");
  if (!ctx || ctx.tenant.isDemo)
    return new Response("Not allowed", { status: 403 });
  const app =
    METERED_APPS.find(
      (item) => item.id === new URL(req.url).searchParams.get("app"),
    ) ?? METERED_APPS[0];
  const connection = await db.query.meteringConnections.findFirst({
    where: eq(meteringConnections.tenantId, ctx.tenant.id),
  });
  if (!connection) return new Response("Metering is disabled", { status: 409 });
  const rows = await db.query.meteringDevices.findMany({
    where: eq(meteringDevices.tenantId, ctx.tenant.id),
    limit: 50_001,
  });
  if (rows.length > 50_000)
    return new Response("Export exceeds the supported device limit", {
      status: 413,
    });
  const csv = toCsv([
    [
      "Device",
      "Application",
      "Executable",
      "Last observed launch (UTC)",
      "Coverage begins (UTC)",
      "Report date (UTC)",
      "Observation days",
      "Evidence",
      "Collector status",
      "Refresh error",
    ],
    ...rows.map((row) => [
      row.deviceName,
      app.name,
      app.executable,
      row.payload?.apps.find(([id]) => id === app.id)?.[1],
      row.payload?.start,
      row.payload?.end,
      connection.inactivityDays,
      SIGNAL_LABELS[
        connection.lastError
          ? "unknown"
          : meteringSignal(row.payload, app.id, connection.inactivityDays)
      ],
      row.status,
      connection.lastError ? "Refresh failed; evidence requires review" : "",
    ]),
  ]);
  await audit(ctx, "export_metering_csv", { rows: rows.length });
  return csvResponse(`licensemeter-metering-${app.id}.csv`, csv);
}
