import type { Metadata } from "next";

import { siteUrl } from "~/env";

import { TrustCenterView } from "../../trust-center/TrustCenterView";

/*
 * German edition of /trust-center: same bilingual content source, but
 * server-rendered in German so crawlers can index it. English stays the
 * x-default; hreflang cross-references the two language URLs.
 */
export const metadata: Metadata = {
  title: "Trust Center",
  description:
    "Wie LicenseMeter mit Ihren Daten umgeht, an einem Ort: Nur-Lese-Zugriff, EU-Datenhaltung, benannte Unterauftragsverarbeiter und ihre Zertifizierungen, Aufbewahrung, Umgang mit Schwachstellen, Reaktion auf Sicherheitsvorfälle, Geschäftskontinuität, das SLA und der vorunterzeichnete DSGVO-AVV.",
  alternates: {
    canonical: "/de/trust-center",
    languages: {
      en: "/trust-center",
      de: "/de/trust-center",
      "x-default": "/trust-center",
    },
  },
};

const BASE = siteUrl();

export default function TrustCenterPageDe() {
  return (
    <>
      <TrustCenterView lang="de" />
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
                name: "Trust Center",
                item: `${BASE}/de/trust-center`,
              },
            ],
          }).replaceAll("<", "\\u003c"),
        }}
      />
    </>
  );
}
