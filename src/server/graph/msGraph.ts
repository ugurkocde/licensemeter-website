import { createHash } from "node:crypto";

import { ConfidentialClientApplication } from "@azure/msal-node";

import { env } from "~/env";
import { CONNECTOR_SCOPES } from "~/lib/scopes";
import { csvToRecords, reportDate } from "./reportCsv";
import {
  GraphHttpError,
  PremiumLicenseRequiredError,
  type CopilotUsageRow,
  type GraphClient,
  type GraphSubscribedSku,
  type GraphUser,
  type UsageReportRow,
} from "./types";

const GRAPH = "https://graph.microsoft.com/v1.0";

/**
 * How a workspace's app-only Graph token is obtained. Managed uses the central
 * connector app (env creds) keyed by tid; BYO uses the customer's own app reg
 * with either a client secret or a certificate (private key + thumbprint).
 */
export type MsCredential =
  | { mode: "managed"; tid: string }
  | {
      mode: "byo";
      credType: "secret";
      tid: string;
      clientId: string;
      secret: string;
    }
  | {
      mode: "byo";
      credType: "cert";
      tid: string;
      clientId: string;
      privateKey: string;
      thumbprint: string;
    };

/** One confidential client per credential; MSAL caches tokens internally. */
const msalApps = new Map<string, ConfidentialClientApplication>();

/**
 * Right after admin consent, the freshly created service principal can take a
 * minute to propagate to the token service, so first syncs would always fail
 * without a retry on this class of error.
 */
const CONSENT_PROPAGATION_PATTERNS =
  /could not be established|AADSTS700016|AADSTS7000229|was not found in the directory/i;

/**
 * Cache key that changes when the underlying credential changes, so rotating a
 * BYO secret never reuses an MSAL client holding the stale secret.
 */
const appCacheKey = (cred: MsCredential): string => {
  if (cred.mode === "managed") return `managed:${cred.tid}`;
  const material = cred.credType === "secret" ? cred.secret : cred.privateKey;
  const fp = createHash("sha256").update(material).digest("hex").slice(0, 12);
  return `byo:${cred.tid}:${cred.clientId}:${cred.credType}:${fp}`;
};

const buildApp = (cred: MsCredential): ConfidentialClientApplication => {
  const authority = `https://login.microsoftonline.com/${cred.tid}`;
  if (cred.mode === "managed") {
    if (!env.CONNECTOR_CLIENT_ID || !env.CONNECTOR_CLIENT_SECRET) {
      throw new Error(
        "CONNECTOR_CLIENT_ID / CONNECTOR_CLIENT_SECRET are not configured",
      );
    }
    return new ConfidentialClientApplication({
      auth: {
        clientId: env.CONNECTOR_CLIENT_ID,
        clientSecret: env.CONNECTOR_CLIENT_SECRET,
        authority,
      },
    });
  }
  if (cred.credType === "secret") {
    return new ConfidentialClientApplication({
      auth: { clientId: cred.clientId, clientSecret: cred.secret, authority },
    });
  }
  return new ConfidentialClientApplication({
    auth: {
      clientId: cred.clientId,
      authority,
      clientCertificate: {
        thumbprint: cred.thumbprint,
        privateKey: cred.privateKey,
      },
    },
  });
};

const acquireToken = async (cred: MsCredential): Promise<string> => {
  const cacheKey = appCacheKey(cred);
  let app = msalApps.get(cacheKey);
  if (!app) {
    app = buildApp(cred);
    msalApps.set(cacheKey, app);
  }
  for (let attempt = 0; ; attempt++) {
    try {
      const result = await app.acquireTokenByClientCredential({
        scopes: ["https://graph.microsoft.com/.default"],
      });
      if (!result?.accessToken) {
        throw new Error(
          `Failed to acquire app-only token for tenant ${cred.tid}`,
        );
      }
      return result.accessToken;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (attempt < 3 && CONSENT_PROPAGATION_PATTERNS.test(message)) {
        await sleep(15_000);
        continue;
      }
      throw err;
    }
  }
};

/** App-only token's granted application permissions, from the JWT `roles` claim. */
const decodeRoles = (jwt: string): string[] => {
  const parts = jwt.split(".");
  if (parts.length < 2 || !parts[1]) return [];
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8"),
    ) as { roles?: unknown };
    return Array.isArray(payload.roles)
      ? payload.roles.filter((r): r is string => typeof r === "string")
      : [];
  } catch {
    return [];
  }
};

