import type { SaasProvider } from "~/server/types";

/**
 * Client-safe connector descriptions: labels, credential field specs and
 * page copy. No server imports: this file is shared by client components,
 * server pages and the sidebar nav. The server-side counterpart (clients,
 * demo fixtures) lives in src/server/saas/registry.ts.
 */

export const CONNECTOR_LABELS: Record<SaasProvider, string> = {
  zoom: "Zoom",
  atlassian: "Atlassian",
  salesforce: "Salesforce",
  openai: "OpenAI",
  anthropic: "Anthropic",
  chatgpt: "ChatGPT",
  claude: "Claude",
};

export type ConnectorField = {
  name: "orgRef" | "clientId" | "secret";
  label: string;
  /** Format example shown in the empty input: a value shape, never an instruction. */
  placeholder: string;
  secret?: boolean;
  /** Mobile keyboard hint; inputs stay type="text"/"password" so pasting is never rejected. */
  inputMode?: "text" | "url" | "email";
};

export type ConnectorSpec = {
  provider: SaasProvider;
  label: string;
  /** "api" connectors authenticate with stored credentials; "import" connectors take a pasted member CSV. */
  kind: "api" | "import";
  /** Set when the provider's seats carry no per-seat price; no price-book section is rendered. */
  unpriced?: true;
  /** What the seats are called in product copy. */
  seatNoun: string;
  /** Credential fields ("api" kind); empty for "import" connectors. */
  fields: ConnectorField[];
  /** How the admin obtains the credentials, shown above the form. */
  setupHint: string;
  /** What the connector detects, shown on the subpage. */
  detects: string[];
  /** Whether the provider exposes a last-activity signal. */
  hasActivity: boolean;
  connectCta: string;
};

