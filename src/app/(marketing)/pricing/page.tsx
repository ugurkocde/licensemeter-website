import type { Metadata } from "next";

import { PricingView } from "~/components/pricing/PricingView";
import { siteUrl } from "~/env";
import { PRICING_CONTENT, PRICING_PATHS } from "~/lib/pricingContent";

import { pricingJsonLd } from "./jsonLd";

/*
 * English is the x-default; the German edition is server-rendered at
 * /de/pricing from the same content module and cross-referenced via hreflang.
 */
export const metadata: Metadata = {
  title: PRICING_CONTENT.en.meta.title,
  description: PRICING_CONTENT.en.meta.description,
  alternates: {
    canonical: PRICING_PATHS.en,
    languages: {
      en: PRICING_PATHS.en,
      de: PRICING_PATHS.de,
      "x-default": PRICING_PATHS.en,
    },
  },
};

export default function PricingPage() {
  return (
    <>
      <PricingView lang="en" />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: pricingJsonLd("en", siteUrl()) }}
      />
    </>
  );
}
