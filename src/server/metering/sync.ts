import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { METERING_RETENTION_DAYS, parseMeteringOutput } from "~/lib/metering";
import { db } from "~/server/db";
import {
  meteringConnections,
  meteringDevices,
  meteringHistory,
  tenants,
} from "~/server/db/schema";
import {
  meteringClient,
  meteringErrorText,
  MeteringError,
  type MeteringSource,
  type MeteringRunState,
} from "./graph";

export async function syncMetering(
  tenantId: string,
  options: { source?: MeteringSource; deadline?: number } = {},
): Promise<{ status: "ok" | "skipped" | "failed"; count: number }> {
  const connection = await db.query.meteringConnections.findFirst({
    where: eq(meteringConnections.tenantId, tenantId),
  });
  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
  });
  if (
    !connection?.consentedAt ||
    !connection.scriptId ||
    tenant?.isDemo ||
    tenant?.tid?.toLowerCase() !== connection.tid.toLowerCase()
  )
    return { status: "skipped", count: 0 };
  const lock = crypto.randomUUID();
  const [claimed] = await db
    .update(meteringConnections)
    .set({ syncLock: lock, syncStartedAt: new Date() })
    .where(
      and(
        eq(meteringConnections.id, connection.id),
        eq(meteringConnections.revision, connection.revision),
        or(
          isNull(meteringConnections.syncLock),
          lt(meteringConnections.syncStartedAt, new Date(Date.now() - 600_000)),
        ),
      ),
    )
    .returning();
  if (!claimed) return { status: "skipped", count: 0 };
  const current = and(
    eq(meteringConnections.id, connection.id),
    eq(meteringConnections.revision, connection.revision),
    eq(meteringConnections.syncLock, lock),
  );
  try {
    const source =
      options.source ??
      (await meteringClient(connection.tid, options.deadline));
    const devices = await source.devices();
    const states = await source.states(connection.scriptId);
    // Graph can return 200 with no run states even after the package is gone.
    // Confirm an empty collection before replacing prior observations.
    if (!states.length) {
      const packages = await source.packages();
      if (
        !packages.some(
          (pkg) => pkg.id.toLowerCase() === connection.scriptId!.toLowerCase(),
        )
      )
        throw new MeteringError("missing");
    }
    const now = new Date();
    // Conflicting duplicate results are ambiguous, never pick one by page order.
    const byDevice = new Map<string, MeteringRunState | null>();
    for (const state of states) {
      if (!state.managedDevice) continue;
      const id = state.managedDevice.id.toLowerCase();
      byDevice.set(id, byDevice.has(id) ? null : state);
    }
    const uniqueDevices = new Map(
      devices.map((device) => [device.id.toLowerCase(), device]),
    );
    const rows = [...uniqueDevices.values()].map((device) => {
      const state = byDevice.get(device.id.toLowerCase());
      const date = state?.lastStateUpdateDateTime
        ? new Date(state.lastStateUpdateDateTime)
        : null;
      const reportedAt = date && Number.isFinite(date.getTime()) ? date : null;
      const success =
        state?.detectionState === "success" &&
        !state.preRemediationDetectionScriptError;
      const payload =
        success && reportedAt
          ? parseMeteringOutput(
              state.preRemediationDetectionScriptOutput ?? "",
              reportedAt,
              now,
            )
          : null;
      return {
        tenantId,
        connectionId: connection.id,
        deviceId: device.id,
        deviceName: device.deviceName,
        receivedAt: now,
        reportedAt,
        status: !state
          ? "no_report"
          : !success
            ? "script_error"
            : !payload
              ? "invalid_output"
              : payload.health,
        payload,
      };
    });
    await db.transaction(async (tx) => {
      // Lock and re-check consent/configuration after the network work. Disable wins
      // by deleting this row; its FK cascades prevent late writes resurrecting data.
      const [live] = await tx
        .update(meteringConnections)
        .set({
          lastSyncAt: now,
          lastError: null,
          syncLock: null,
          syncStartedAt: null,
        })
        .where(current)
        .returning();
      if (!live) throw new MeteringError("changed");
      await tx
        .delete(meteringDevices)
        .where(eq(meteringDevices.tenantId, tenantId));
      for (let i = 0; i < rows.length; i += 250)
        await tx.insert(meteringDevices).values(rows.slice(i, i + 250));
      const history = rows
        .filter((row) => row.payload)
        .map((row) => ({
          tenantId,
          connectionId: connection.id,
          deviceId: row.deviceId,
          day: new Date(row.payload!.end).toISOString().slice(0, 10),
          payload: row.payload!,
        }));
      for (let i = 0; i < history.length; i += 250)
        await tx
          .insert(meteringHistory)
          .values(history.slice(i, i + 250))
          .onConflictDoUpdate({
            target: [
              meteringHistory.tenantId,
              meteringHistory.deviceId,
              meteringHistory.day,
            ],
            set: { payload: sql`excluded.payload` },
          });
      await tx
        .delete(meteringHistory)
        .where(
          and(
            eq(meteringHistory.tenantId, tenantId),
            lt(
              meteringHistory.day,
              new Date(now.getTime() - METERING_RETENTION_DAYS * 86_400_000)
                .toISOString()
                .slice(0, 10),
            ),
          ),
        );
    });
    return { status: "ok", count: rows.filter((row) => row.payload).length };
  } catch (err) {
    await db
      .update(meteringConnections)
      .set({
        lastError: meteringErrorText(err),
        syncLock: null,
        syncStartedAt: null,
      })
      .where(current);
    return { status: "failed", count: 0 };
  }
}
