import type { WasteRuleId } from "~/server/types";
import { DEMO_FIGURES, demoEuros } from "~/lib/demoFigures";

/**
 * One indexable explainer per Microsoft 365 waste-detection rule, rendered at
 * /waste/<slug>. Every claim is grounded in the codebase: the signal column of
 * the README rules table, the thresholds exported from
 * ~/server/waste/engine.ts (30-day never-active grace, 90-day default
 * inactivity window, 60-day Copilot window, the shelfware exemptions), the
 * graceful-degradation section of the README and the read-only scopes in
 * ~/lib/scopes.ts. Euro figures come exclusively from DEMO_FIGURES, which
 * demoFigures.test.ts recomputes from the demo fixtures and the rules engine.
 * PowerShell snippets were verified against Microsoft Learn (Get-MgUser
 * advanced queries, the signInActivity filter, Get-MgSubscribedSku and the
 * beta getMicrosoft365CopilotUsageUserDetail report).
 */

export type WasteExplainer = {
  slug: string;
  rule: WasteRuleId;
  /** Short name used in index cards, breadcrumbs and cross-links. */
  name: string;
  metaTitle: string;
  metaDescription: string;
  h1: string;
  intro: string;
  /** One-line teaser for the /waste index cards. */
  summary: string;
  what: { heading: string; paragraphs: string[] };
  manual: {
    heading: string;
    intro: string;
    snippet: string;
    notes: string[];
  };
  automatic: { heading: string; paragraphs: string[] };
  cost: { heading: string; paragraphs: string[] };
};