export type MsVerifyResult =
  | {
      ok: true;
      /** Per-scope checklist; granted=false means the role is missing. */
      checklist: { scope: string; granted: boolean }[];
      /** True when every required scope is present in the token's roles claim. */
      complete: boolean;
      /**
       * Live Reports API probe. The roles claim says the permission is granted,
       * but the Reports endpoints have quirks (tenant-level toggles, propagation)
       * not visible in the token, so we additionally call one for real. Absent
       * when Reports.Read.All is not granted (nothing to probe).
       */
      reportsProbe?: { ok: boolean; message?: string };
    }
  | { ok: false; error: string };

/** One live Reports API call: confirms the granted scope actually works. */
const probeReports = async (
  token: string,
): Promise<{ ok: boolean; message?: string }> => {
  try {
    const res = await fetch(
      `${GRAPH}/reports/getOffice365ActiveUserDetail(period='D7')`,
      { headers: { Authorization: `Bearer ${token}` }, redirect: "follow" },
    );
    if (res.ok) return { ok: true };
    return { ok: false, message: `Reports API returned ${res.status}` };
  } catch {
    return { ok: false, message: "Reports API probe failed" };
  }
};

/**
 * Test-connection for a Microsoft credential: acquires an app-only token with
 * the given creds and checks the token's `roles` claim contains every required
 * application permission. The roles claim is authoritative for app-only tokens
 * (verified end-to-end against a real tenant via Lokka) — granted permissions
 * appear, ungranted ones are absent — so this needs no extra Graph call.
 *
 * On an auth failure (wrong/expired secret, unknown app) it returns a clean,
 * non-leaking message; the underlying AADSTS error is for server logs only.
 */
export const verifyMsCredential = async (
  cred: MsCredential,
): Promise<MsVerifyResult> => {
  let token: string;
  try {
    token = await acquireToken(cred);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Log only the message: MSAL error objects can carry request context, and
    // the raw secret/key must never reach the logs.
    console.error("[ms verify] token acquisition failed:", message);
    // Map the common, safe-to-surface AADSTS causes; never echo the raw error.
    if (/AADSTS7000215|invalid client secret/i.test(message)) {
      return { ok: false, error: "The client secret is wrong or expired." };
    }
    if (/AADSTS700027|certificate|thumbprint/i.test(message)) {
      return {
        ok: false,
        error: "The certificate is not registered on this app, or the key does not match it.",
      };
    }
    if (/AADSTS700016|was not found in the directory/i.test(message)) {
      return {
        ok: false,
        error: "No app registration with that Client ID exists in that tenant.",
      };
    }
    if (/AADSTS90002|tenant .* not found/i.test(message)) {
      return { ok: false, error: "That Tenant ID was not found." };
    }
    return {
      ok: false,
      error: "Could not authenticate with those credentials. Check the values and try again.",
    };
  }
  const granted = new Set(decodeRoles(token));
  const checklist = CONNECTOR_SCOPES.map((s) => ({
    scope: s.scope,
    granted: granted.has(s.scope),
  }));
  const reportsProbe = granted.has("Reports.Read.All")
    ? await probeReports(token)
    : undefined;
  return {
    ok: true,
    checklist,
    complete: checklist.every((c) => c.granted),
    reportsProbe,
  };
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type GraphErrorBody = { error?: { code?: string; message?: string } };

/** Fetch with Graph throttling etiquette: respect Retry-After on 429/503, max 4 tries. */
const graphFetch = async (token: string, url: string): Promise<Response> => {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      redirect: "follow",
    });
    if (res.status === 429 || res.status === 503) {
      if (attempt >= 3) {
        throw new GraphHttpError(res.status, "throttled", "Graph throttling persisted");
      }
      const retryAfter = Number(res.headers.get("retry-after") ?? "2");
      await sleep(Math.min(retryAfter, 30) * 1000);
      continue;
    }
    if (!res.ok) {
      let code: string | null = null;
      let message = `${res.status} ${res.statusText}`;
      try {
        const body = (await res.json()) as GraphErrorBody;
        code = body.error?.code ?? null;
        message = body.error?.message ?? message;
      } catch {
        // non-JSON error body; keep the status text
      }
      throw new GraphHttpError(res.status, code, message);
    }
    return res;
  }
};

