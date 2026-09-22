import type { AiSpendRow, SaasProvider, SaasSeat } from "~/server/types";
import { demoUpn } from "~/server/graph/demoGraph";

export interface SaasClient {
  getSeats(): Promise<SaasSeat[]>;
}

/** SaaS client whose admin API also reports daily spend (openai/anthropic). */
export type AiSpendClient = SaasClient & {
  getSpend(sinceDay: string, deadline?: number): Promise<AiSpendRow[]>;
};

/** Decrypted credentials as stored on saas_connections. */
export type SaasCredentials = {
  orgRef: string;
  clientId: string | null;
  secret: string;
};

const daysAgo = (n: number): Date =>
  new Date(Date.now() - n * 24 * 60 * 60 * 1000);

/**
 * Demo fixtures per provider. Distinct disabled leavers (Entra demo users
 * 138-145 are the disabled bucket; Adobe already uses 138/139) so the demo
 * shows different people leaking in different apps, the way real tenants do.
 */
const DEMO_SEATS: Record<SaasProvider, () => SaasSeat[]> = {
  zoom: () => [
    // Disabled in Entra, still licensed in Zoom.
    {
      email: demoUpn(140),
      displayName: "Demo Leaver Zoom",
      status: "active",
      products: ["Licensed"],
      lastActiveAt: daysAgo(130),
    },
    // Active account that simply stopped using Zoom (Teams won).
    {
      email: demoUpn(20),
      displayName: null,
      status: "active",
      products: ["Licensed"],
      lastActiveAt: daysAgo(150),
    },
    {
      email: demoUpn(21),
      displayName: null,
      status: "active",
      products: ["Licensed"],
      lastActiveAt: daysAgo(170),
    },
    // No Entra account at all.
    {
      email: "extern.moderator@webinar-agentur.example",
      displayName: "Extern Moderator",
      status: "active",
      products: ["Licensed"],
      lastActiveAt: daysAgo(40),
    },
    // Healthy seats.
    {
      email: demoUpn(1),
      displayName: null,
      status: "active",
      products: ["Licensed"],
      lastActiveAt: daysAgo(3),
    },
    {
      email: demoUpn(2),
      displayName: null,
      status: "active",
      products: ["Licensed"],
      lastActiveAt: daysAgo(9),
    },
  ],
  atlassian: () => [
    // Disabled in Entra, holding Jira + Confluence.
    {
      email: demoUpn(141),
      displayName: "Demo Leaver Atlassian",
      status: "active",
      products: ["Jira Software", "Confluence"],
      lastActiveAt: daysAgo(140),
    },
    // Active in Entra, has not opened Jira in months.
    {
      email: demoUpn(22),
      displayName: null,
      status: "active",
      products: ["Jira Software"],
      lastActiveAt: daysAgo(200),
    },
    // Orphan.
    {
      email: "agentur.dev@externes-studio.example",
      displayName: "Externes Studio",
      status: "active",
      products: ["Jira Software"],
      lastActiveAt: daysAgo(15),
    },
    // Healthy.
    {
      email: demoUpn(3),
      displayName: null,
      status: "active",
      products: ["Jira Software", "Confluence"],
      lastActiveAt: daysAgo(1),
    },
    {
      email: demoUpn(4),
      displayName: null,
      status: "active",
      products: ["Confluence"],
      lastActiveAt: daysAgo(6),
    },
  ],
  salesforce: () => [
    // The expensive one: a disabled account still holding a full CRM seat.
    {
      email: demoUpn(142),
      displayName: "Demo Leaver Salesforce",
      status: "active",
      products: ["Salesforce"],
      lastActiveAt: daysAgo(120),
    },
    // Healthy.
    {
      email: demoUpn(5),
      displayName: null,
      status: "active",
      products: ["Salesforce"],
      lastActiveAt: daysAgo(2),
    },
    {
      email: demoUpn(6),
      displayName: null,
      status: "active",
      products: ["Salesforce"],
      lastActiveAt: daysAgo(5),
    },
  ],
  openai: () => [
    // Disabled in Entra, still an org member who may hold live API keys.
    {
      email: demoUpn(143),
      displayName: "Demo Leaver AI",
      status: "active",
      products: ["Console member"],
      lastActiveAt: null,
    },
    // No Entra account at all.
    {
      email: "ki-pilot@agentur.example",
      displayName: "KI Pilot Agentur",
      status: "active",
      products: ["Console member"],
      lastActiveAt: null,
    },
    // Healthy members; the Admin API exposes no activity signal.
    {
      email: demoUpn(7),
      displayName: null,
      status: "active",
      products: ["Console member"],
      lastActiveAt: null,
    },
    {
      email: demoUpn(8),
      displayName: null,
      status: "active",
      products: ["Console member"],
      lastActiveAt: null,
    },
    {
      email: demoUpn(9),
      displayName: null,
      status: "active",
      products: ["Console member"],
      lastActiveAt: null,
    },
  ],
  anthropic: () => [
    // Disabled in Entra, still an org member who may hold live API keys.
    {
      email: demoUpn(144),
      displayName: "Demo Leaver AI",
      status: "active",
      products: ["Console member"],
      lastActiveAt: null,
    },
    // Healthy members; the Admin API exposes no activity signal.
    {
      email: demoUpn(10),
      displayName: null,
      status: "active",
      products: ["Console member"],
      lastActiveAt: null,
    },
    {
      email: demoUpn(11),
      displayName: null,
      status: "active",
      products: ["Console member"],
      lastActiveAt: null,
    },
  ],
  chatgpt: () => [
    // Disabled in Entra, still holding a ChatGPT Enterprise seat.
    {
      email: demoUpn(143),
      displayName: "Demo Leaver AI",
      status: "active",
      products: ["ChatGPT Enterprise"],
      lastActiveAt: daysAgo(95),
    },
    // Active account that stopped using ChatGPT.
    {
      email: demoUpn(23),
      displayName: null,
      status: "active",
      products: ["ChatGPT Enterprise"],
      lastActiveAt: daysAgo(120),
    },
    // Healthy.
    {
      email: demoUpn(7),
      displayName: null,
      status: "active",
      products: ["ChatGPT Enterprise"],
      lastActiveAt: daysAgo(2),
    },
    {
      email: demoUpn(8),
      displayName: null,
      status: "active",
      products: ["ChatGPT Enterprise"],
      lastActiveAt: daysAgo(5),
    },
    {
      email: demoUpn(12),
      displayName: null,
      status: "active",
      products: ["ChatGPT Enterprise"],
      lastActiveAt: daysAgo(1),
    },
  ],
  claude: () => [
    // Disabled in Entra, still holding a Claude Team seat.
    {
      email: demoUpn(144),
      displayName: "Demo Leaver AI",
      status: "active",
      products: ["Claude Team"],
      lastActiveAt: daysAgo(90),
    },
    // Healthy.
    {
      email: demoUpn(9),
      displayName: null,
      status: "active",
      products: ["Claude Team"],
      lastActiveAt: daysAgo(3),
    },
    {
      email: demoUpn(13),
      displayName: null,
      status: "active",
      products: ["Claude Team"],
      lastActiveAt: daysAgo(7),
    },
  ],
};

