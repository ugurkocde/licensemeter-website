import type { Metadata } from "next";

import { PricingView } from "~/components/pricing/PricingView";
import { siteUrl } from "~/env";
import { PRICING_CONTENT, PRICING_PATHS } from "~/lib/pricingContent";

import { pricingJsonLd } from "../../pricing/jsonLd";

/*
 * German edition of /pricing: same content module and view, server-rendered
 * in German so crawlers can index it. English stays the x-default.
 */
export const metadata: Metadata = {
  title: PRICING_CONTENT.de.meta.title,
  description: PRICING_CONTENT.de.meta.description,
  alternates: {
    canonical: PRICING_PATHS.de,
    languages: {
      en: PRICING_PATHS.en,
      de: PRICING_PATHS.de,
      "x-default": PRICING_PATHS.en,
    },
  },
};

export default function PricingPageDe() {
  return (
    <>
      <PricingView lang="de" />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: pricingJsonLd("de", siteUrl()) }}
      />
    </>
  );
}
