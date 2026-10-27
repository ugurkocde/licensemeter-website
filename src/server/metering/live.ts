import { parseMeteringOutput, type MeteringPayload } from "~/lib/metering";
import { buildCatalog, type CatalogEntry } from "./catalog";
import {
  meteringClient,
  MeteringError,
  type MeteringDevice,
  type MeteringRunState,
  type MeteringSource,
} from "./graph";

export interface MeteringRow {
  deviceId: string;
  deviceName: string;
  status: string;
  reportedAt: Date | null;
  payload: MeteringPayload | null;
}
export interface MeteringReport {
  rows: MeteringRow[];
  catalog: CatalogEntry[];
  /** Lower-case device ids with the app installed, by Intune app id. */
  installs: Record<string, string[]>;
  readAt: Date;
}
export interface MeteringReadTarget {
  id: string;
  tid: string;
  revision: number;
  scriptId: string | null;
  excludedApps: string[];
  programOverrides: Record<string, string[]>;
}

/** Validated, sorted rows for every Windows device; nothing here is persisted. */
export function meteringRows(
  devices: MeteringDevice[],
  states: MeteringRunState[],
  now = new Date(),
): MeteringRow[] {
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
  return [...uniqueDevices.values()]
    .map((device) => {
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
        deviceId: device.id.toLowerCase(),
        deviceName: device.deviceName,
        reportedAt,
        status: !state
          ? "no_report"
          : !success
            ? "script_error"
            : !payload
              ? "invalid_output"
              : payload.h,
        payload,
      };
    })
    .sort(
      (a, b) =>
        a.deviceName.localeCompare(b.deviceName) ||
        a.deviceId.localeCompare(b.deviceId),
    );
}

export async function collectCatalog(
  source: MeteringSource,
  target: Pick<MeteringReadTarget, "excludedApps" | "programOverrides">,
): Promise<CatalogEntry[]> {
  return buildCatalog(await source.apps(), target);
}

export async function collectMetering(
  source: MeteringSource,
  target: MeteringReadTarget,
  now = new Date(),
): Promise<Omit<MeteringReport, "readAt">> {
  const scriptId = target.scriptId;
  if (!scriptId) throw new MeteringError("missing");
  const [devices, states, catalog] = await Promise.all([
    source.devices(),
    source.states(scriptId),
    collectCatalog(source, target),
  ]);
  // Graph can return 200 with no run states after the package is gone.
  if (
    !states.length &&
    !(await source.packages()).some(
      (pkg) => pkg.id.toLowerCase() === scriptId.toLowerCase(),
    )
  )
    throw new MeteringError("missing");
  const appIds = [
    ...new Set(
      catalog.filter((entry) => !entry.excluded).map((entry) => entry.appId),
    ),
  ];
  return {
    rows: meteringRows(devices, states, now),
    catalog,
    installs: appIds.length ? await source.installs(appIds) : {},
  };
}

/**
 * Short-lived process memory only, so paging and searching do not repeat
 * every Graph read. Keyed by the settings generation: changing the package,
 * the app list or disabling metering never serves an older read.
 */
const CACHE_MS = 300_000;
// On globalThis: route handlers and pages are separate bundles in one process,
// so a refresh must fill the same cache the page reads.
type CacheEntry = { at: number; value: Promise<unknown> };
const shared = globalThis as { meteringReadCache?: Map<string, CacheEntry> };
const cache: Map<string, CacheEntry> = (shared.meteringReadCache ??= new Map<
  string,
  CacheEntry
>());

function cached<T>(
  key: string,
  fresh: boolean | undefined,
  load: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  for (const [name, entry] of cache)
    if (now - entry.at > CACHE_MS) cache.delete(name);
  const hit = cache.get(key);
  if (hit && !fresh) return hit.value as Promise<T>;
  const value = load();
  cache.set(key, { at: now, value });
  // A failed read is never reused.
  value.catch(() => {
    if (cache.get(key)?.value === value) cache.delete(key);
  });
  return value;
}

const generation = (target: MeteringReadTarget) =>
  `${target.id}:${target.revision}:${target.scriptId?.toLowerCase() ?? "-"}`;

export function readMetering(
  target: MeteringReadTarget,
  options: { source?: MeteringSource; deadline?: number; fresh?: boolean } = {},
): Promise<MeteringReport> {
  return cached(`${generation(target)}:report`, options.fresh, async () => {
    const source =
      options.source ?? (await meteringClient(target.tid, options.deadline));
    const readAt = new Date();
    return { ...(await collectMetering(source, target, readAt)), readAt };
  });
}

/** The current Intune app list only, for setup and collector downloads. */
export function readCatalog(
  target: MeteringReadTarget,
  options: { source?: MeteringSource; deadline?: number; fresh?: boolean } = {},
): Promise<CatalogEntry[]> {
  return cached(`${generation(target)}:catalog`, options.fresh, async () =>
    collectCatalog(
      options.source ?? (await meteringClient(target.tid, options.deadline)),
      target,
    ),
  );
}

/** Drop cached reads for a connection when it is reconfigured or disabled. */
export function forgetMetering(connectionId: string): void {
  for (const key of cache.keys())
    if (key.startsWith(`${connectionId}:`)) cache.delete(key);
}
