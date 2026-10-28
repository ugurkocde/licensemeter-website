import { ConfidentialClientApplication } from "@azure/msal-node";
import { z } from "zod";
import { env } from "~/env";
import { GUID, meteringAccess, PROGRAM } from "~/lib/metering";

const GRAPH = "https://graph.microsoft.com/beta";
export const METERING_ERRORS: Record<string, string> = {
  configuration:
    "Software Metering is not configured on this installation. Ask the operator to configure its separate Microsoft application.",
  consent:
    "Metering access could not be verified. Grant the metering permissions, allow a few minutes for consent to propagate, then retry.",
  forbidden:
    "Microsoft denied metering access. Check consent, Intune licensing, and tenant access policies.",
  missing:
    "The selected remediation package is no longer available. Select a package again.",
  timeout:
    "Reading metering results from Intune reached its time limit. Retry later.",
  throttled: "Microsoft temporarily limited requests. Retry later.",
  response: "Microsoft returned an unexpected metering response. Retry later.",
  changed: "Metering settings changed during the request. Try again.",
  programs:
    "No assigned Windows app in Intune has a known program file yet. Add program files on the Apps page.",
  write:
    "LicenseMeter cannot change scripts in Intune yet. Approve the updated metering permissions, or download the collector and add it yourself.",
};
export class MeteringError extends Error {
  constructor(public code: string) {
    super(METERING_ERRORS[code] ?? METERING_ERRORS.response);
  }
}
export const meteringErrorText = (err: unknown): string =>
  err instanceof MeteringError ? err.message : METERING_ERRORS.response!;

export function meteringConfigured(): boolean {
  return Boolean(
    env.METERING_CLIENT_ID &&
    env.METERING_CLIENT_SECRET &&
    env.METERING_CLIENT_ID.toLowerCase() !==
      env.CONNECTOR_CLIENT_ID?.toLowerCase() &&
    env.METERING_CLIENT_ID.toLowerCase() !==
      env.AUTH_MICROSOFT_ENTRA_ID_ID?.toLowerCase(),
  );
}

export const packageSchema = z.object({
  id: z.string().regex(GUID),
  displayName: z.string().max(1024),
});
const deviceSchema = z.object({
  id: z.string().regex(GUID),
  deviceName: z.string().max(1024),
  operatingSystem: z.string(),
});
const stateSchema = z.object({
  id: z.string(),
  detectionState: z.string(),
  lastStateUpdateDateTime: z.string().nullable().optional(),
  preRemediationDetectionScriptOutput: z.string().nullable().optional(),
  preRemediationDetectionScriptError: z.string().nullable().optional(),
  managedDevice: z
    .object({ id: z.string().regex(GUID) })
    .nullable()
    .optional(),
});
/** The app types Intune deploys to Windows. Everything else is ignored. */
export const WINDOWS_APP_TYPES = [
  "win32LobApp",
  "win32CatalogApp",
  "winGetApp",
  "windowsMobileMSI",
  "officeSuiteApp",
  "windowsUniversalAppX",
  "windowsStoreApp",
  "windowsMicrosoftEdgeApp",
] as const;
const appSchema = z.object({
  "@odata.type": z.string(),
  id: z.string().regex(GUID),
  displayName: z.string().max(1024),
  publisher: z.string().max(1024).nullable().optional(),
  rules: z
    .array(
      z.object({
        ruleType: z.string().nullable().optional(),
        fileOrFolderName: z.string().max(1024).nullable().optional(),
      }),
    )
    .nullable()
    .optional(),
  productIds: z.array(z.string()).nullable().optional(),
});
/** Only device and state columns: the report also offers user names, never request them. */
const INSTALL_COLUMNS = [
  "ApplicationId",
  "DeviceId",
  "InstallState",
  "AppInstallState",
];
const INSTALL_BATCH = 20;
const installReportSchema = z.object({
  TotalRowCount: z.number().int().min(0),
  Schema: z.array(z.object({ Column: z.string() })),
  Values: z.array(z.array(z.unknown())),
});
export type MeteringDevice = z.infer<typeof deviceSchema>;
export type MeteringRunState = z.infer<typeof stateSchema>;
export type MeteringPackage = z.infer<typeof packageSchema>;
export interface MeteringApp {
  id: string;
  type: (typeof WINDOWS_APP_TYPES)[number];
  name: string;
  publisher: string;
  /** Program files named by the app's Intune detection rules. */
  detected: string[];
  /** Microsoft 365 Apps products, e.g. visioProRetail. */
  products: string[];
}
/** A Remediations package whose detection script is the LicenseMeter collector. */
export interface CollectorPackage {
  id: string;
  name: string;
  /** Program list version the deployed script reports as "c". */
  catalogId: string;
  programs: string[];
  /** Collector release of the deployed script; 1 before releases were numbered. */
  release: number;
}
export interface MeteringSource {
  /** Whether consent includes write on scripts (create and update the collector). */
  readonly canWrite?: boolean;
  packages(this: void): Promise<MeteringPackage[]>;
  /** Packages running the collector, read from their deployed scripts. */
  collectors(this: void): Promise<CollectorPackage[]>;
  devices(this: void): Promise<MeteringDevice[]>;
  states(this: void, scriptId: string): Promise<MeteringRunState[]>;
  apps(this: void): Promise<MeteringApp[]>;
  /** Lower-case managed device ids with each app installed, by app id. */
  installs(this: void, appIds: string[]): Promise<Record<string, string[]>>;
}

