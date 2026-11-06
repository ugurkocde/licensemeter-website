import { LICENSEMETER_CLAIMS as LM } from "../licensemeter";
import type { StatusQuoComparison } from "../types";

/*
 * Admin-center cells are grounded in Microsoft's own documentation
 * (learn.microsoft.com: activity-reports overview, active-users-ww,
 * assign-licenses-to-users, reports-show-anonymous-user-name). LicenseMeter
 * cells come from ../licensemeter.ts, except where the dimension only exists
 * on this page.
 */
export const m365AdminCenter: StatusQuoComparison = {
  slug: "m365-admin-center",
  title: "LicenseMeter vs the Microsoft 365 admin center",
  themLabel: "M365 admin center",
  rows: [
    {
      dimension: "Cost",
      them: "Included with every tenant. The only spend is the admin time it takes to walk the reports.",
      licensemeter: LM.cost,
    },
    {
      dimension: "Assignment counts",
      them: "Authoritative. Billing > Licenses is the source of truth for assigned and unassigned seats per product.",
      licensemeter:
        "Read nightly from the same Graph data. Unassigned paid seats do not just appear in a count: they become priced shelfware findings.",
    },
    {
      dimension: "Activity per user",
      them: "Reports > Usage shows last-activity dates per workload, one report at a time. Microsoft documents that you cannot generate a report for a single account listing which services it uses.",
      licensemeter: LM.perUserJoin,
    },
    {
      dimension: "User names in reports",
      them: "Concealed by default since September 2021. A Global Administrator can re-enable identifiable names tenant-wide under Org Settings > Reports.",
      licensemeter:
        "Reads the same reports, so the same setting applies. With names concealed, usage findings degrade to aggregate counts while directory-based findings stay per user, and the settings page explains the switch.",
    },
    {
      dimension: "Cost figures",
      them: "License counts and usage counts, with no cost attached to either. There is no Microsoft API that exposes your negotiated seat prices.",
      licensemeter: LM.costFigures,
    },
    {
      dimension: "Cadence and alerts",
      them: "The reports are there when you go and look. Nothing emails you when a new idle seat starts billing.",
      licensemeter: LM.cadence,
    },
    {
      dimension: "Offboarding leaks",
      them: "You can filter sign-in-blocked users on the Active users page and check their licenses one by one. Nothing surfaces the pattern for you.",
      licensemeter: LM.offboarding,
    },
    {
      dimension: "Finance handoff",
      them: "Each usage report exports its own CSV, per workload, anonymous by default and without cost columns.",
      licensemeter: LM.financeHandoff,
    },
    {
      dimension: "Remediation",
      them: "Point and click, seat by seat, or scripts you write and maintain yourself.",
      licensemeter: LM.remediation,
    },
    {
      dimension: "Beyond Microsoft 365",
      them: "Stops at the Microsoft bill. Adobe, Zoom, Atlassian, Salesforce and the AI consoles each have their own admin pages.",
      licensemeter: LM.beyondMicrosoft,
    },
  ],
};
