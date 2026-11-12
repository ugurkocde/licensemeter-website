import type { Metadata } from "next";

import { siteUrl } from "~/env";

import { SecurityView } from "../../security/SecurityView";

/*
 * German edition of /security: same bilingual content source, but
 * server-rendered in German so crawlers can index it. English stays the
 * x-default; hreflang cross-references the two language URLs.
 */
export const metadata: Metadata = {
  title: "Sicherheit",
  description:
    "Wie LicenseMeter auf Microsoft-365-Tenants zugreift: nur lesende Graph-Berechtigungen für die Kernanwendung, eine separat genehmigte Schreibberechtigung für das optionale Software Metering, Datenhaltung in der EU, jederzeitige Löschung des Workspace, benannte Unterauftragsverarbeiter.",
  alternates: {
    canonical: "/de/security",
    languages: {
      en: "/security",
      de: "/de/security",
      "x-default": "/security",
    },
  },
};

const BASE = siteUrl();

export default function SecurityPageDe() {
  return (
    <>
      <SecurityView lang="de" />
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
                name: "Sicherheit",
                item: `${BASE}/de/security`,
              },
            ],
          }).replaceAll("<", "\\u003c"),
        }}
      />
    </>
  );
}