/** Same resource only: a nextLink must never redirect our credential to another host/path. */
export function checkedMeteringUrl(value: string, path: string): string {
  const url = new URL(value, GRAPH + "/");
  if (
    url.origin !== "https://graph.microsoft.com" ||
    url.pathname !== `/beta${path}` ||
    url.username ||
    url.password ||
    url.hash
  )
    throw new MeteringError("response");
  return url.href;
}

const COLLECTOR_MARKER = "LicenseMeter Windows usage collector, protocol 2";
const batchSchema = z.object({
  responses: z
    .array(z.object({ id: z.string(), status: z.number(), body: z.unknown() }))
    .max(20),
});
const scriptSchema = z.object({
  detectionScriptContent: z.string().max(2_000_000).nullable().optional(),
});

/** Reads the program list out of a deployed collector, or null for any other script. */
export function parseCollector(
  base64: string,
): { catalogId: string; programs: string[]; release: number } | null {
  let script: string;
  try {
    script = Buffer.from(base64, "base64").toString("latin1");
  } catch {
    return null;
  }
  if (!script.includes(COLLECTOR_MARKER)) return null;
  const id = /^\$CatalogId = '([0-9a-f]{8})'\r?$/m.exec(script)?.[1];
  // Greedy: program names may contain brackets; quotes delimit each name.
  const list = /^\$Programs = @\((.*)\)\r?$/m.exec(script)?.[1];
  if (!id || list === undefined) return null;
  const programs = [...list.matchAll(/'([^']*)'/g)].map((m) => m[1]!);
  if (!programs.length || programs.some((name) => !PROGRAM.test(name)))
    return null;
  const release = Number(/^\$Release = (\d{1,4})\r?$/m.exec(script)?.[1] ?? 1);
  return { catalogId: id, programs, release };
}

const INSTALL_REPORT =
  "/deviceManagement/reports/retrieveDeviceAppInstallationStatusReport";

export class MeteringGraphClient implements MeteringSource {
  constructor(
    private token: string,
    private deadline = Date.now() + 240_000,
    /** True only when the token holds DeviceManagementScripts.ReadWrite.All. */
    readonly canWrite = false,
  ) {}

