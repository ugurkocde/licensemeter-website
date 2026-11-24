import type { Metadata } from "next";

import { publicSiteUrl } from "~/env";
import { DPA } from "~/lib/dpa";

import { DpaView } from "./DpaView";

/*
 * Unlike the other legal pages (privacy/terms/cookies are noindex), the DPA is
 * an indexable trust/sales asset like /security: enterprise buyers search for
 * "LicenseMeter DPA". English is the x-default; the German version is
 * server-rendered at /de/dpa and cross-referenced via hreflang.
 *
 * Reminder: the DPA text is a structured Art. 28 draft, not legal advice - see
 * the header of ~/lib/dpa. Have counsel review before relying on it.
 */
export const metadata: Metadata = {
  title: "Data Processing Agreement (DPA / AVV)",
  description: DPA.en.metaDescription,
  alternates: {
    canonical: "/dpa",
    languages: {
      en: "/dpa",
      de: "/de/dpa",
      "x-default": "/dpa",
    },
  },
};

const BASE = publicSiteUrl();

export default function DpaPage() {
  return (
    <>
      <DpaView lang="en" />
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
                name: "Data Processing Agreement",
                item: `${BASE}/dpa`,
              },
            ],
          }).replaceAll("<", "\\u003c"),
        }}
      />
    </>
  );
}
