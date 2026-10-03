import { ConfidentialClientApplication } from "@azure/msal-node";
import { z } from "zod";
import { env } from "~/env";
import { GUID, METERING_SCOPES } from "~/lib/metering";

const GRAPH = "https://graph.microsoft.com/beta";
export const METERING_ERRORS: Record<string, string> = {
  configuration:
    "Software Metering is not configured on this installation. Ask the operator to configure its separate Microsoft application.",
  consent:
    "Metering access could not be verified. Grant both metering permissions, allow a few minutes for consent to propagate, then retry.",
  forbidden:
    "Microsoft denied metering access. Check consent, Intune licensing, and tenant access policies.",
  missing:
    "The selected remediation package is no longer available. Select a package again.",
  timeout:
    "The metering refresh reached its time limit. Retry later; previous observations have been kept.",
  throttled:
    "Microsoft temporarily limited requests. Retry later; previous observations have been kept.",
  response:
    "Microsoft returned an unexpected metering response. Previous observations have been kept.",
  busy: "A metering refresh is already running. Try again shortly.",
  changed: "Metering settings changed during the refresh. Start a new refresh.",
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
export type MeteringDevice = z.infer<typeof deviceSchema>;
export type MeteringRunState = z.infer<typeof stateSchema>;
export type MeteringPackage = z.infer<typeof packageSchema>;
export interface MeteringSource {
  packages(this: void): Promise<MeteringPackage[]>;
  devices(this: void): Promise<MeteringDevice[]>;
  states(this: void, scriptId: string): Promise<MeteringRunState[]>;
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

export class MeteringGraphClient implements MeteringSource {
  constructor(
    private token: string,
    private deadline = Date.now() + 240_000,
  ) {}

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
      let response: Response | undefined;
      for (let attempt = 0; attempt < 3; attempt++) {
        const remaining = this.deadline - Date.now();
        if (remaining <= 0) throw new MeteringError("timeout");
        try {
          response = await fetch(url, {
            headers: { Authorization: `Bearer ${this.token}` },
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
      const parsed = z
        .object({
          value: z.array(schema),
          "@odata.nextLink": z.string().optional(),
        })
        .safeParse(await response.json());
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
  }
  packages() {
    return this.list(
      "/deviceManagement/deviceHealthScripts",
      { $select: "id,displayName", $top: "100" },
      packageSchema,
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
      !METERING_SCOPES.every((scope) => claims.roles?.includes(scope)) ||
      claims.roles?.some(
        (role) => !METERING_SCOPES.some((scope) => scope === role),
      )
    )
      throw new MeteringError("consent");
    return new MeteringGraphClient(token.accessToken, deadline);
  } catch (err) {
    throw err instanceof MeteringError ? err : new MeteringError("consent");
  }
}

export async function verifyMeteringConsent(tid: string): Promise<void> {
  const client = await meteringClient(tid, Date.now() + 90_000);
  await client.probe();
}
