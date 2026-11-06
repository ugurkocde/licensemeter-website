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
