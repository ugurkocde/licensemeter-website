import { marketplaceOfferUrl } from "~/env";
import {
  pricingContent,
  PRICING_PATHS,
  type PricingLang,
} from "~/lib/pricingContent";

/**
 * FAQPage and breadcrumb JSON-LD for one language, generated from the same
 * FAQ items the page renders. "<" is escaped so nothing can terminate the
 * script element.
 */
export const pricingJsonLd = (lang: PricingLang, base: string): string => {
  const c = pricingContent(lang, {
    marketplace: marketplaceOfferUrl() !== null,
  });
  return JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "FAQPage",
        inLanguage: lang,
        mainEntity: c.faq.items.map((item) => ({
          "@type": "Question",
          name: item.q,
          acceptedAnswer: { "@type": "Answer", text: item.a },
        })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: c.breadcrumb.home,
            item: base,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: c.breadcrumb.page,
            item: `${base}${PRICING_PATHS[lang]}`,
          },
        ],
      },
    ],
  }).replaceAll("<", "\\u003c");
};