const getAllPages = async <T>(token: string, firstUrl: string): Promise<T[]> => {
  const items: T[] = [];
  let url: string | undefined = firstUrl;
  while (url) {
    const res = await graphFetch(token, url);
    const body = (await res.json()) as { value: T[]; "@odata.nextLink"?: string };
    items.push(...body.value);
    const next = body["@odata.nextLink"];
    // Defense in depth: never follow pagination off graph.microsoft.com.
    if (next && !next.startsWith("https://graph.microsoft.com/")) {
      throw new GraphHttpError(502, "bad_next_link", "Unexpected nextLink host");
    }
    url = next;
  }
  return items;
};

const USER_FIELDS =
  "id,displayName,userPrincipalName,accountEnabled,userType,createdDateTime,assignedLicenses,licenseAssignmentStates";

/** Office 365 active-user-detail CSV -> usage rows (shared by both clients). */
const fetchActiveUserDetail = async (
  token: string,
  period: "D90",
): Promise<UsageReportRow[]> => {
  const res = await graphFetch(
    token,
    `${GRAPH}/reports/getOffice365ActiveUserDetail(period='${period}')`,
  );
  const text = await res.text();
  return csvToRecords(text).map((r) => ({
    userPrincipalName: r["User Principal Name"] ?? "",
    exchangeLastActivityDate: reportDate(r["Exchange Last Activity Date"]),
    oneDriveLastActivityDate: reportDate(r["OneDrive Last Activity Date"]),
    sharePointLastActivityDate: reportDate(r["SharePoint Last Activity Date"]),
    teamsLastActivityDate: reportDate(r["Teams Last Activity Date"]),
  }));
};

/** Copilot usage report (CSV or JSON shape) -> rows (shared by both clients). */
const fetchCopilotUsage = async (
  token: string,
  period: "D90",
): Promise<CopilotUsageRow[]> => {
  const res = await graphFetch(
    token,
    `${GRAPH}/copilot/reports/getMicrosoft365CopilotUsageUserDetail(period='${period}')?$format=text/csv`,
  );
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("json")) {
    const body = (await res.json()) as {
      value?: { userPrincipalName?: string; lastActivityDate?: string | null }[];
    };
    return (body.value ?? []).map((r) => ({
      userPrincipalName: r.userPrincipalName ?? "",
      lastActivityDate: r.lastActivityDate ?? null,
    }));
  }
  const text = await res.text();
  return csvToRecords(text).map((r) => ({
    userPrincipalName: r["User Principal Name"] ?? "",
    lastActivityDate: reportDate(r["Last Activity Date"]),
  }));
};

export class MsGraphClient implements GraphClient {
  constructor(private readonly cred: MsCredential) {}

  async getOrganizationName(): Promise<string | null> {
    try {
      const token = await acquireToken(this.cred);
      const res = await graphFetch(
        token,
        `${GRAPH}/organization?$select=displayName`,
      );
      const body = (await res.json()) as { value?: { displayName?: string }[] };
      return body.value?.[0]?.displayName ?? null;
    } catch {
      return null;
    }
  }

  async getSubscribedSkus(): Promise<GraphSubscribedSku[]> {
    const token = await acquireToken(this.cred);
    return getAllPages<GraphSubscribedSku>(token, `${GRAPH}/subscribedSkus`);
  }

  async getReportConcealment(): Promise<boolean | null> {
    const token = await acquireToken(this.cred);
    try {
      const res = await graphFetch(token, `${GRAPH}/admin/reportSettings`);
      const body = (await res.json()) as { displayConcealedNames?: boolean };
      return body.displayConcealedNames ?? null;
    } catch {
      // ReportSettings.Read.All might not be granted on older consents.
      return null;
    }
  }

  async listUsers(opts: { includeSignInActivity: boolean }): Promise<GraphUser[]> {
    const token = await acquireToken(this.cred);
    const select = opts.includeSignInActivity
      ? `${USER_FIELDS},signInActivity`
      : USER_FIELDS;
    // signInActivity caps the page size at lower limits; 250 is safe for both shapes.
    const url = `${GRAPH}/users?$select=${select}&$top=250`;
    try {
      return await getAllPages<GraphUser>(token, url);
    } catch (err) {
      // signInActivity is gated twice for app-only callers: tenant Entra ID P1
      // AND AuditLog.Read.All consent. Either denial degrades the same way the
      // delegated client already handles it — drop sign-in data and let the sync
      // fall back to usage reports rather than failing the whole run.
      if (
        opts.includeSignInActivity &&
        (isAuthDenied(err) ||
          (err instanceof GraphHttpError &&
            (err.code ===
              "Authentication_RequestFromNonPremiumTenantOrB2CTenant" ||
              /premium/i.test(err.message))))
      ) {
        throw new PremiumLicenseRequiredError(
          err instanceof Error ? err.message : String(err),
        );
      }
      throw err;
    }
  }

