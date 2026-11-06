import { excelLicenseTracking } from "./status-quo/excel-license-tracking";
import { m365AdminCenter } from "./status-quo/m365-admin-center";
import { powershellAudit } from "./status-quo/powershell-audit";
import type { StatusQuoComparison } from "./types";

export const REPO_URL = "https://github.com/ugurkocde/licensemeter-website";

/** Every status-quo comparison, in the order the index lists them. */
export const STATUS_QUO_COMPARISONS: readonly StatusQuoComparison[] = [
  m365AdminCenter,
  powershellAudit,
  excelLicenseTracking,
];

/** Repository path of the data file a comparison renders from. */
export const statusQuoSourcePath = (slug: string): string =>
  `src/lib/compare/status-quo/${slug}.ts`;

/** Where a reader can see, and correct, exactly what a page claims. */
export const sourceFileUrl = (repoPath: string): string =>
  `${REPO_URL}/blob/main/${repoPath}`;

/** GitHub's edit view: forks the repo and opens a pull request in one flow. */
export const editFileUrl = (repoPath: string): string =>
  `${REPO_URL}/edit/main/${repoPath}`;

export const statusQuoComparison = (
  slug: string,
): StatusQuoComparison | undefined =>
  STATUS_QUO_COMPARISONS.find((c) => c.slug === slug);