class DemoSaasClient implements SaasClient {
  constructor(private readonly provider: SaasProvider) {}
  getSeats(): Promise<SaasSeat[]> {
    return Promise.resolve(DEMO_SEATS[this.provider]());
  }
  /**
   * sinceDay is ignored: the series is keyed by calendar day over a fixed
   * 60-day window, so repeated demo syncs upsert identical rows instead of
   * appending new ones.
   */
  getSpend(_sinceDay: string): Promise<AiSpendRow[]> {
    if (!isAiApiProvider(this.provider)) return Promise.resolve([]);
    const rows: AiSpendRow[] = [];
    for (let i = 0; i < 60; i++) {
      const day = daysAgo(i).toISOString().slice(0, 10);
      if (this.provider === "openai") {
        rows.push(
          {
            day,
            category: "gpt-5",
            amountCents: Math.round(16500 + Math.sin(i * 0.9) * 5200),
          },
          {
            day,
            category: "other",
            amountCents: Math.round(2400 + Math.sin(i * 1.7) * 700),
          },
        );
      } else {
        rows.push(
          {
            day,
            category: "Claude Sonnet usage",
            amountCents: Math.round(12800 + Math.sin(i * 0.8) * 4100),
          },
          {
            day,
            category: "other",
            amountCents: Math.round(1500 + Math.sin(i * 1.3) * 500),
          },
        );
      }
    }
    return Promise.resolve(rows);
  }
}

/** Demo price estimates per product, in cents (editable in the price book). */
export const DEMO_SAAS_PRICES: Record<string, number> = {
  "zoom:Licensed": 1399,
  "atlassian:Jira Software": 800,
  "atlassian:Confluence": 600,
  "salesforce:Salesforce": 16500,
  "chatgpt:ChatGPT Enterprise": 5500,
  "claude:Claude Team": 2500,
};

export const SAAS_PROVIDERS: SaasProvider[] = [
  "zoom",
  "atlassian",
  "salesforce",
  "openai",
  "anthropic",
  "chatgpt",
  "claude",
];

export const isSaasProvider = (v: string): v is SaasProvider =>
  (SAAS_PROVIDERS as string[]).includes(v);

/** Providers whose admin API also reports daily spend. */
export const AI_API_PROVIDERS: SaasProvider[] = ["openai", "anthropic"];

/** Providers with no API at all: seats arrive via CSV/paste import. */
export const IMPORT_PROVIDERS: SaasProvider[] = ["chatgpt", "claude"];

export const isAiApiProvider = (p: SaasProvider): boolean =>
  AI_API_PROVIDERS.includes(p);

export const isImportProvider = (p: SaasProvider): boolean =>
  IMPORT_PROVIDERS.includes(p);

export const buildSaasClient = async (
  provider: SaasProvider,
  creds: SaasCredentials,
): Promise<SaasClient> => {
  switch (provider) {
    case "zoom": {
      const { ZoomClient } = await import("~/server/saas/zoom");
      return new ZoomClient({
        accountId: creds.orgRef,
        clientId: creds.clientId ?? "",
        clientSecret: creds.secret,
      });
    }
    case "atlassian": {
      const { AtlassianClient } = await import("~/server/saas/atlassian");
      return new AtlassianClient({
        orgId: creds.orgRef,
        apiKey: creds.secret,
      });
    }
    case "salesforce": {
      const { SalesforceClient } = await import("~/server/saas/salesforce");
      return new SalesforceClient({
        instanceUrl: creds.orgRef,
        clientId: creds.clientId ?? "",
        clientSecret: creds.secret,
      });
    }
    case "openai": {
      const { OpenAiAdminClient } = await import("~/server/saas/openaiAdmin");
      return new OpenAiAdminClient({ apiKey: creds.secret });
    }
    case "anthropic": {
      const { AnthropicAdminClient } =
        await import("~/server/saas/anthropicAdmin");
      return new AnthropicAdminClient({ apiKey: creds.secret });
    }
    case "chatgpt":
    case "claude":
      throw new Error(`${provider} is import-based and has no API client`);
  }
};

export const demoSaasClient = (provider: SaasProvider): AiSpendClient =>
  new DemoSaasClient(provider);
