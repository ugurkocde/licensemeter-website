import { demoUpn } from "~/server/graph/demoGraph";
import type { AdobeUser } from "~/server/types";

export interface AdobeClient {
  getUsers(): Promise<AdobeUser[]>;
}

const IMS_TOKEN_URL = "https://ims-na1.adobelogin.com/ims/token/v3";
const UMAPI_BASE = "https://usermanagement.adobe.io/v2/usermanagement";
const GROUP_RATE_LIMIT_RETRY_MS = 60_000;
const MAX_GROUP_CATALOG_PAGES = 20;
const MAX_GROUP_PAGE_ATTEMPTS = 3;
const MAX_GROUP_RATE_LIMIT_WAIT_MS = 240_000;

type UmapiUser = {
  email?: string;
  status?: string;
  groups?: string[];
  type?: string;
};

type UmapiGroup = {
  type?: string;
  groupName?: string;
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const retryAfterMs = (value: string | null): number => {
  if (!value) return GROUP_RATE_LIMIT_RETRY_MS;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, Math.ceil(seconds * 1000));
  const retryAt = Date.parse(value);
  if (Number.isFinite(retryAt)) return Math.max(0, retryAt - Date.now());
  return GROUP_RATE_LIMIT_RETRY_MS;
};

/**
 * Adobe User Management API via OAuth server-to-server credentials that the
 * customer's Adobe System Admin creates in the Adobe Developer Console.
 * Entitlements only: Adobe exposes no per-user usage data, which is why the
 * connector detects offboarding leaks rather than utilization.
 */
export class UmapiClient implements AdobeClient {
  constructor(
    private readonly cfg: {
      orgId: string;
      clientId: string;
      clientSecret: string;
      sleep?: (ms: number) => Promise<void>;
    },
  ) {}

  private async getToken(): Promise<string> {
    const res = await fetch(IMS_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: this.cfg.clientId,
        client_secret: this.cfg.clientSecret,
        scope: "openid,AdobeID,user_management_sdk",
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      throw new Error(`Adobe token request failed (${res.status})`);
    }
    const body = (await res.json()) as { access_token?: string };
    if (!body.access_token) throw new Error("Adobe token response missing access_token");
    return body.access_token;
  }

  private requestHeaders(token: string): Record<string, string> {
    return {
      Authorization: `Bearer ${token}`,
      "X-Api-Key": this.cfg.clientId,
      Accept: "application/json",
    };
  }

  private async fetchGroupPage(
    token: string,
    page: number,
    retryBudget: { remainingMs: number },
  ): Promise<Response> {
    for (let attempt = 1; attempt <= MAX_GROUP_PAGE_ATTEMPTS; attempt++) {
      const res = await fetch(`${UMAPI_BASE}/groups/${this.cfg.orgId}/${page}`, {
        headers: this.requestHeaders(token),
        signal: AbortSignal.timeout(30_000),
      });
      if (res.status !== 429 || attempt === MAX_GROUP_PAGE_ATTEMPTS) {
        return res;
      }
      const waitMs = retryAfterMs(res.headers.get("Retry-After"));
      if (waitMs > retryBudget.remainingMs) {
        throw new Error(
          "Adobe UMAPI groups request exceeded the rate-limit retry budget; try again later",
        );
      }
      retryBudget.remainingMs -= waitMs;
      await (this.cfg.sleep ?? sleep)(waitMs);
    }
    throw new Error("Adobe UMAPI groups request failed (HTTP 429)");
  }

  private async getProductProfileNames(token: string): Promise<Set<string>> {
    const names = new Set<string>();
    const retryBudget = { remainingMs: MAX_GROUP_RATE_LIMIT_WAIT_MS };
    for (let page = 0; page < MAX_GROUP_CATALOG_PAGES; page++) {
      const res = await this.fetchGroupPage(token, page, retryBudget);
      if (!res.ok) {
        throw new Error(`Adobe UMAPI groups request failed (${res.status})`);
      }
      const body = (await res.json()) as {
        groups?: UmapiGroup[];
        lastPage?: boolean;
      };
      for (const group of body.groups ?? []) {
        if (group.type === "PRODUCT_PROFILE" && group.groupName) {
          names.add(group.groupName);
        }
      }
      if (body.lastPage !== false) break;
      if (page === MAX_GROUP_CATALOG_PAGES - 1) {
        throw new Error(
          `Adobe UMAPI group catalog exceeds ${MAX_GROUP_CATALOG_PAGES} pages; cannot safely scan all product profiles within the sync time budget`,
        );
      }
    }
    return names;
  }

  async getUsers(): Promise<AdobeUser[]> {
    const token = await this.getToken();
    const productProfileNames = await this.getProductProfileNames(token);
    const users: AdobeUser[] = [];
    for (let page = 0; page < 100; page++) {
      const params = new URLSearchParams({ directOnly: "false" });
      const url = `${UMAPI_BASE}/users/${this.cfg.orgId}/${page}?${params.toString()}`;
      const res = await fetch(url, {
        headers: this.requestHeaders(token),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) {
        throw new Error(`Adobe UMAPI request failed (${res.status})`);
      }
      const body = (await res.json()) as {
        users?: UmapiUser[];
        lastPage?: boolean;
      };
      for (const u of body.users ?? []) {
        if (!u.email) continue;
        const products = (u.groups ?? []).filter((name) =>
          productProfileNames.has(name),
        );
        if (products.length === 0) continue;
        users.push({
          email: u.email,
          status: u.status ?? "active",
          products,
        });
      }
      if (body.lastPage !== false) break;
    }
    return users;
  }
}

/**
 * Demo fixture: two Creative Cloud seats still assigned to Entra-disabled
 * Meridian users (the offboarding leak the connector exists for), one orphan
 * with no Entra account at all, five healthy matches.
 */
export class DemoAdobeClient implements AdobeClient {
  getUsers(): Promise<AdobeUser[]> {
    const cc = "Creative Cloud All Apps";
    return Promise.resolve([
      // Disabled in Entra (demo users 138/139 are in the disabled bucket).
      { email: demoUpn(138), status: "active", products: [cc] },
      { email: demoUpn(139), status: "active", products: [cc, "Acrobat Pro"] },
      // No Entra account at all.
      {
        email: "freelancer.extern@agentur.example",
        status: "active",
        products: ["Photoshop"],
      },
      // Healthy seats.
      { email: demoUpn(1), status: "active", products: [cc] },
      { email: demoUpn(2), status: "active", products: ["Acrobat Pro"] },
      { email: demoUpn(3), status: "active", products: [cc] },
      { email: demoUpn(4), status: "active", products: ["Photoshop"] },
      { email: demoUpn(5), status: "active", products: ["Acrobat Pro"] },
    ]);
  }
}
