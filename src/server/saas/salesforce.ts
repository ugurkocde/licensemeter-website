import type { SaasSeat } from "~/server/types";
import type { SaasClient } from "~/server/saas/registry";

const API_VERSION = "v59.0";

type SalesforceUserRecord = {
  Email?: string;
  Name?: string;
  LastLoginDate?: string | null;
  Profile?: { UserLicense?: { Name?: string } | null } | null;
};

export const mapSalesforceRecords = (
  records: SalesforceUserRecord[],
): SaasSeat[] =>
  records
    .filter((r) => r.Email)
    .map((r) => ({
      email: r.Email!,
      displayName: r.Name ?? null,
      status: "active",
      products: [r.Profile?.UserLicense?.Name ?? "Salesforce"],
      lastActiveAt: r.LastLoginDate ? new Date(r.LastLoginDate) : null,
    }));

/**
 * The customer admin's My Domain URL is user input that we fetch
 * server-side, so it is pinned to Salesforce-owned My Domain hosts (SSRF
 * guard), including production and sandbox domains.
 */
export const validSalesforceUrl = (raw: string): URL | null => {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.pathname !== "/" || url.search || url.hash || url.port) return null;
  const host = url.hostname.toLowerCase();
  const isSandboxMyDomain = host.endsWith(".sandbox.my.salesforce.com");
  const isProductionMyDomain =
    host.endsWith(".my.salesforce.com") && !isSandboxMyDomain;
  return isProductionMyDomain || isSandboxMyDomain ? url : null;
};

/**
 * Admins paste whatever the address bar holds: a scheme-less host, http, or
 * a deep link into Setup. Normalize that to the bare https origin before the
 * strict host check: http is upgraded rather than rejected because the host
 * stays pinned to Salesforce My Domain hosts and only https is ever stored.
 */
export const normalizeSalesforceOrgRef = (raw: string): string | null => {
  let input = raw.trim();
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(input)) input = `https://${input}`;
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  if (url.protocol === "http:") url.protocol = "https:";
  // url.origin drops the pasted path/query/hash and lowercases the host;
  // validSalesforceUrl still rejects non-https schemes and explicit ports.
  return validSalesforceUrl(url.origin)?.origin ?? null;
};

/**
 * Salesforce OAuth 2.0 Client Credentials Flow against a Connected App with
 * a read-only run-as integration user. One SOQL query covers everything:
 * active standard users, their license type, and LastLoginDate.
 */
export class SalesforceClient implements SaasClient {
  constructor(
    private readonly cfg: {
      instanceUrl: string;
      clientId: string;
      clientSecret: string;
    },
  ) {}

  private base(): string {
    const url = validSalesforceUrl(this.cfg.instanceUrl);
    if (!url) {
      throw new Error(
        "Instance URL must be your Salesforce My Domain, for example https://<domain>.my.salesforce.com or https://<domain>.sandbox.my.salesforce.com",
      );
    }
    return url.origin;
  }

  private async getToken(): Promise<string> {
    const res = await fetch(`${this.base()}/services/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: this.cfg.clientId,
        client_secret: this.cfg.clientSecret,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok)
      throw new Error(`Salesforce token request failed (${res.status})`);
    const body = (await res.json()) as { access_token?: string };
    if (!body.access_token)
      throw new Error("Salesforce token response missing access_token");
    return body.access_token;
  }

  async getSeats(): Promise<SaasSeat[]> {
    const token = await this.getToken();
    const soql =
      "SELECT Email, Name, LastLoginDate, Profile.UserLicense.Name " +
      "FROM User WHERE IsActive = true AND UserType = 'Standard'";
    const seats: SaasSeat[] = [];
    let url = `${this.base()}/services/data/${API_VERSION}/query?q=${encodeURIComponent(soql)}`;
    for (let page = 0; page < 200; page++) {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok)
        throw new Error(`Salesforce query failed (${res.status})`);
      const body = (await res.json()) as {
        records?: SalesforceUserRecord[];
        done?: boolean;
        nextRecordsUrl?: string;
      };
      seats.push(...mapSalesforceRecords(body.records ?? []));
      if (body.done !== false || !body.nextRecordsUrl) break;
      // nextRecordsUrl is API-returned: resolve it against the validated
      // instance origin and re-assert that origin before following it, so a
      // tampered/absolute link can never redirect the authenticated request
      // off the pinned Salesforce My Domain host (SSRF guard).
      const base = this.base();
      const next = new URL(body.nextRecordsUrl, base);
      if (next.origin !== new URL(base).origin) {
        throw new Error("Salesforce pagination link left the instance origin");
      }
      url = next.toString();
    }
    return seats;
  }
}
