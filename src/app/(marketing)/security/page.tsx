import type { Metadata } from "next";

import { siteUrl } from "~/env";

import { SecurityView } from "./SecurityView";

/*
 * Indexable trust/sales asset like /trust-center and /dpa. English is the
 * x-default; the German version is server-rendered at /de/security and
 * cross-referenced via hreflang. The page itself stays server-side so it can
 * carry metadata and the static JSON-LD breadcrumb without request-time data.
 */
export const metadata: Metadata = {
  title: "Security",
  description:
    "How LicenseMeter accesses Microsoft 365 tenants: read-only Graph permissions for the core app, one separately consented write permission for optional Software Metering, EU-hosted data storage, deletion on disconnect, named subprocessors.",
  alternates: {
    canonical: "/security",
    languages: {
      en: "/security",
      de: "/de/security",
      "x-default": "/security",
    },
  },
};

const BASE = siteUrl();

export default function SecurityPage() {
  return (
    <>
      <SecurityView lang="en" />
      <script
        type="application/ld+json"
        // Static breadcrumb; "<" escaped so nothing can terminate the script.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Home", item: BASE },
              {
                "@type": "ListItem",
                position: 2,
                name: "Security",
                item: `${BASE}/security`,
              },
            ],
          }).replaceAll("<", "\\u003c"),
        }}
      />
    </>
  );
}
