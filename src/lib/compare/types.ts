import type { CoreFeatureKey, ExtraFeatureKey, FeatureKey } from "./features";

/** One row of a "LicenseMeter vs doing it yourself" table. */
export type StatusQuoRow = {
  dimension: string;
  them: string;
  licensemeter: string;
};

/**
 * A comparison against a way of working rather than a vendor: a PowerShell
 * audit, the admin center, a spreadsheet. One file per comparison in
 * ./status-quo, named after the page slug.
 */
export type StatusQuoComparison = {
  /** Route segment under /compare, and the data file's name. */
  slug: string;
  title: string;
  /** Column header for the alternative. */
  themLabel: string;
  rows: readonly StatusQuoRow[];
};

export type Lang = "en" | "de";

/** Copy every vendor page shows in both editions. */
export type Localized = { en: string; de: string };

/**
 * "unknown": we looked at the vendor's own pages and found nothing.
 * "unchecked": we did not look, so no claim either way.
 */
export type FeatureValue = "yes" | "no" | "partial" | "unknown" | "unchecked";

export type FeatureEntry = {
  value: FeatureValue;
  note: Localized;
  /** Where the claim comes from: the vendor's own page, or our docs. */
  source?: string;
};

export type ProductCategory =
  "licensemeter" | "microsoft" | "m365" | "smp" | "oss";

/**
 * Everything we say about one product, in one file under ./products. The
 * vendor pages, the roundups and the feature tables all render from it.
 */
export type Product = {
  slug: string;
  name: string;
  url: string;
  category: ProductCategory;
  /** ISO date the vendor's pages were last read for this file. */
  checkedOn: string;
  /** What it is and who it is for, in the vendor's own framing. */
  summary: Localized;
  /** Where it is clearly stronger than LicenseMeter. */
  strengths: readonly Localized[];
  /** Who should pick it over LicenseMeter. */
  pickThemIf: readonly Localized[];
  /** Who should pick LicenseMeter over it. */
  pickUsIf: readonly Localized[];
  pricing: Localized;
  features: Record<CoreFeatureKey, FeatureEntry> &
    Partial<Record<ExtraFeatureKey, FeatureEntry>>;
  /** Open-source projects only. */
  repo?: { url: string; license: string; lastActivity?: string };
  /** Set when a hand-written page covers this product instead of the template. */
  comparePath?: string;
  /** Head-to-head page at /compare/<slug>. Off for products only in roundups. */
  headToHead: boolean;
};

/** One product's place in a roundup. */
export type RoundupEntry = {
  product: string;
  bestFor: Localized;
  verdict: Localized;
};

/**
 * A "best X tools" or "X alternatives" page, one file per roundup under
 * ./roundups, named after its slug. Entries point at product files, so a
 * changed product updates every roundup it appears in.
 */
export type Roundup = {
  slug: string;
  /** For an alternatives page: the product the alternatives are to. It leads the grid but is not a numbered entry. */
  subject?: string;
  title: Localized;
  description: Localized;
  intro: readonly Localized[];
  criteria: readonly Localized[];
  entries: readonly RoundupEntry[];
  /** Rows of the at-a-glance grid. */
  featureKeys: readonly FeatureKey[];
  /** ISO date the roundup was last reviewed. */
  updated: string;
};
