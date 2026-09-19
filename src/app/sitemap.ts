import type { MetadataRoute } from "next";
import { connection } from "next/server";

import { siteUrl } from "~/env";
import { WASTE_EXPLAINERS } from "~/app/(marketing)/waste/content";
import { CONNECTOR_GUIDES } from "~/lib/connectorGuides";

/** Legal pages: indexable but low priority, they rarely change. */
const LOW_PRIORITY = new Set(["/impressum", "/privacy", "/dpa", "/de/dpa"]);

/** Pages with an English and a German edition; both list each other. */
const LOCALIZED = ["/security", "/trust-center", "/dpa"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (process.env.SELF_HOSTED === "true") {
    await connection();
    return [];
  }
  const base = siteUrl();
  return [
    "",
    "/msp",
    "/pricing",
    "/de/pricing",
    "/roi",
    "/sample-report",
    "/compare/powershell-audit",
    "/compare/m365-admin-center",
    "/compare/excel-license-tracking",
    "/waste",
    ...WASTE_EXPLAINERS.map((e) => `/waste/${e.slug}`),
    "/security",
    "/de/security",
    "/trust-center",
    "/de/trust-center",
    "/faq",
    "/support",
    "/connectors",
    ...CONNECTOR_GUIDES.map((g) => `/connectors/${g.slug}`),
    "/status",
    "/impressum",
    "/privacy",
    "/dpa",
    "/de/dpa",
  ].map((path) => {
    const englishPath = path.startsWith("/de/") ? path.slice(3) : path;
    const localized = LOCALIZED.includes(englishPath);
    return {
      url: `${base}${path}`,
      changeFrequency: LOW_PRIORITY.has(path) ? "yearly" : "weekly",
      priority: path === "" ? 1 : LOW_PRIORITY.has(path) ? 0.3 : 0.7,
      ...(localized && {
        alternates: {
          languages: {
            en: `${base}${englishPath}`,
            de: `${base}/de${englishPath}`,
          },
        },
      }),
    };
  });
}
