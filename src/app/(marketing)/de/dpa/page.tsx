import type { Metadata } from "next";

import { publicSiteUrl } from "~/env";
import { DPA } from "~/lib/dpa";

import { DpaView } from "../../dpa/DpaView";

/*
 * German edition of /dpa: same single source of truth in ~/lib/dpa, but
 * server-rendered in German so crawlers can index it. English stays the
 * x-default; hreflang cross-references the two language URLs.
 *
 * Reminder: the DPA text is a structured Art. 28 draft, not legal advice - see
 * the header of ~/lib/dpa. Have counsel review before relying on it.
 */
export const metadata: Metadata = {
  title: "Auftragsverarbeitungsvertrag (AVV / DPA)",
  description: DPA.de.metaDescription,
  alternates: {
    canonical: "/de/dpa",
    languages: {
      en: "/dpa",
      de: "/de/dpa",
      "x-default": "/dpa",
    },
  },
};

const BASE = publicSiteUrl();

export default function DpaPageDe() {
  return (
    <>
      <DpaView lang="de" />
      <script
        type="application/ld+json"
        // Static breadcrumb; "<" escaped so nothing can terminate the script.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              {
                "@type": "ListItem",
                position: 1,
                name: "Startseite",
                item: BASE,
              },
              {
                "@type": "ListItem",
                position: 2,
                name: "Auftragsverarbeitungsvertrag",
                item: `${BASE}/de/dpa`,
              },
            ],
          }).replaceAll("<", "\\u003c"),
        }}
      />
    </>
  );
}
