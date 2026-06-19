import { CONNECTORS } from "~/lib/connectors";

/**
 * Public setup guides for every connector, rendered at /connectors/<slug>
 * and linked from the settings subpages. One entry per connector including
 * Adobe (which predates the CONNECTORS spec array). Every doc href was
 * verified against the live vendor page before being added here; keep step
 * bodies self-sufficient so a moved vendor page never strands an admin.
 */

export type GuideStep = {
  title: string;
  body: string;
  /** Official vendor documentation for this step. */
  doc?: { label: string; href: string };
};

export type ConnectorGuide = {
  slug: string;
  name: string;
  kind: "api" | "import";
  /** One sentence for metadata descriptions and index cards. */
  summary: string;
  intro: string;
  steps: GuideStep[];
  reads: string[];
  neverReads: string[];
  detects: string[];
  settingsPath: string;
};

/** Detects bullets come from the connector spec so the copy can never fork. */
const detectsOf = (provider: string): string[] =>
  CONNECTORS.find((c) => c.provider === provider)?.detects ?? [];

export const CONNECTOR_GUIDES: ConnectorGuide[] = [
  {
    slug: "adobe",
    name: "Adobe",
    kind: "api",
    summary:
      "Find Creative Cloud seats held by people who are disabled or gone, via Adobe's User Management API. Entitlements only, read-only.",
    intro:
      "Adobe seats are expensive and offboarding rarely reaches the Admin Console. LicenseMeter reads the user list and filters memberships to product-profile entitlements through the User Management API, then cross-checks every seat against Entra ID.",
    steps: [
      {
        title: "Create the API project",
        body: "In the Adobe Developer Console, create or open a project and add the User Management API with OAuth Server-to-Server credentials. This requires the Adobe System Administrator role; the Developer role alone cannot create the User Management API integration.",
        doc: {
          label: "Adobe User Management API documentation",
          href: "https://adobe-apiplatform.github.io/umapi-documentation/en/",
        },
      },
      {
        title: "Copy the credentials",
        body: "The credential details page shows the organization ID, client ID and client secret: the three values LicenseMeter asks for.",
      },
      {
        title: "Connect",
        body: "Paste the three values on the Adobe connector page. LicenseMeter validates them against the API before storing anything; the secret is encrypted at rest (AES-256-GCM).",
      },
    ],
    reads: [
      "The user list: email, name and account status",
      "Product profile entitlements per user, filtered from Adobe group memberships",
    ],
    neverReads: [
      "Files, libraries or any Creative Cloud content",
      "Usage data: Adobe's API exposes entitlements only, so there is no inactivity signal",
    ],
    detects: [
      "Creative Cloud seats held by accounts that are disabled in Entra ID.",
      "Seats with no matching directory account at all.",
    ],
    settingsPath: "/app/settings/adobe",
  },
  {
    slug: "zoom",
    name: "Zoom",
    kind: "api",
    summary:
      "Find licensed Zoom seats held by departed or long-inactive people. A Server-to-Server OAuth app with one read scope.",
    intro:
      "Zoom licenses linger after Teams takes over and after people leave. LicenseMeter lists licensed users and their last login and cross-checks each seat against Entra ID.",
    steps: [
      {
        title: "Create the Server-to-Server OAuth app",
        body: "In the Zoom App Marketplace under Develop > Build App, a Zoom account admin creates a Server-to-Server OAuth app and activates it. The app stays internal to your account. Nothing is published.",
        doc: {
          label: "Zoom Server-to-Server OAuth guide",
          href: "https://developers.zoom.us/docs/internal-apps/s2s-oauth/",
        },
      },
      {
        title: "Grant the scope",
        body: "Add the user:read:list_users:admin scope (the granular scope that lists all users). Nothing else is required. Note that the similarly named user:read:user:admin reads only one user at a time and will not authorize the sync.",
      },
      {
        title: "Connect",
        body: "Copy the account ID, client ID and client secret from the app credentials page and paste them on the Zoom connector page. They are validated before storage and encrypted at rest.",
      },
    ],
    reads: [
      "Licensed users: email, name, status and plan type",
      "Last sign-in where Zoom reports it",
    ],
    neverReads: ["Meetings, recordings, chat or any content"],
    detects: detectsOf("zoom"),
    settingsPath: "/app/settings/zoom",
  },
  {
    slug: "atlassian",
    name: "Atlassian",
    kind: "api",
    summary:
      "Find Jira and Confluence seats that outlived their users. One organization API key, read-only.",
    intro:
      "Atlassian product access survives offboarding more often than most. LicenseMeter reads managed users and their product access through the organization admin API and cross-checks each seat against Entra ID.",
    steps: [
      {
        title: "Create an organization API key",
        body: "In Atlassian Administration (admin.atlassian.com) under Organization settings > API keys, create a key. Only users with the organization admin role can do this. If the key offers API scopes, include read:accounts:admin (or create it without scopes). The connector reads managed accounts, so your organization needs at least one verified domain; unverified accounts are not returned.",
        doc: {
          label: "Atlassian organization admin API documentation",
          href: "https://support.atlassian.com/organization-administration/docs/manage-an-organization-with-the-admin-apis/",
        },
      },
      {
        title: "Note the organization ID",
        body: "It is part of the Atlassian Administration URL (admin.atlassian.com/o/<organization-id>) and shown alongside the API key.",
      },
      {
        title: "Connect",
        body: "Paste the organization ID and the API key on the Atlassian connector page. Validated before storage, encrypted at rest.",
      },
    ],
    reads: [
      "Managed users: email, name and account status",
      "Product access per user (Jira, Confluence) and last activity where Atlassian reports it",
    ],
    neverReads: ["Issues, pages, projects or any content inside the products"],
    detects: detectsOf("atlassian"),
    settingsPath: "/app/settings/atlassian",
  },
  {
    slug: "salesforce",
    name: "Salesforce",
    kind: "api",
    summary:
      "Find Salesforce licenses still assigned to departed people, usually the single most expensive leak. Connected App with client credentials, read-only.",
    intro:
      "At Salesforce prices, one forgotten seat pays for a lot of tooling. LicenseMeter queries the user list with license type and last login and cross-checks every license against Entra ID.",
    steps: [
      {
        title: "Create a Connected App",
        body: "In Setup > App Manager, create a Connected App with OAuth enabled and Enable Client Credentials Flow checked. Under Selected OAuth Scopes, add 'Manage user data via APIs (api)' — without it the token issues but the user query is rejected, so the connection validates yet reads nothing.",
        doc: {
          label: "Salesforce: Configure a Connected App for the Client Credentials Flow",
          href: "https://help.salesforce.com/s/articleView?id=xcloud.connected_app_client_credentials_setup.htm&type=5",
        },
      },
      {
        title: "Set a read-only run-as user",
        body: "Under Manage > Edit Policies > Client Credentials Flow, set the execution user. Use a dedicated integration user with API Enabled and View All Users (read-only) — View All Users is what lets the single query return every active user when User Sharing is on; without it the list comes back empty or partial. LicenseMeter's only query is the user list.",
      },
      {
        title: "Connect",
        body: "Paste your production My Domain URL (https://<org>.my.salesforce.com) or sandbox My Domain URL (https://<org>.sandbox.my.salesforce.com), plus the consumer key and consumer secret, on the Salesforce connector page. Validated before storage, encrypted at rest.",
      },
    ],
    reads: [
      "The user list: email, name, active flag and license type",
      "Last login per user",
    ],
    neverReads: ["CRM records: no accounts, contacts, opportunities or reports"],
    detects: detectsOf("salesforce"),
    settingsPath: "/app/settings/salesforce",
  },
  {
    slug: "openai",
    name: "OpenAI",
    kind: "api",
    summary:
      "Track your organization's OpenAI API spend by day and catch departed employees still on the console. One admin key, read-only.",
    intro:
      "API spend is invisible until the invoice, and console membership outlives offboarding. With one Admin API key, LicenseMeter backfills up to 180 days of daily cost data and cross-checks every console member against Entra ID.",
    steps: [
      {
        title: "Create an Admin API key",
        body: "An Organization Owner opens platform.openai.com under Settings > Organization > Admin keys and creates a key. Only Owners can create admin keys; regular project API keys do not work here.",
        doc: {
          label: "OpenAI Admin APIs guide",
          href: "https://developers.openai.com/api/docs/guides/admin-apis",
        },
      },
      {
        title: "Connect",
        body: "Paste the key into the single field on the OpenAI connector page. It is validated read-only before storage and encrypted at rest (AES-256-GCM).",
      },
      {
        title: "Let the first sync backfill",
        body: "Up to 180 days of daily cost data and the current console member list arrive with the first sync. Spend appears on the AI costs page in USD, exactly as billed, never converted.",
      },
    ],
    reads: [
      "Console organization members: email and name",
      "Daily cost totals by line item",
    ],
    neverReads: [
      "Prompts, completions or any request content",
      "Your project API keys' secrets or project data",
    ],
    detects: detectsOf("openai"),
    settingsPath: "/app/settings/openai",
  },
  {
    slug: "anthropic",
    name: "Anthropic",
    kind: "api",
    summary:
      "Track your organization's Claude API spend by model and catch departed employees still on the console. One admin key, read-only.",
    intro:
      "With one Admin API key, LicenseMeter backfills around 90 days of daily Claude API cost data and cross-checks every console member against Entra ID.",
    steps: [
      {
        title: "Create an Admin API key",
        body: "An organization admin opens the Claude Console (platform.claude.com) under Organization settings > Admin keys and provisions a key, which starts with sk-ant-admin. Admin keys exist on organization accounts, not on individual ones.",
        doc: {
          label: "Anthropic Admin API documentation",
          href: "https://platform.claude.com/docs/en/manage-claude/admin-api",
        },
      },
      {
        title: "Connect",
        body: "Paste the key into the single field on the Anthropic connector page. Validated read-only before storage, encrypted at rest (AES-256-GCM).",
      },
      {
        title: "Let the first sync backfill",
        body: "Around 90 days of daily cost data by model plus the console member list arrive with the first sync. Spend shows on the AI costs page in USD, exactly as billed.",
        doc: {
          label: "Anthropic Usage and Cost API",
          href: "https://platform.claude.com/docs/en/api/usage-cost-api",
        },
      },
    ],
    reads: [
      "Console organization members: email and name",
      "Daily cost totals by model",
    ],
    neverReads: [
      "Prompts, responses or any request content",
      "Your workspace API keys' secrets",
    ],
    detects: detectsOf("anthropic"),
    settingsPath: "/app/settings/anthropic",
  },
  {
    slug: "chatgpt",
    name: "ChatGPT",
    kind: "import",
    summary:
      "Match your ChatGPT Enterprise or Business member list against Entra ID with a CSV paste. No credentials, no API.",
    intro:
      "ChatGPT seats are bought fast and reviewed rarely. Paste a member table or analytics export if your workspace provides one, and LicenseMeter prices every seat held by someone who is disabled, gone or inactive when the pasted data includes activity dates.",
    steps: [
      {
        title: "Prepare the member data",
        body: "In ChatGPT workspace settings or analytics, use a member table or CSV export if it is available for your workspace. Include the header row so LicenseMeter can detect the available columns.",
        doc: {
          label: "OpenAI: Managing members in ChatGPT Enterprise",
          href: "https://help.openai.com/en/articles/8266401-managing-members-seat-types-roles-and-access-in-chatgpt-enterprise",
        },
      },
      {
        title: "Paste it",
        body: "On the ChatGPT connector page, paste the table or export. Email is required; name, seat type, status and last activity are detected when those columns are present. Comma, semicolon and tab formats all work.",
      },
      {
        title: "Price the seats",
        body: "Set your per-seat price under Licenses & prices (chatgpt:<seat type>) so findings carry your real numbers. Re-import any time. Each paste replaces the previous snapshot.",
      },
    ],
    reads: [
      "Only what is in your paste: member emails, names, seat types, and status or last-active dates when included",
    ],
    neverReads: [
      "Conversations, prompts or anything inside ChatGPT: no ChatGPT credentials are stored at all",
    ],
    detects: detectsOf("chatgpt"),
    settingsPath: "/app/settings/chatgpt",
  },
  {
    slug: "claude",
    name: "Claude",
    kind: "import",
    summary:
      "Match your Claude Team or Enterprise member list against Entra ID with a CSV paste. No credentials, no API.",
    intro:
      "Claude seats follow the same offboarding physics as every other subscription. Paste the member list from the admin settings and LicenseMeter prices every seat held by someone who is disabled, gone or inactive.",
    steps: [
      {
        title: "Export the member list",
        body: "In Claude under Organization settings > Members, copy or export the member table including its header row. Admins on Team and Enterprise plans can access it.",
        doc: {
          label: "Claude: Manage members on Team and Enterprise plans",
          href: "https://support.claude.com/en/articles/13133750-manage-members-on-team-and-enterprise-plans",
        },
      },
      {
        title: "Paste it",
        body: "On the Claude connector page, paste the table. Columns for email, name, status, seat type and last activity are detected automatically; comma, semicolon and tab formats all work.",
      },
      {
        title: "Price the seats",
        body: "Set your per-seat price under Licenses & prices (claude:<seat type>). Re-import any time. Each paste replaces the previous snapshot.",
      },
    ],
    reads: [
      "Only what is in your paste: member emails, names, seat types, status and last-active dates",
    ],
    neverReads: [
      "Conversations, prompts or anything inside Claude: no Claude credentials are stored at all",
    ],
    detects: detectsOf("claude"),
    settingsPath: "/app/settings/claude",
  },
];

export const connectorGuide = (slug: string): ConnectorGuide | undefined =>
  CONNECTOR_GUIDES.find((g) => g.slug === slug);
