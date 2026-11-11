import type { Metadata } from "next";

import { SlaView } from "../../sla/SlaView";

/*
 * German edition of /sla: same bilingual content source, server-rendered in
 * German. English stays the x-default; hreflang links the two URLs.
 */
export const metadata: Metadata = {
  title: "Service Level Agreement",
  description:
    "Das SLA von LicenseMeter für kostenpflichtige Tarife: Verfügbarkeitsziel von 99,5 % pro Monat, Servicegutschriften, Supportzeiten und Reaktionszeiten, Benachrichtigung bei Sicherheitsvorfällen binnen 48 Stunden sowie RTO und RPO von 24 Stunden.",
  alternates: {
    canonical: "/de/sla",
    languages: { en: "/sla", de: "/de/sla", "x-default": "/sla" },
  },
};

export default function SlaPageDe() {
  return <SlaView lang="de" />;
}