  /** One request with bounded retries for throttling and transient errors. */
  private async request(
    url: string,
    body?: unknown,
    method?: "POST" | "PATCH",
  ): Promise<unknown> {
    let response: Response | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      const remaining = this.deadline - Date.now();
      if (remaining <= 0) throw new MeteringError("timeout");
      try {
        response = await fetch(url, {
          method: method ?? (body === undefined ? "GET" : "POST"),
          headers: {
            Authorization: `Bearer ${this.token}`,
            ...(body === undefined
              ? {}
              : { "Content-Type": "application/json" }),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(Math.min(30_000, remaining)),
        });
      } catch {
        throw new MeteringError("timeout");
      }
      if (![429, 502, 503, 504].includes(response.status)) break;
      const retry = response.headers.get("retry-after");
      const delay =
        retry && /^\d+$/.test(retry)
          ? Number(retry) * 1000
          : retry && Number.isFinite(Date.parse(retry))
            ? Math.max(1000, Date.parse(retry) - Date.now())
            : (attempt + 1) * 2000;
      if (
        attempt === 2 ||
        delay > 30_000 ||
        Date.now() + delay >= this.deadline
      )
        throw new MeteringError("throttled");
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    if (!response?.ok)
      throw new MeteringError(
        response?.status === 403
          ? "forbidden"
          : response?.status === 401
            ? "consent"
            : response?.status === 404
              ? "missing"
              : "response",
      );
    if (response.status === 204) return null;
    try {
      return await response.json();
    } catch {
      throw new MeteringError("response");
    }
  }

  private async list<T>(
    path: string,
    query: Record<string, string>,
    schema: z.ZodType<T>,
    firstPageOnly = false,
  ): Promise<T[]> {
    let next: string | undefined =
      `${GRAPH}${path}?${new URLSearchParams(query)}`;
    const rows: T[] = [];
    const visited = new Set<string>();
    while (next) {
      const url: string = checkedMeteringUrl(next, path);
      if (visited.has(url) || visited.size >= 500)
        throw new MeteringError("response");
      visited.add(url);
      const parsed = z
        .object({
          value: z.array(schema),
          "@odata.nextLink": z.string().optional(),
        })
        .safeParse(await this.request(url));
      if (!parsed.success) throw new MeteringError("response");
      rows.push(...parsed.data.value);
      if (rows.length > 50_000) throw new MeteringError("response");
      next = firstPageOnly ? undefined : parsed.data["@odata.nextLink"];
    }
    return rows;
  }
  async probe(): Promise<void> {
    await this.list(
      "/deviceManagement/deviceHealthScripts",
      { $select: "id,displayName", $top: "1" },
      packageSchema,
      true,
    );
    await this.list(
      "/deviceManagement/managedDevices",
      { $select: "id,deviceName,operatingSystem", $top: "1" },
      deviceSchema,
      true,
    );
    await this.list(
      "/deviceAppManagement/mobileApps",
      { $select: "id,displayName", $top: "1" },
      z.object({ id: z.string() }),
      true,
    );
  }
  packages() {
    return this.list(
      "/deviceManagement/deviceHealthScripts",
      { $select: "id,displayName", $top: "100" },
      packageSchema,
    );
  }
  /**
   * Finds the collector by its deployed script, so the admin never picks a
   * package and LicenseMeter knows exactly which program list devices run.
   * Other scripts are only checked for the marker and never kept.
   */
  async collectors(): Promise<CollectorPackage[]> {
    const packages = await this.packages();
    const url = checkedMeteringUrl(GRAPH + "/$batch", "/$batch");
    const found: CollectorPackage[] = [];
    for (let i = 0; i < packages.length; i += 20) {
      const chunk = packages.slice(i, i + 20);
      const parsed = batchSchema.safeParse(
        await this.request(url, {
          requests: chunk.map((pkg, index) => ({
            id: String(index),
            method: "GET",
            url: `/deviceManagement/deviceHealthScripts/${pkg.id}?$select=id,detectionScriptContent`,
          })),
        }),
      );
      if (!parsed.success) throw new MeteringError("response");
      for (const response of parsed.data.responses) {
        const pkg = chunk[Number(response.id)];
        const content = scriptSchema.safeParse(response.body);
        // A package deleted since the list was read is simply gone. Any other
        // failure must not make the collector look absent.
        if (!pkg || response.status === 404) continue;
        if (response.status !== 200 || !content.success)
          throw new MeteringError(
            response.status === 429
              ? "throttled"
              : response.status === 403
                ? "forbidden"
                : response.status === 401
                  ? "consent"
                  : "response",
          );
        const collector = parseCollector(
          content.data.detectionScriptContent ?? "",
        );
        if (collector)
          found.push({
            id: pkg.id.toLowerCase(),
            name: pkg.displayName,
            ...collector,
          });
      }
    }
    return found.sort((a, b) => a.name.localeCompare(b.name));
  }
  /**
   * Creates the collector package as detection-only, SYSTEM, 64-bit. With
   * assignAll it is assigned to all devices hourly; otherwise the Admin
   * assigns it in Intune. Only ever called for LicenseMeter's own script.
   */
  async createCollector(script: string, assignAll: boolean): Promise<string> {
    if (!this.canWrite) throw new MeteringError("write");
    const url = checkedMeteringUrl(
      GRAPH + "/deviceManagement/deviceHealthScripts",
      "/deviceManagement/deviceHealthScripts",
    );
    const created = z.object({ id: z.string().regex(GUID) }).safeParse(
      await this.request(url, {
        "@odata.type": "#microsoft.graph.deviceHealthScript",
        displayName: "LicenseMeter Software Metering collector",
        description:
          "Reports which Intune-deployed Windows apps were started. Generated and managed by LicenseMeter. Detection only; changes nothing on devices.",
        publisher: "LicenseMeter",
        detectionScriptContent: Buffer.from(script).toString("base64"),
        runAsAccount: "system",
        enforceSignatureCheck: false,
        runAs32Bit: false,
      }),
    );
    if (!created.success) throw new MeteringError("response");
    const id = created.data.id.toLowerCase();
    if (assignAll) {
      const path = `/deviceManagement/deviceHealthScripts/${id}/assign`;
      await this.request(checkedMeteringUrl(GRAPH + path, path), {
        deviceHealthScriptAssignments: [
          {
            "@odata.type": "#microsoft.graph.deviceHealthScriptAssignment",
            target: {
              "@odata.type": "#microsoft.graph.allDevicesAssignmentTarget",
            },
            runRemediationScript: false,
            runSchedule: {
              "@odata.type":
                "#microsoft.graph.deviceHealthScriptHourlySchedule",
              interval: 1,
            },
          },
        ],
      });
    }
    return id;
  }
  /** Replaces the detection script of a package already identified as the collector. */
  async updateCollector(id: string, script: string): Promise<void> {
    if (!this.canWrite) throw new MeteringError("write");
    if (!GUID.test(id)) throw new MeteringError("missing");
    if (!(await this.collectors()).some((pkg) => pkg.id === id.toLowerCase()))
      throw new MeteringError("missing");
    const path = `/deviceManagement/deviceHealthScripts/${id}`;
    await this.request(
      checkedMeteringUrl(GRAPH + path, path),
      {
        "@odata.type": "#microsoft.graph.deviceHealthScript",
        detectionScriptContent: Buffer.from(script).toString("base64"),
      },
      "PATCH",
    );
  }
  devices() {
    return this.list(
      "/deviceManagement/managedDevices",
      { $select: "id,deviceName,operatingSystem", $top: "100" },
      deviceSchema,
    ).then((rows) => rows.filter((d) => d.operatingSystem === "Windows"));
  }
  states(scriptId: string) {
    if (!GUID.test(scriptId)) throw new MeteringError("missing");
    return this.list(
      `/deviceManagement/deviceHealthScripts/${scriptId}/deviceRunStates`,
      {
        $select:
          "id,detectionState,lastStateUpdateDateTime,preRemediationDetectionScriptOutput,preRemediationDetectionScriptError",
        $expand: "managedDevice($select=id)",
        $top: "100",
      },
      stateSchema,
    );
  }
  /** Assigned Windows apps. App types differ in fields, so no $select. */
  async apps(): Promise<MeteringApp[]> {
    const rows = await this.list(
      "/deviceAppManagement/mobileApps",
      { $filter: "isAssigned eq true", $top: "100" },
      appSchema,
    );
    return rows.flatMap((row) => {
      const type = row["@odata.type"].replace("#microsoft.graph.", "");
      if (!(WINDOWS_APP_TYPES as readonly string[]).includes(type)) return [];
      return [
        {
          id: row.id.toLowerCase(),
          type: type as MeteringApp["type"],
          name: row.displayName,
          publisher: row.publisher ?? "",
          detected: (row.rules ?? []).flatMap((rule) => {
            const name = (rule.fileOrFolderName ?? "").trim().toLowerCase();
            return rule.ruleType !== "requirement" && name.endsWith(".exe")
              ? [name]
              : [];
          }),
          products: row.productIds ?? [],
        },
      ];
    });
  }
  /**
   * Install status for many apps in few calls: the report accepts OR-joined
   * app filters, and the throttle is per call, not per app.
   */
  async installs(appIds: string[]): Promise<Record<string, string[]>> {
    if (appIds.some((id) => !GUID.test(id)))
      throw new MeteringError("response");
    const url = checkedMeteringUrl(GRAPH + INSTALL_REPORT, INSTALL_REPORT);
    const installed: Record<string, string[]> = Object.fromEntries(
      appIds.map((id) => [id.toLowerCase(), []]),
    );
    for (let batch = 0; batch < appIds.length; batch += INSTALL_BATCH) {
      const filter = appIds
        .slice(batch, batch + INSTALL_BATCH)
        .map((id) => `(ApplicationId eq '${id}')`)
        .join(" or ");
      for (let skip = 0; ; skip += 1000) {
        const parsed = installReportSchema.safeParse(
          await this.request(url, {
            filter,
            select: INSTALL_COLUMNS,
            top: 1000,
            skip,
          }),
        );
        if (!parsed.success) throw new MeteringError("response");
        const columns = parsed.data.Schema.map((column) => column.Column);
        // Fail closed if Microsoft ever returns columns we did not ask for.
        if (
          columns.some(
            (column) =>
              !/^(ApplicationId|DeviceId|InstallState|AppInstallState)(_loc)?$/.test(
                column,
              ),
          )
        )
          throw new MeteringError("response");
        const app = columns.indexOf("ApplicationId");
        const device = columns.indexOf("DeviceId");
        const state = columns.indexOf("InstallState");
        const label = columns.indexOf("AppInstallState");
        for (const values of parsed.data.Values) {
          const rawApp = values[app];
          const rawDevice = values[device];
          const appId = typeof rawApp === "string" ? rawApp.toLowerCase() : "";
          const id =
            typeof rawDevice === "string" ? rawDevice.toLowerCase() : "";
          if (
            installed[appId] &&
            GUID.test(id) &&
            (values[state] === 1 || values[label] === "S1")
          )
            installed[appId].push(id);
        }
        if (
          !parsed.data.Values.length ||
          skip + parsed.data.Values.length >= parsed.data.TotalRowCount ||
          skip >= 100_000
        )
          break;
      }
    }
    return installed;
  }
}

export async function meteringClient(
  tid: string,
  deadline?: number,
): Promise<MeteringGraphClient> {
  if (!meteringConfigured() || !GUID.test(tid))
    throw new MeteringError("configuration");
  const app = new ConfidentialClientApplication({
    auth: {
      clientId: env.METERING_CLIENT_ID!,
      clientSecret: env.METERING_CLIENT_SECRET!,
      authority: `https://login.microsoftonline.com/${tid}`,
    },
  });
  try {
    const token = await app.acquireTokenByClientCredential({
      scopes: ["https://graph.microsoft.com/.default"],
    });
    if (!token?.accessToken) throw new MeteringError("consent");
    // Token obtained directly from Microsoft; Graph probes enforce its validity.
    const claims = JSON.parse(
      Buffer.from(token.accessToken.split(".")[1]!, "base64url").toString(),
    ) as { roles?: string[]; tid?: string; oid?: string };
    if (
      !claims.oid ||
      claims.tid?.toLowerCase() !== tid.toLowerCase() ||
      !meteringAccess(claims.roles).ok
    )
      throw new MeteringError("consent");
    return new MeteringGraphClient(
      token.accessToken,
      deadline,
      meteringAccess(claims.roles).canWrite,
    );
  } catch (err) {
    throw err instanceof MeteringError ? err : new MeteringError("consent");
  }
}

export async function verifyMeteringConsent(tid: string): Promise<void> {
  const client = await meteringClient(tid, Date.now() + 90_000);
  await client.probe();
}
