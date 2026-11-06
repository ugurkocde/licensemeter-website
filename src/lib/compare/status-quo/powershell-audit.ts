import { LICENSEMETER_CLAIMS as LM } from "../licensemeter";
import type { StatusQuoComparison } from "../types";

/*
 * Script cells describe what Get-MgUser, Get-MgSubscribedSku and the Graph
 * reports return. LicenseMeter cells come from ../licensemeter.ts, except
 * where the dimension only exists on this page; those are grounded in the
 * rules (~/lib/rules.ts) and the read-only scopes (~/lib/scopes.ts).
 */
export const powershellAudit: StatusQuoComparison = {
  slug: "powershell-audit",
  title: "LicenseMeter vs a manual PowerShell audit",
  themLabel: "Manual PowerShell",
  rows: [
    {
      dimension: "Cost",
      them: "Free, apart from the hours it takes to write, run and interpret the output.",
      licensemeter: LM.cost,
    },
    {
      dimension: "Data gathering",
      them: "Separate calls: Get-MgUser for accounts, Get-MgSubscribedSku for seat counts, audit logs for sign-ins, usage reports per workload. You join the results yourself.",
      licensemeter: LM.perUserJoin,
    },
    {
      dimension: "Sign-in activity",
      them: "signInActivity needs Entra ID P1. Without it, your script has to fall back to workload reports, and you have to build that fallback.",
      licensemeter:
        "Same Graph constraint, handled for you: without P1, inactivity detection automatically falls back to per-workload usage reports.",
    },
    {
      dimension: "Cost figures",
      them: "SKU GUIDs and part numbers. Mapping them to what a seat actually costs is a manual lookup you repeat every run.",
      licensemeter: LM.costFigures,
    },
    {
      dimension: "Cadence",
      them: "Runs when someone remembers to run it. Between runs, new leavers and new idle seats bill unnoticed.",
      licensemeter: LM.cadence,
    },
    {
      dimension: "Findings workflow",
      them: "Console output or a CSV you triage in a spreadsheet. Re-running the script forgets what you already decided.",
      licensemeter: LM.findingsWorkflow,
    },
    {
      dimension: "Finance handoff",
      them: "You format the export yourself and explain the columns in the email.",
      licensemeter: LM.financeHandoff,
    },
    {
      dimension: "Remediation",
      them: "You write the cleanup script, and you own every line of it.",
      licensemeter: LM.remediation,
    },
    {
      dimension: "Beyond Microsoft 365",
      them: "Graph cmdlets stop at the tenant boundary. Adobe, Zoom or Salesforce seats need separate scripts against separate admin APIs.",
      licensemeter: LM.beyondMicrosoft,
    },
  ],
};
