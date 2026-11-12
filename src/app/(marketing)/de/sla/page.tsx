import type { Metadata } from "next";

import { slaDescription } from "~/lib/sla";

import { SlaView } from "../../sla/SlaView";

/*
 * German edition of /sla: same bilingual content source, server-rendered in
 * German. English stays the x-default; hreflang links the two URLs.
 */
export const metadata: Metadata = {
  title: "Service Level Agreement",
  description: slaDescription("de"),
  alternates: {
    canonical: "/de/sla",
    languages: { en: "/sla", de: "/de/sla", "x-default": "/sla" },
  },
};

export default function SlaPageDe() {
  return <SlaView lang="de" />;
}
