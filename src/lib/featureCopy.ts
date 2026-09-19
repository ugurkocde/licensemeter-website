import type { Feature } from "~/server/entitlement";

export type FeatureCopy = {
  label: string;
  /** One sentence for the lock panel. */
  description: string;
};

/** Record<Feature, ...> makes a new Feature without copy a compile error. */
export const FEATURE_COPY: Record<Feature, FeatureCopy> = {
  signedDpa: {
    label: "Signed data processing agreement",
    description:
      "A data processing agreement (AVV) signed with your company, in German or English.",
  },
  history24: {
    label: "24 months of history",
    description:
      "Waste history and trends go back 24 months instead of the 12 months every workspace keeps.",
  },
  mcp: {
    label: "MCP server",
    description:
      "A read-only MCP server that lets an AI assistant query your waste, findings and trends.",
  },
  whiteLabel: {
    label: "White-label reports",
    description: "PDF reports carry your own logo and brand colour.",
  },
  portfolioAlerts: {
    label: "Portfolio alerts",
    description:
      "One set of alerts covers every client tenant, instead of one workspace at a time.",
  },
  mspTeam: {
    label: "MSP team",
    description:
      "One team works across all client tenants, without an invitation per workspace.",
  },
};

export const featureCopy = (feature: Feature): FeatureCopy =>
  FEATURE_COPY[feature];
