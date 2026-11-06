import type { Metadata } from "next";

import { product, roundup } from "./registry";
import type { Lang } from "./types";

const path = (lang: Lang, slug?: string) =>
  `${lang === "de" ? "/de" : ""}/compare${slug ? `/${slug}` : ""}`;

const alternates = (lang: Lang, slug?: string): Metadata["alternates"] => ({
  canonical: path(lang, slug),
  languages: {
    en: path("en", slug),
    de: path("de", slug),
    "x-default": path("en", slug),
  },
});

/** Metadata for the compare index in an edition. */
export const compareIndexMetadata = (lang: Lang): Metadata => ({
  title: lang === "de" ? "LicenseMeter im Vergleich" : "Compare LicenseMeter",
  description:
    lang === "de"
      ? "Ehrliche Vergleiche von LicenseMeter mit CoreView, CIPP, Zylo, Torii und weiteren Tools sowie Übersichten zu Microsoft-365-, Open-Source- und Copilot-Lizenztools."
      : "Honest comparisons of LicenseMeter with CoreView, CIPP, Zylo, Torii and more, plus roundups of Microsoft 365, open-source and Copilot license tools.",
  alternates: alternates(lang),
});

/** Metadata for a vendor page or roundup; undefined for an unknown slug. */
export const compareSlugMetadata = (
  lang: Lang,
  slug: string,
): Metadata | undefined => {
  const r = roundup(slug);
  if (r) {
    return {
      title: r.title[lang],
      description: r.description[lang],
      alternates: alternates(lang, slug),
    };
  }
  const p = product(slug);
  if (p?.headToHead) {
    return {
      title:
        lang === "de"
          ? `LicenseMeter vs. ${p.name}`
          : `LicenseMeter vs ${p.name}`,
      description:
        lang === "de"
          ? `Ein ehrlicher Vergleich von LicenseMeter und ${p.name}: wo ${p.name} stärker ist, eine belegte Funktionstabelle, Preise und für wen sich was eignet.`
          : `An honest comparison of LicenseMeter and ${p.name}: where ${p.name} is stronger, a sourced feature table, pricing, and who should pick which.`,
      alternates: alternates(lang, slug),
    };
  }
  return undefined;
};
