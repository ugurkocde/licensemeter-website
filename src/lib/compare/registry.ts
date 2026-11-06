import { admindroid } from "./products/admindroid";
import { avepointElements } from "./products/avepoint-elements";
import { bettercloud } from "./products/bettercloud";
import { cipp } from "./products/cipp";
import { coreview } from "./products/coreview";
import { enow } from "./products/enow";
import { glpi } from "./products/glpi";
import { itop } from "./products/itop";
import { licensemeter } from "./products/licensemeter";
import { m365AdminCenterProduct } from "./products/m365-admin-center";
import { ralph } from "./products/ralph";
import { snipeIt } from "./products/snipe-it";
import { torii } from "./products/torii";
import { vertice } from "./products/vertice";
import { zylo } from "./products/zylo";
import { bestM365Tools } from "./roundups/best-microsoft-365-license-management-tools";
import { bestOpenSourceTools } from "./roundups/best-open-source-license-management-tools";
import { coreviewAlternatives } from "./roundups/coreview-alternatives";
import { copilotTools } from "./roundups/unused-copilot-license-tools";
import { zyloAlternatives } from "./roundups/zylo-alternatives";
import type { Product, Roundup } from "./types";

/**
 * Every product file and every roundup file. The vendor pages, roundups,
 * index and sitemap all read from here; a test checks each slug has the
 * data file its correction link points at.
 */
export const PRODUCTS: readonly Product[] = [
  licensemeter,
  m365AdminCenterProduct,
  coreview,
  cipp,
  admindroid,
  avepointElements,
  enow,
  zylo,
  torii,
  bettercloud,
  vertice,
  snipeIt,
  glpi,
  itop,
  ralph,
];

export const ROUNDUPS: readonly Roundup[] = [
  bestM365Tools,
  bestOpenSourceTools,
  copilotTools,
  coreviewAlternatives,
  zyloAlternatives,
];

export const product = (slug: string): Product | undefined =>
  PRODUCTS.find((p) => p.slug === slug);

export const roundup = (slug: string): Roundup | undefined =>
  ROUNDUPS.find((r) => r.slug === slug);

/** Products with their own templated head-to-head page. */
export const HEAD_TO_HEAD = (): Product[] =>
  PRODUCTS.filter((p) => p.headToHead);

export const productSourcePath = (slug: string): string =>
  `src/lib/compare/products/${slug}.ts`;

export const roundupSourcePath = (slug: string): string =>
  `src/lib/compare/roundups/${slug}.ts`;

/** Every templated slug under /compare and /de/compare. */
export const templatedCompareSlugs = (): string[] => [
  ...HEAD_TO_HEAD().map((p) => p.slug),
  ...ROUNDUPS.map((r) => r.slug),
];
