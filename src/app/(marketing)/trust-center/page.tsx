import type { Metadata } from "next";

import { siteUrl } from "~/env";

import { TrustCenterView } from "./TrustCenterView";

/*
 * Indexable trust/sales asset like /security and /dpa. English is the
 * x-default; the German version is server-rendered at /de/trust-center and
 * cross-referenced via hreflang. The page itself stays server-side so it can
 * carry metadata and the static JSON-LD breadcrumb without request-time data.
 */
export const metadata: Metadata = {
  title: "Trust Center",
  description:
    "One place for how LicenseMeter handles your data: read-only access, EU data residency, named subprocessors and their certifications, retention, vulnerability management, incident response, business continuity, the SLA and the pre-signed GDPR DPA.",
  alternates: {
    canonical: "/trust-center",
    languages: {
      en: "/trust-center",
      de: "/de/trust-center",
      "x-default": "/trust-center",
    },
  },
};

const BASE = siteUrl();

export default function TrustCenterPage() {
  return (
    <>
      <TrustCenterView lang="en" />
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
                name: "Trust Center",
                item: `${BASE}/trust-center`,
              },
            ],
          }).replaceAll("<", "\\u003c"),
        }}
      />
    </>
  );
}
