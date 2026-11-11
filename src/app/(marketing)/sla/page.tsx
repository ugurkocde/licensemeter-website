import type { Metadata } from "next";

import { SlaView } from "./SlaView";

/*
 * The Service Level Agreement for paid hosted plans. English is the
 * x-default; the German version is server-rendered at /de/sla.
 */
export const metadata: Metadata = {
  title: "Service Level Agreement",
  description:
    "LicenseMeter's SLA for paid plans: 99.5% monthly availability target, service credits, support hours and response times, incident notification within 48 hours, and RTO and RPO of 24 hours.",
  alternates: {
    canonical: "/sla",
    languages: { en: "/sla", de: "/de/sla", "x-default": "/sla" },
  },
};

export default function SlaPage() {
  return <SlaView lang="en" />;
}
