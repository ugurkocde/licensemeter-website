import type { MetadataRoute } from "next";
import { connection } from "next/server";

import { publicSiteUrl } from "~/env";
import { WASTE_EXPLAINERS } from "~/app/(marketing)/waste/content";
import { HEAD_TO_HEAD, ROUNDUPS } from "~/lib/compare/registry";
import { BLOG_POSTS } from "~/lib/blog";
import { CONNECTOR_GUIDES } from "~/lib/connectorGuides";
import { DPA_EFFECTIVE_ISO } from "~/lib/dpa";
import { SLA_TERMS } from "~/lib/sla";

/** Legal pages: indexable but low priority, they rarely change. */
const LOW_PRIORITY = new Set([
  "/impressum",
  "/privacy",
  "/dpa",
  "/de/dpa",
  "/sla",
  "/de/sla",
]);

/** The English paths provide the shared content dates for both editions. */
const COMPARE_DATES = Object.fromEntries([
  ...HEAD_TO_HEAD().map((p) => [`/compare/${p.slug}`, p.checkedOn]),
  ...ROUNDUPS.map((r) => [`/compare/${r.slug}`, r.updated]),
]) as Record<string, string | undefined>;
const COMPARE_PATHS = ["/compare", ...Object.keys(COMPARE_DATES)];

const CONTENT_DATES: Record<string, string | undefined> = {
  ...COMPARE_DATES,
  ...Object.fromEntries(
    BLOG_POSTS.map((p) => [`/blog/${p.slug}`, p.updatedOn ?? p.publishedOn]),
  ),
  "/dpa": DPA_EFFECTIVE_ISO,
  "/sla": SLA_TERMS.effectiveIso,
};

/** Pages with an English and a German edition; both list each other. */
const LOCALIZED = [
  "/pricing",
  "/security",
  "/trust-center",
  "/dpa",
  "/sla",
  ...COMPARE_PATHS,
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (process.env.SELF_HOSTED === "true") {
    await connection();
    return [];
  }
  const base = publicSiteUrl();
  return [
    "",
    "/msp",
    "/pricing",
    "/de/pricing",
    "/roi",
    "/sample-report",
    ...COMPARE_PATHS.flatMap((path) => [path, `/de${path}`]),
    "/compare/powershell-audit",
    "/compare/m365-admin-center",
    "/compare/excel-license-tracking",
    "/blog",
    ...BLOG_POSTS.map((p) => `/blog/${p.slug}`),
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
    "/sla",
    "/de/sla",
  ].map((path) => {
    const englishPath = path.startsWith("/de/") ? path.slice(3) : path;
    const localized = LOCALIZED.includes(englishPath);
    const lastModified = CONTENT_DATES[englishPath];
    return {
      url: `${base}${path}`,
      ...(lastModified && { lastModified }),
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
