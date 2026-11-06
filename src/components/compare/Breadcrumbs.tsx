import { siteUrl } from "~/env";
import type { Lang } from "~/lib/compare/types";

import { compareCopy, comparePath } from "./copy";

/** BreadcrumbList JSON-LD: Home > Compare > page. "<" escaped. */
export const CompareBreadcrumbs = ({
  lang,
  name,
  slug,
}: {
  lang: Lang;
  name?: string;
  slug?: string;
}) => {
  const base = siteUrl();
  const t = compareCopy(lang);
  const items = [
    { name: t.home, item: base },
    { name: t.compareIndex, item: `${base}${comparePath(lang)}` },
    ...(name && slug
      ? [{ name, item: `${base}${comparePath(lang, slug)}` }]
      : []),
  ];
  const ld = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      ...it,
    })),
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(ld).replaceAll("<", "\\u003c"),
      }}
    />
  );
};