  async getActiveUserDetail(period: "D90"): Promise<UsageReportRow[]> {
    const token = await acquireToken(this.cred);
    return fetchActiveUserDetail(token, period);
  }

  async getCopilotUsage(period: "D90"): Promise<CopilotUsageRow[]> {
    const token = await acquireToken(this.cred);
    return fetchCopilotUsage(token, period);
  }
}

/** 401/403: the delegated caller lacks the directory role for this read. */
const isAuthDenied = (err: unknown): boolean =>
  err instanceof GraphHttpError && (err.status === 401 || err.status === 403);

/**
 * GraphClient over a delegated user access token, used by the one-shot
 * instant scan. Unlike the app-only client, delegated reads are bounded by the
 * signed-in USER'S directory roles on top of the consented scopes: usage
 * and Copilot reports need a reports-capable role (Reports Reader, Global
 * Reader, ...), signInActivity additionally needs Entra ID P1, and
 * /admin/reportSettings is admin-only. Every role-bounded source therefore
 * degrades on 401/403 into the same signal-absent shapes the sync pipeline
 * already handles for non-P1/concealed tenants. Only the directory reads
 * (users, subscribedSkus) may fail the scan: without them there is nothing
 * to analyze.
 */
export class DelegatedGraphClient implements GraphClient {
  constructor(private readonly accessToken: string) {}

  async getOrganizationName(): Promise<string | null> {
    try {
      const res = await graphFetch(
        this.accessToken,
        `${GRAPH}/organization?$select=displayName`,
      );
      const body = (await res.json()) as { value?: { displayName?: string }[] };
      return body.value?.[0]?.displayName ?? null;
    } catch {
      return null;
    }
  }

  async getSubscribedSkus(): Promise<GraphSubscribedSku[]> {
    // Plain directory read (delegated LicenseAssignment.Read.All suffices,
    // no role needed). Critical: a failure here fails the scan, same as
    // the app-only sync.
    return getAllPages<GraphSubscribedSku>(
      this.accessToken,
      `${GRAPH}/subscribedSkus`,
    );
  }

  async getReportConcealment(): Promise<boolean | null> {
    try {
      const res = await graphFetch(
        this.accessToken,
        `${GRAPH}/admin/reportSettings`,
      );
      const body = (await res.json()) as { displayConcealedNames?: boolean };
      return body.displayConcealedNames ?? null;
    } catch {
      // Admin-only endpoint: most scan users get a 403 here. Unknown
      // concealment is handled downstream (joined.concealed fallback).
      return null;
    }
  }

  async listUsers(opts: { includeSignInActivity: boolean }): Promise<GraphUser[]> {
    const select = opts.includeSignInActivity
      ? `${USER_FIELDS},signInActivity`
      : USER_FIELDS;
    const url = `${GRAPH}/users?$select=${select}&$top=250`;
    try {
      return await getAllPages<GraphUser>(this.accessToken, url);
    } catch (err) {
      // signInActivity is doubly gated for delegated callers: tenant P1 AND
      // an auditlog-capable user role. Either denial degrades the same way:
      // the sync retries without sign-in data and falls back to usage reports.
      if (
        opts.includeSignInActivity &&
        (isAuthDenied(err) ||
          (err instanceof GraphHttpError &&
            (err.code === "Authentication_RequestFromNonPremiumTenantOrB2CTenant" ||
              /premium/i.test(err.message))))
      ) {
        throw new PremiumLicenseRequiredError(
          err instanceof Error ? err.message : String(err),
        );
      }
      throw err; // plain user list failing is fatal: nothing to analyze
    }
  }

  async getActiveUserDetail(period: "D90"): Promise<UsageReportRow[]> {
    // Role-bounded: throws GraphHttpError 403 without Reports Reader/Global
    // Reader. The sync records the failure as a warning and the join treats
    // the missing rows as "no activity signal", never a thrown scan.
    return fetchActiveUserDetail(this.accessToken, period);
  }

  async getCopilotUsage(period: "D90"): Promise<CopilotUsageRow[]> {
    // Role-bounded like the usage report; failure -> warning step and
    // copilotSignal "none" downstream.
    return fetchCopilotUsage(this.accessToken, period);
  }
}