export const CONNECTORS: ConnectorSpec[] = [
  {
    provider: "zoom",
    label: "Zoom",
    kind: "api",
    seatNoun: "Licensed Zoom seats",
    fields: [
      { name: "orgRef", label: "Account ID", placeholder: "q6gBJVO5Tze…" },
      { name: "clientId", label: "Client ID", placeholder: "K3vQn8RsTUm…" },
      { name: "secret", label: "Client secret", placeholder: "x7TuVwXyZ0a…", secret: true },
    ],
    setupHint:
      "A Zoom admin creates a Server-to-Server OAuth app in the Zoom App Marketplace (Develop > Build App) with the user:read:list_users:admin scope, then pastes the three values here. Stored encrypted, used read-only.",
    detects: [
      "Licensed Zoom seats held by accounts that are disabled in Entra ID.",
      "Licensed seats with no matching directory account at all.",
      "Licensed seats nobody has signed into for your inactivity threshold, common where Teams took over.",
    ],
    hasActivity: true,
    connectCta: "Connect Zoom",
  },
  {
    provider: "atlassian",
    label: "Atlassian",
    kind: "api",
    seatNoun: "Jira and Confluence seats",
    fields: [
      { name: "orgRef", label: "Organization ID", placeholder: "1a2b3c4d-5e6f-…" },
      { name: "secret", label: "API key", placeholder: "ATCTT3xFfGN0…", secret: true },
    ],
    setupHint:
      "An organization admin creates an API key under admin.atlassian.com > Organization settings > API keys and pastes the organization ID plus the key here. Your org needs at least one verified domain (only managed accounts are returned). Stored encrypted, used read-only: managed users and product access only, nothing from inside Jira or Confluence.",
    detects: [
      "Jira and Confluence seats held by accounts that are disabled in Entra ID.",
      "Seats with no matching directory account at all.",
      "Seats with no product activity for your inactivity threshold, where Atlassian reports it.",
    ],
    hasActivity: true,
    connectCta: "Connect Atlassian",
  },
  {
    provider: "salesforce",
    label: "Salesforce",
    kind: "api",
    seatNoun: "Salesforce user licenses",
    fields: [
      {
        name: "orgRef",
        label: "My Domain URL",
        placeholder: "https://yourorg.my.salesforce.com",
        inputMode: "url",
      },
      { name: "clientId", label: "Consumer key", placeholder: "3MVG9aBcDeFgHiJ…" },
      { name: "secret", label: "Consumer secret", placeholder: "A1B2C3D4E5F6…", secret: true },
    ],
    setupHint:
      "A Salesforce admin creates a Connected App with the Client Credentials flow enabled and the 'Manage user data via APIs (api)' OAuth scope, with an integration user that has API Enabled and View All Users as the read-only run-as user, then pastes the production or sandbox My Domain URL, consumer key and consumer secret here. Stored encrypted; the only query is the user list with license type and last login.",
    detects: [
      "Salesforce licenses held by accounts that are disabled in Entra ID. At Salesforce prices, usually the single most expensive leak.",
      "Licenses with no matching directory account at all.",
      "Licenses nobody has logged into for your inactivity threshold.",
    ],
    hasActivity: true,
    connectCta: "Connect Salesforce",
  },
  {
    provider: "openai",
    label: "OpenAI",
    kind: "api",
    unpriced: true,
    seatNoun: "OpenAI console members",
    fields: [
      { name: "secret", label: "Admin API key", placeholder: "sk-admin-…", secret: true },
    ],
    setupHint:
      "An organization Owner creates an Admin API key under platform.openai.com > Settings > Organization > Admin keys and pastes it here. Stored encrypted, used read-only: member list and daily cost totals only, never request content.",
    detects: [
      "Console members whose Entra ID account is disabled: departed people who may still hold live API keys.",
      "Console members with no matching directory account at all.",
      "Daily API spend by line item, backfilled on first sync and tracked on the AI costs page.",
    ],
    hasActivity: false,
    connectCta: "Connect OpenAI",
  },
  {
    provider: "anthropic",
    label: "Anthropic",
    kind: "api",
    unpriced: true,
    seatNoun: "Anthropic console members",
    fields: [
      { name: "secret", label: "Admin API key", placeholder: "sk-ant-admin…", secret: true },
    ],
    setupHint:
      "An organization admin creates an Admin API key in the Claude Console (platform.claude.com) under Organization settings > Admin keys and pastes it here. Stored encrypted, used read-only: member list and daily cost totals only, never request content.",
    detects: [
      "Console members whose Entra ID account is disabled: departed people who may still hold live API keys.",
      "Console members with no matching directory account at all.",
      "Daily API spend by model, backfilled on first sync and tracked on the AI costs page.",
    ],
    hasActivity: false,
    connectCta: "Connect Anthropic",
  },
  {
    provider: "chatgpt",
    label: "ChatGPT",
    kind: "import",
    seatNoun: "ChatGPT seats",
    fields: [],
    setupHint:
      "In ChatGPT workspace settings or analytics, paste a member table or CSV export if one is available for your workspace, including its header row. The pasted rows are matched against Entra ID and stored like any other connector's seats.",
    detects: [
      "ChatGPT seats held by accounts that are disabled in Entra ID.",
      "Seats with no matching directory account at all.",
      "Seats with no activity for your inactivity threshold, only when the pasted data includes a last-active column.",
    ],
    hasActivity: true,
    connectCta: "Import member CSV",
  },
  {
    provider: "claude",
    label: "Claude",
    kind: "import",
    seatNoun: "Claude seats",
    fields: [],
    setupHint:
      "In the Claude admin settings, open Members and export or copy the member table including its header row, then paste it below. The list is matched against Entra ID and stored like any other connector's seats.",
    detects: [
      "Claude seats held by accounts that are disabled in Entra ID.",
      "Seats with no matching directory account at all.",
      "Seats with no activity for your inactivity threshold, when the export includes a last-active column.",
    ],
    hasActivity: true,
    connectCta: "Import member CSV",
  },
];

export const connectorSpec = (provider: SaasProvider): ConnectorSpec => {
  const spec = CONNECTORS.find((c) => c.provider === provider);
  if (!spec) throw new Error(`Unknown connector ${provider}`);
  return spec;
};
