import type { ConnectorBrand } from "~/components/ConnectorLogo";

export const WORKSPACE_CONNECTORS = [
  {
    id: "microsoft",
    name: "Microsoft 365",
    category: "Licenses",
    method: "API connection",
    description:
      "Your directory, licenses and activity. The foundation for finding waste across your stack.",
    accent: "#e7f5f1",
  },
  {
    id: "adobe",
    name: "Adobe",
    category: "Licenses",
    method: "API connection",
    description:
      "Match Creative Cloud and Acrobat seats to the people who still need them.",
    accent: "#fff0ee",
  },
  {
    id: "zoom",
    name: "Zoom",
    category: "Licenses",
    method: "API connection",
    description:
      "Find paid Zoom seats left with inactive users and former employees.",
    accent: "#edf3ff",
  },
  {
    id: "atlassian",
    name: "Atlassian",
    category: "Licenses",
    method: "API connection",
    description: "Bring Jira and Confluence access into your license review.",
    accent: "#edf4ff",
  },
  {
    id: "salesforce",
    name: "Salesforce",
    category: "Licenses",
    method: "API connection",
    description:
      "See which Salesforce licenses are assigned to inactive or departed users.",
    accent: "#eaf8ff",
  },
  {
    id: "openai",
    name: "OpenAI",
    category: "AI & usage",
    method: "API connection",
    description:
      "Track daily API spend and review who still has access to your organization.",
    accent: "#edf5f1",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    category: "AI & usage",
    method: "API connection",
    description:
      "Follow Claude API costs and check console members against your directory.",
    accent: "#f5f0e8",
  },
  {
    id: "chatgpt",
    name: "ChatGPT",
    category: "AI & usage",
    method: "CSV import",
    description: "Import workspace members to spot unused ChatGPT seats.",
    accent: "#edf5f1",
  },
  {
    id: "claude",
    name: "Claude",
    category: "AI & usage",
    method: "CSV import",
    description:
      "Review Claude workspace seats with a member export from your admin console.",
    accent: "#fbf0e9",
  },
] as const satisfies ReadonlyArray<{
  id: ConnectorBrand;
  name: string;
  category: string;
  method: string;
  description: string;
  accent: string;
}>;

export type WorkspaceConnectorId = (typeof WORKSPACE_CONNECTORS)[number]["id"];
export type ConnectorStatus =
  "available" | "connected" | "imported" | "attention" | "demo";
export type ConnectorSummary = {
  id: WorkspaceConnectorId;
  status: ConnectorStatus;
  detail: string;
};

export function connectorStatus({
  demo,
  connected,
  imported,
  failed,
}: {
  demo: boolean;
  connected: boolean;
  imported?: boolean;
  failed?: boolean;
}): ConnectorStatus {
  if (demo) return "demo";
  if (!connected) return "available";
  if (failed) return "attention";
  return imported ? "imported" : "connected";
}
