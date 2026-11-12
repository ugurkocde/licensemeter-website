import type { Metadata } from "next";

import { slaDescription } from "~/lib/sla";

import { SlaView } from "./SlaView";

/*
 * The Service Level Agreement for paid hosted plans. English is the
 * x-default; the German version is server-rendered at /de/sla.
 */
export const metadata: Metadata = {
  title: "Service Level Agreement",
  description: slaDescription("en"),
  alternates: {
    canonical: "/sla",
    languages: { en: "/sla", de: "/de/sla", "x-default": "/sla" },
  },
};

export default function SlaPage() {
  return <SlaView lang="en" />;
}
