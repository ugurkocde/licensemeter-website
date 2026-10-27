import { eq } from "drizzle-orm";
import type { AccessContext } from "~/server/access";
import { hasRole } from "~/server/access";
import { db } from "~/server/db";
import { meteringConnections } from "~/server/db/schema";
import { hasFeature } from "~/server/entitlement";
import { meteringDemo } from "./demo";
import { meteringConfigured, meteringErrorText } from "./graph";
import { readMetering, type MeteringReport } from "./live";
import {
  summarize,
  type CollectorVersion,
  type MeteringSummary,
} from "./summary";
import { requestDeadline } from "~/server/sync/deadline";

export type SetupStep =
  | "connect"
  | "deploy"
  /** Several packages run the collector and none is chosen. */
  | "choose"
  | "waiting"
  | "done"
  /** Intune could not be read; the step is unknown, never "deploy again". */
  | "unavailable";

/** Everything the three metering pages need, from one cached live read. */
export async function loadMetering(ctx: AccessContext) {
  const connection =
    (await db.query.meteringConnections.findFirst({
      where: eq(meteringConnections.tenantId, ctx.tenant.id),
    })) ?? null;
  const demo = ctx.tenant.isDemo;
  const allowed = hasFeature(ctx.entitlement, "metering");
  const linked = Boolean(
    !demo &&
    allowed &&
    connection?.consentedAt &&
    connection.tid.toLowerCase() === ctx.tenant.tid?.toLowerCase(),
  );
  let report: MeteringReport | null = null;
  let versions: CollectorVersion[] = connection?.collectors ?? [];
  let readError: string | null = null;
  if (demo && allowed) {
    const sample = meteringDemo();
    report = sample.report;
    versions = sample.collectors;
  } else if (linked && connection)
    try {
      report = await readMetering(connection, { deadline: requestDeadline() });
    } catch (err) {
      readError = meteringErrorText(err);
    }
  const days = connection?.inactivityDays ?? 60;
  const summary: MeteringSummary | null = report
    ? summarize(report, versions, days)
    : null;
  const step: SetupStep = demo
    ? "done"
    : !linked
      ? "connect"
      : !report
        ? "unavailable"
        : !report.collector
          ? report.collectors.length > 1
            ? "choose"
            : "deploy"
          : summary && summary.reporting > 0
            ? "done"
            : "waiting";
  return {
    connection,
    demo,
    allowed,
    admin: hasRole(ctx, "admin"),
    configured: meteringConfigured(),
    microsoftConnected: Boolean(ctx.tenant.tid && ctx.tenant.consentedAt),
    report,
    versions,
    summary,
    readError,
    days,
    step,
  };
}
export type MeteringView = Awaited<ReturnType<typeof loadMetering>>;
