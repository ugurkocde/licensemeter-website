import { LICENSEMETER_CLAIMS as LM } from "../licensemeter";
import type { StatusQuoComparison } from "../types";

/*
 * Spreadsheet cells describe failure modes any owner of a license sheet
 * recognizes; no invented statistics. LicenseMeter cells come from
 * ../licensemeter.ts, except where the dimension only exists on this page.
 */
export const excelLicenseTracking: StatusQuoComparison = {
  slug: "excel-license-tracking",
  title: "LicenseMeter vs tracking licenses in Excel",
  themLabel: "Spreadsheet",
  rows: [
    {
      dimension: "Cost",
      them: "Free, apart from the hours spent keeping it honest, and those hours are the whole product.",
      licensemeter: LM.cost,
    },
    {
      dimension: "Freshness",
      them: "Accurate on the day someone updates it, stale the day after. Licenses move without the sheet hearing about it.",
      licensemeter:
        "Synced nightly from the source systems, with manual sync on demand and a full sync history.",
    },
    {
      dimension: "Activity signal",
      them: "None. A spreadsheet records what someone typed, not whether the seat was ever opened.",
      licensemeter:
        "Joins license assignments with sign-in activity and per-workload usage reports, so idle and never-used seats surface with evidence.",
    },
    {
      dimension: "Staff changes",
      them: "Breaks silently. Leavers stay listed as active until someone remembers to edit the row, and nobody is notified that nobody did.",
      licensemeter: LM.offboarding,
    },
    {
      dimension: "Per-seat cost",
      them: "Formulas someone built once and now has to update whenever prices, tiers or seat mixes change.",
      licensemeter: LM.costFigures,
    },
    {
      dimension: "Coverage",
      them: "Whatever columns someone added. Every new vendor means another tab and more manual entry.",
      licensemeter: LM.beyondMicrosoft,
    },
    {
      dimension: "Findings workflow",
      them: "Cell colors and comments, reconciled across the copies of the file that inevitably exist.",
      licensemeter: LM.findingsWorkflow,
    },
    {
      dimension: "Finance handoff",
      them: "Already a spreadsheet, which is genuinely convenient, but the numbers are only as current as the last edit.",
      licensemeter: LM.financeHandoff,
    },
    {
      dimension: "Remediation",
      them: "A to-do column. The actual cleanup happens somewhere else.",
      licensemeter: LM.remediation,
    },
  ],
};
