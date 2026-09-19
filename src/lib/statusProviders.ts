/**
 * Infrastructure providers surfaced on /status. These are the subprocessors
 * from src/lib/dpa.ts that publish a machine-readable status feed, so the
 * status page can show their live health instead of a static claim. Keep the
 * list a subset of the definitive subprocessor list in dpa.ts.
 *
 * All three publish the Atlassian Statuspage v2 schema:
 *   { status: { indicator: "none"|"minor"|"major"|"critical"|"maintenance",
 *               description: string } }
 * Verified live against each endpoint.
 */

export type StatusLevel =
  | "operational"
  | "degraded"
  | "partial"
  | "outage"
  | "maintenance"
  | "unknown";

export type StatusProvider = {
  key: string;
  name: string;
  purpose: string;
  location: string;
  /** Atlassian Statuspage v2 status.json endpoint. */
  statusApiUrl: string;
  /** Human-facing status page for the "details" link. */
  statusPageUrl: string;
};

export const STATUS_PROVIDERS: StatusProvider[] = [
  {
    key: "vercel",
    name: "Vercel",
    purpose: "Application hosting and edge network",
    location: "EU (Frankfurt function region)",
    statusApiUrl: "https://www.vercel-status.com/api/v2/status.json",
    statusPageUrl: "https://www.vercel-status.com",
  },
  {
    key: "supabase",
    name: "Supabase",
    purpose: "Primary database (Postgres)",
    location: "EU (AWS eu-central-1, Frankfurt)",
    statusApiUrl: "https://status.supabase.com/api/v2/status.json",
    statusPageUrl: "https://status.supabase.com",
  },
  {
    key: "resend",
    name: "Resend",
    purpose: "Transactional email",
    location: "EU (Ireland region)",
    statusApiUrl: "https://resend-status.com/api/v2/status.json",
    statusPageUrl: "https://resend-status.com",
  },
];

/**
 * Subprocessors without a public machine-readable feed. Sign-in depends on
 * Microsoft Entra ID, but Microsoft 365 / Entra status needs tenant-admin auth,
 * so it is a link-out rather than a live dot.
 */
export const EXTERNAL_STATUS_LINKS = [
  {
    key: "microsoft",
    name: "Microsoft 365 / Entra ID",
    purpose: "Sign-in (Microsoft Entra ID) and Microsoft Graph API",
    location: "EU Data Boundary; US fallback",
    statusPageUrl: "https://status.cloud.microsoft/",
  },
];

/** Map an Atlassian Statuspage indicator to our internal level. */
export function indicatorToLevel(indicator: string): StatusLevel {
  switch (indicator) {
    case "none":
      return "operational";
    case "minor":
      return "degraded";
    case "major":
      return "partial";
    case "critical":
      return "outage";
    case "maintenance":
      return "maintenance";
    default:
      return "unknown";
  }
}

/** Severity ranking so the overall status can be the worst of its parts. */
const RANK: Record<StatusLevel, number> = {
  operational: 0,
  maintenance: 1,
  unknown: 1,
  degraded: 2,
  partial: 3,
  outage: 4,
};

export function worstLevel(levels: StatusLevel[]): StatusLevel {
  return levels.reduce<StatusLevel>(
    (acc, level) => (RANK[level] > RANK[acc] ? level : acc),
    "operational",
  );
}
