import { CONNECTOR_GUIDES } from "~/lib/connectorGuides";
import { SUPPORTED_CURRENCIES } from "~/lib/currency";

/**
 * What the comparison pages say about LicenseMeter itself. Every compare
 * page and every feature table reads its LicenseMeter cells from here, so a
 * shipped feature or a changed default is one edit in one file.
 *
 * Where a claim depends on the product, it is derived from the code that
 * defines it (the connector guides, the currency list) rather than typed out,
 * so the marketing copy cannot drift from what the app does.
 */

/** "A, B and C" */
export const listJoin = (items: readonly string[], and = "and"): string =>
  items.length <= 1
    ? (items[0] ?? "")
    : `${items.slice(0, -1).join(", ")} ${and} ${items.at(-1)}`;

/** Every connector beyond Microsoft 365, in the order the guides list them. */
export const NON_MICROSOFT_CONNECTORS: readonly string[] =
  CONNECTOR_GUIDES.filter((g) => g.slug !== "microsoft").map((g) => g.name);

/** "EUR, USD, GBP and 8 more" */
const currencySummary = (lead: number): string =>
  `${SUPPORTED_CURRENCIES.slice(0, lead).join(", ")} and ${
    SUPPORTED_CURRENCIES.length - lead
  } more`;

export const CURRENCY_SUMMARY = currencySummary(3);

/** LicenseMeter cells shared by the comparison tables. */
export const LICENSEMETER_CLAIMS = {
  cost: "Free for every tenant, including continuous monitoring and exports.",
  costFigures: `Every finding carries a monthly cost from an editable per-tenant price book, prefilled with list-price estimates, in your workspace currency (${CURRENCY_SUMMARY}).`,
  perUserJoin:
    "One nightly sync joins directory status, license assignments, sign-in activity and Exchange, OneDrive, SharePoint and Teams usage into a single per-user picture.",
  cadence:
    "Nightly sync plus manual sync, with full sync history, a weekly digest with the waste number and the largest open findings, and a monthly PDF report.",
  findingsWorkflow:
    "Findings persist across syncs with an acknowledge and reopen workflow, so the seats you have already handled stay handled.",
  financeHandoff:
    "One CSV of all findings with owner, rule and monthly cost, current as of the last sync and written for the finance side of the renewal conversation.",
  offboarding:
    "Disabled accounts still holding paid seats surface automatically as priced findings, including the connected-app seats the same people still hold.",
  remediation:
    "Generates the PowerShell remediation script for the seats you choose. Your IT reviews and runs it; LicenseMeter itself never changes licenses in the tenant.",
  beyondMicrosoft: `Connectors cross-check ${listJoin(NON_MICROSOFT_CONNECTORS)} seats against Entra ID in the same pass.`,
} as const;

export type LicenseMeterClaim = keyof typeof LICENSEMETER_CLAIMS;