export const WASTE_EXPLAINERS: WasteExplainer[] = [
  {
    slug: "disabled-accounts-still-licensed",
    rule: "disabled_account_with_license",
    name: "Disabled account still licensed",
    metaTitle: "Disabled Microsoft 365 accounts that still hold licenses",
    metaDescription:
      "Why disabled Entra ID accounts keep their Microsoft 365 licenses after offboarding, how to find them with Get-MgUser, and how LicenseMeter flags and prices every one automatically.",
    h1: "Disabled accounts that still hold Microsoft 365 licenses",
    intro:
      "The classic offboarding leak: someone leaves, IT disables the Entra ID account, and the Microsoft 365 licenses stay assigned. The person can no longer sign in, but the seat keeps billing every month until someone notices.",
    summary:
      "The offboarding leak: accountEnabled is false, the licenses stay assigned, the seat keeps billing.",
    what: {
      heading: "Why disabled accounts keep their licenses",
      paragraphs: [
        "Disabling an account and unassigning its licenses are two separate operations in Microsoft 365, and offboarding checklists usually stop at the first. Setting accountEnabled to false blocks sign-in immediately, which is the security-critical step, so it happens reliably. License removal is a billing concern with no security urgency, so it slips: it belongs to a different team, a different runbook or a different quarter.",
        "Group-based licensing makes the leak stickier. If the license came from a group assignment, it stays until the account is removed from the group, and disabled accounts are rarely purged from license groups. The admin center offers no built-in view of disabled-but-licensed users, so leavers accumulate quietly, one or two per departure, until the renewal forces a recount.",
      ],
    },
    manual: {
      heading: "Detect it manually",
      intro:
        "With the Microsoft Graph PowerShell SDK, one filtered query lists every disabled account that still holds at least one license:",
      snippet: `Connect-MgGraph -Scopes 'User.Read.All'
$p = @{
  Filter           = 'accountEnabled eq false and assignedLicenses/$count ne 0'
  ConsistencyLevel = 'eventual'
  CountVariable    = 'c'
  All              = $true
}
Get-MgUser @p | Select-Object DisplayName, UserPrincipalName`,
      notes: [
        "The assignedLicenses/$count clause is a Graph advanced query: it only works with ConsistencyLevel eventual and a count request, which is what the splatted parameters provide.",
        "The output is a list of names. Mapping each account's SKUs to what the seats actually cost, and re-running the check next month, is still on you.",
      ],
    },
    automatic: {
      heading: "How LicenseMeter detects it",
      paragraphs: [
        "The nightly read-only sync pulls every directory user with its enabled state and license assignments (the User.Read.All application permission, read-only like all five scopes). The rule fires when accountEnabled is false and the account holds at least one license, and the finding is priced at the sum of every SKU the account still carries.",
        "The engine evaluates this rule first and then skips the account, so a disabled leaver is never double-counted by the inactivity rules. Because the signal is pure directory data, this detection works in every tenant: it needs no Entra ID P1 and is unaffected by concealed report names, Microsoft's default since 2021.",
      ],
    },
    cost: {
      heading: "What it costs",
      paragraphs: [
        "Every finding carries the full monthly cost of the SKUs the disabled account holds, taken from an editable per-tenant price book prefilled with list-price estimates, because there is no Microsoft API for your negotiated prices.",
        `In the ${DEMO_FIGURES.users}-person sample tenant, ${DEMO_FIGURES.leaverCount} disabled accounts still hold licenses; accounts disabled in the directory but still licensed add up to € ${demoEuros(DEMO_FIGURES.byCategory.leavers)} a month across Microsoft 365 and connected apps.`,
      ],
    },
  },
  {
    slug: "licensed-but-never-active",
    rule: "never_active",
    name: "Licensed but never active",
    metaTitle: "Microsoft 365 licenses assigned to users who were never active",
    metaDescription:
      "How Microsoft 365 seats end up licensed but never used, how to spot empty signInActivity with Graph PowerShell, and how LicenseMeter flags never-active users after a 30-day grace period.",
    h1: "Licensed users who were never active",
    intro:
      "A seat that never started: the license was assigned, the invoice arrived, and the user never signed in and never touched a workload. These accounts look perfectly healthy in the admin center because there is nothing wrong with them, except that nobody is behind them.",
    summary:
      "Seats assigned ahead of onboarding or by a group rule where the user never signed in at all.",
    what: {
      heading: "Where never-active seats come from",
      paragraphs: [
        "Licenses get assigned ahead of onboarding for a start date that moved, for a project that fizzled before kickoff, or by an over-broad group rule that licenses everyone in a department including service and test accounts. The user object exists, the license is consumed, and from the billing side the seat is indistinguishable from a productive one.",
        "Nothing cleans these up on its own. The account never appears in sign-in logs, so activity-based reports simply omit it, and the license report shows it as assigned, which reads as fine. Unless someone explicitly asks which licensed accounts have never been active, the seat renews forever.",
      ],
    },
    manual: {
      heading: "Detect it manually",
      intro:
        "With Entra ID P1 you can read each user's signInActivity through Graph PowerShell and look for licensed accounts where it is empty:",
      snippet: `Connect-MgGraph -Scopes 'User.Read.All', 'AuditLog.Read.All'
Get-MgUser -All -Property 'displayName,userPrincipalName,createdDateTime,signInActivity,assignedLicenses' |
  Where-Object {
    $_.AssignedLicenses.Count -gt 0 -and
    -not $_.SignInActivity.LastSignInDateTime
  } | Select-Object DisplayName, UserPrincipalName, CreatedDateTime`,
      notes: [
        "Reading signInActivity requires an Entra ID P1 or P2 license in the tenant plus the AuditLog.Read.All permission; without P1 the property is unavailable and you have to correlate per-workload usage reports instead.",
        "An empty lastSignInDateTime also occurs when the last sign-in predates April 2020, and a brand-new account has not had a fair chance yet: compare createdDateTime before acting on the list.",
      ],
    },
    automatic: {
      heading: "How LicenseMeter detects it",
      paragraphs: [
        "LicenseMeter joins Entra sign-in activity with per-workload usage reports (Exchange, OneDrive, SharePoint, Teams) into one last-activity timestamp per user. The rule fires when a licensed account has no observed activity from either source and the account is at least 30 days old, a grace period that keeps freshly created accounts from being flagged during onboarding.",
        "The rule needs a reliable per-user activity signal. If the tenant has no Entra ID P1, detection falls back to the per-workload usage reports alone; if report names are also concealed, per-user inactivity rules are skipped entirely and an aggregate finding reports how many users show no activity, with a hint on how to enable identifiable report names.",
      ],
    },
    cost: {
      heading: "What it costs",
      paragraphs: [
        "A never-active finding is priced at the full monthly cost of every SKU the account holds, from the per-tenant price book prefilled with list-price estimates and editable to your negotiated rates.",
        `In the ${DEMO_FIGURES.users}-person sample tenant, never-active and long-inactive seats together waste € ${demoEuros(DEMO_FIGURES.byCategory.idle)} a month across Microsoft 365 and connected apps.`,
      ],
    },
  },
  {
    slug: "inactive-licensed-users",
    rule: "inactive_90d",
    name: "Inactive seat",
    metaTitle: "Inactive Microsoft 365 users who still hold licenses",
    metaDescription:
      "How to find Microsoft 365 users with no sign-in or workload activity for 90+ days using the Graph signInActivity filter, and how LicenseMeter joins sign-ins with usage reports to price every idle seat.",
    h1: "Inactive users still holding Microsoft 365 licenses",
    intro:
      "Seats that went quiet: the user was real and active once, then changed roles, went on leave or moved to another tool, and the licensed account stopped signing in to Exchange, OneDrive, SharePoint and Teams. Without a last-activity check across those workloads, the seat looks fine in the admin center.",
    summary:
      "Users whose last sign-in and workload activity are older than your inactivity window, 90 days by default.",
    what: {
      heading: "Why idle seats stay invisible",
      paragraphs: [
        "Inactivity is a join problem. A user can be absent from the sign-in logs but still show up in a mailbox report, or vice versa, so any single report understates or overstates the problem. Judging a seat idle honestly means taking the most recent of the sign-in timestamp and the per-workload last-activity dates, per user, and comparing that against a threshold.",
        "Role changes, long leaves, contractors who rolled off without a leaver process, shared accounts whose purpose ended: none of these disable the account, so the offboarding checks never trigger. The license renews monthly against an account nobody uses.",
      ],
    },
    manual: {
      heading: "Detect it manually",
      intro:
        "With Entra ID P1, Graph supports filtering users by their last sign-in timestamp directly:",
      snippet: `Connect-MgGraph -Scopes 'User.Read.All', 'AuditLog.Read.All'
$cutoff = (Get-Date).AddDays(-90).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
Get-MgUser -All -Filter "signInActivity/lastSignInDateTime le $cutoff" -Property 'displayName,userPrincipalName,signInActivity' |
  Select-Object DisplayName, UserPrincipalName`,
      notes: [
        "Graph does not allow combining the signInActivity filter with other filterable properties, so restricting the list to licensed users happens client-side, and users who never signed in at all are not matched by this filter.",
        "lastSignInDateTime counts interactive sign-in attempts including failed ones; sign-ins are not the whole picture either, so a thorough audit also pulls the Exchange, OneDrive, SharePoint and Teams usage reports and takes the most recent activity per user.",
      ],
    },
    automatic: {
      heading: "How LicenseMeter detects it",
      paragraphs: [
        "The nightly sync joins sign-in activity with the Exchange, OneDrive, SharePoint and Teams usage reports into a single last-activity timestamp per user. The rule fires when that timestamp is older than the workspace's inactivity window: 90 days by default, adjustable per workspace between 30 and 180 days, and each finding's title states the exact day count.",
        "Detection degrades gracefully instead of failing. Without Entra ID P1, signInActivity is unavailable and inactivity falls back to the per-workload usage reports. If the tenant also conceals report display names, per-user findings are impossible, so the engine emits one aggregate finding stating how many of the tenant's users show no activity, along with the admin-center setting that restores per-user detail.",
      ],
    },
    cost: {
      heading: "What it costs",
      paragraphs: [
        "Each inactive user is priced at the full monthly cost of every SKU they hold, from the editable per-tenant price book prefilled with list-price estimates. That turns a list of stale accounts into a monthly euro figure finance can act on.",
        `In the ${DEMO_FIGURES.users}-person sample tenant, idle and never-active seats together waste € ${demoEuros(DEMO_FIGURES.byCategory.idle)} a month across Microsoft 365 and connected apps.`,
      ],
    },
  },
  {
    slug: "unassigned-microsoft-365-licenses",
    rule: "shelfware",
    name: "Unassigned paid seats",
    metaTitle: "Unassigned Microsoft 365 licenses (shelfware)",
    metaDescription:
      "Find unused Microsoft 365 licenses by comparing purchased and assigned seats per SKU with Get-MgSubscribedSku.",
    h1: "Unassigned Microsoft 365 licenses, the shelfware problem",
    intro:
      "Unused Microsoft 365 licenses show up as purchased seats assigned to nobody or as seats still assigned to disabled, inactive, or never-active accounts. At the subscription level, find unassigned paid seats by comparing prepaidUnits.enabled with consumedUnits for each SKU using Get-MgSubscribedSku. This page covers unassigned seats, and the related explainers cover licenses still assigned to users.",
    summary:
      "Purchased seats assigned to nobody: prepaid units minus consumed units, per SKU.",
    what: {
      heading: "Where shelfware comes from",
      paragraphs: [
        "Renewals get sized for headroom that never materializes, a hiring plan slips after the true-up, a project ends and its seats are unassigned but not cancelled, or a bundle purchase brings more seats of a SKU than the team that needed it. The unassigned seats sit on the subscription, invisible in any per-user view, and bill in full.",
        "The raw purchased-minus-assigned arithmetic is also misleading if taken naively. Microsoft auto-provisions free and viral SKUs into every tenant, such as WINDOWS_STORE with a million prepaid units or FLOW_FREE, and capacity-style allotments of thousands of units are licensing plumbing rather than purchases. A useful shelfware number has to exclude those.",
      ],
    },
    manual: {
      heading: "Detect it manually",
      intro:
        "Get-MgSubscribedSku returns purchased and assigned counts per SKU; the difference is your unassigned seat count:",
      snippet: `Connect-MgGraph -Scopes 'Organization.Read.All'
Get-MgSubscribedSku | Select-Object SkuPartNumber,
  @{ n = 'Purchased'; e = { $_.PrepaidUnits.Enabled } },
  ConsumedUnits,
  @{ n = 'Unassigned'; e = { $_.PrepaidUnits.Enabled - $_.ConsumedUnits } }`,
      notes: [
        "Ignore the free and viral rows before drawing conclusions: WINDOWS_STORE, FLOW_FREE, POWERAPPS_VIRAL, TEAMS_EXPLORATORY and similar SKUs show huge prepaid counts that represent no purchase and carry no cost.",
        "The output speaks in SKU part numbers, not prices. Turning the unassigned counts into a monthly euro figure means mapping every SKU to your contract price by hand, and repeating that every run.",
      ],
    },
    automatic: {
      heading: "How LicenseMeter detects it",
      paragraphs: [
        "The sync reads subscribed SKUs through the read-only LicenseAssignment.Read.All permission and computes prepaidUnits.enabled minus consumedUnits per SKU. Free, viral and capacity-style SKUs are excluded by a curated exemption list plus a 5,000-unit capacity threshold, a guard added after the first live tenant sync showed how much noise Microsoft's auto-provisioned allotments create.",
        "Because the signal is pure subscription data, shelfware detection works in every tenant: it needs no Entra ID P1 and is unaffected by concealed report names. Findings persist across nightly syncs, so a count that keeps growing is visible as a trend rather than a one-off snapshot.",
      ],
    },
    cost: {
      heading: "What it costs",
      paragraphs: [
        "A shelfware finding is priced as the unassigned seat count times the SKU's monthly price from the per-tenant price book, prefilled with list-price estimates because Microsoft offers no API for your negotiated pricing, and editable to your actual rates.",
        `In the ${DEMO_FIGURES.users}-person sample tenant, unassigned paid seats waste € ${demoEuros(DEMO_FIGURES.byCategory.shelfware)} a month, the largest single category in the demo workspace.`,
      ],
    },
  },
  {
    slug: "unused-copilot-licenses",
    rule: "copilot_unused",
    name: "Copilot seat unused",
    metaTitle: "Unused Microsoft 365 Copilot licenses",
    metaDescription:
      "How to find assigned Microsoft 365 Copilot seats with no Copilot activity using the Graph usage report, and how LicenseMeter flags Copilot licenses idle for more than 60 days.",
    h1: "Unused Microsoft 365 Copilot licenses",
    intro:
      "Copilot is one of the most expensive per-seat add-ons in Microsoft 365, and it was often bought in batches for pilots and rollouts. A Copilot seat whose user stopped prompting months ago costs the full add-on price every month, on top of the base license that is actually being used.",
    summary:
      "Copilot add-on seats with no Copilot activity in 60 days, or none ever.",
    what: {
      heading: "Why Copilot seats go idle",
      paragraphs: [
        "Copilot adoption is uneven by nature: some users make it part of every document, others try it for a week and quietly stop. Pilots get provisioned optimistically, rollout waves license whole departments, and the seats of the non-adopters keep billing at full price while their Word and Teams usage looks perfectly healthy.",
        "Ordinary activity monitoring misses this completely. The user signs in daily and uses every workload, so no inactivity rule fires; only the Copilot-specific usage signal reveals that the add-on itself is untouched.",
      ],
    },
    manual: {
      heading: "Detect it manually",
      intro:
        "Microsoft Graph exposes a per-user Copilot usage report (beta) with a last-activity date per Copilot app. Export it and cross-check against your Copilot license assignments:",
      snippet: `Connect-MgGraph -Scopes 'Reports.Read.All'
$uri = 'https://graph.microsoft.com/beta/reports/getMicrosoft365CopilotUsageUserDetail(period=''D90'')?$format=text/csv'
Invoke-MgGraphRequest -Method GET -Uri $uri -OutputFilePath copilot-usage.csv`,
      notes: [
        "The endpoint lives on the beta Graph version and reports a Last Activity Date per user and per Copilot app (Teams, Word, Excel, PowerPoint, Outlook, OneNote, Loop, Copilot Chat).",
        "Since 2021 Microsoft conceals user names in usage reports by default, so the CSV may come back pseudonymized; the setting lives in the Microsoft 365 admin center under Org settings, Reports. You still have to join the report against license assignments yourself.",
      ],
    },
    automatic: {
      heading: "How LicenseMeter detects it",
      paragraphs: [
        "The sync reads the Copilot usage report through the read-only Reports.Read.All permission and joins it against license assignments. The rule fires for any user holding the Copilot SKU whose last Copilot activity is more than 60 days old, or who never used Copilot at all.",
        "If the tenant conceals report names, the per-user join is impossible, so the engine degrades to an aggregate finding instead: how many of the tenant's Copilot seats show no usage, priced as that count times the Copilot seat price. The settings page explains how to enable identifiable report names to get back to per-user findings.",
      ],
    },
    cost: {
      heading: "What it costs",
      paragraphs: [
        "Each idle Copilot seat is priced at the Copilot add-on's monthly price from the per-tenant price book, prefilled with a list-price estimate and editable to your contract rate. Because the add-on price is high and constant per seat, even a handful of idle seats produces a figure worth acting on.",
        `In the ${DEMO_FIGURES.users}-person sample tenant, unused Copilot seats waste € ${demoEuros(DEMO_FIGURES.byCategory.copilotUnused)} a month.`,
      ],
    },
  },
  {
    slug: "licensed-guest-accounts",
    rule: "licensed_guest",
    name: "Licensed guest account",
    metaTitle: "Guest accounts holding paid Microsoft 365 licenses",
    metaDescription:
      "Why external guest accounts sometimes end up with paid Microsoft 365 licenses, how to list them with a Get-MgUser advanced query, and how LicenseMeter flags every licensed guest.",
    h1: "Guest accounts holding paid Microsoft 365 licenses",
    intro:
      "Guest accounts exist so external people can collaborate in Teams and SharePoint without a seat in your tenant. When a guest ends up holding a paid license anyway, you are paying for an external user who usually should not consume one, and often for a collaboration that ended long ago.",
    summary:
      "External accounts with userType Guest that hold paid licenses from your tenant.",
    what: {
      heading: "How guests end up licensed",
      paragraphs: [
        "Most guest collaboration needs no license assigned in your tenant: sharing settings and the guest's own organization cover the common Teams and SharePoint scenarios. Paid licenses land on guests anyway, through group-based licensing rules that match external accounts, through a manual assignment made to unblock a project, or through a contractor setup that outlived the contract.",
        "Because guests sit outside the joiner-mover-leaver process, nobody offboards them when the engagement ends. The account stays enabled, the license stays assigned, and no internal process ever touches it again.",
      ],
    },
    manual: {
      heading: "Detect it manually",
      intro:
        "A Graph advanced query lists every guest account that holds at least one license:",
      snippet: `Connect-MgGraph -Scopes 'User.Read.All'
$p = @{
  Filter           = 'userType eq ''Guest'' and assignedLicenses/$count ne 0'
  ConsistencyLevel = 'eventual'
  CountVariable    = 'c'
  All              = $true
}
Get-MgUser @p | Select-Object DisplayName, UserPrincipalName, UserType`,
      notes: [
        "Filtering on userType and on assignedLicenses/$count are both Graph advanced-query features, so the ConsistencyLevel eventual header and the count request are required. The single-quoted filter keeps PowerShell from expanding $count, with the inner quotes around Guest doubled.",
        "Review the list before removing anything: a few guest licensing setups are deliberate, such as externally licensed contractors. The point is that each one should be a decision, not a leftover.",
      ],
    },
    automatic: {
      heading: "How LicenseMeter detects it",
      paragraphs: [
        "The directory sync carries each user's userType, and the rule fires when an account with userType Guest holds at least one license. The finding is priced at the sum of every SKU the guest carries.",
        "Like the disabled-account and shelfware rules, this is pure directory data: it works without Entra ID P1 and is unaffected by concealed report names, so licensed guests are caught in every tenant configuration.",
      ],
    },
    cost: {
      heading: "What it costs",
      paragraphs: [
        "Each licensed guest is priced at the full monthly cost of the SKUs assigned to the account, from the editable per-tenant price book prefilled with list-price estimates.",
        `In the ${DEMO_FIGURES.users}-person sample tenant, paid licenses on guest accounts waste € ${demoEuros(DEMO_FIGURES.byCategory.guests)} a month.`,
      ],
    },
  },
];

export const wasteExplainer = (slug: string): WasteExplainer | undefined =>
  WASTE_EXPLAINERS.find((e) => e.slug === slug);
