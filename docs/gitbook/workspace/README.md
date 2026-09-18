---
description: "Read the overview, investigate the highest-impact findings, and keep workspaces separate."
icon: chart-line
---

# Workspace and dashboard

A workspace contains one set of connected data, prices, members, settings and findings. Check the workspace name in the sidebar before reviewing or changing anything.

<figure><img src="../.gitbook/assets/overview.webp" alt="Overview of the sample workspace with metrics and next best actions"><figcaption><p>LicenseMeter sample workspace. All names, costs and findings shown are demonstration data.</p></figcaption></figure>

## Read the headline metrics

| Metric | Meaning |
| --- | --- |
| Monthly license spend | Assigned seat counts multiplied by the configured monthly product prices |
| Monthly waste | Estimated monthly impact of unresolved findings, based on the price book |
| Annualized waste | Monthly waste multiplied by twelve, assuming nothing changes |
| Open findings | Unresolved findings, including acknowledged items |
| Verified savings (30d) | Monthly impact of findings that a later sync automatically resolved during the last 30 days |

Select **View breakdown** on a metric to inspect its calculation. The figures are estimates, not invoice reconciliation. A resolved finding indicates that its detection condition disappeared; contract terms determine when spend actually falls.

## Decide what to review next

**Next best actions** prioritizes open findings by estimated impact. **Price accuracy** shows how much of the inventory uses your contract prices. **Renewal window** highlights a contract deadline so you can investigate before recommitting seats.

Use **Last synced** to judge data freshness. A recent timestamp does not by itself prove that every provider returned every signal; check [Settings and sync history](settings.md) for limitations or failures.

## Multiple workspaces

Use the workspace switcher when available. **Portfolio** summarizes the workspaces you can access; a workspace with a different currency or incomplete prices needs its own context when comparing totals. Your membership and role apply separately to each workspace.

Next: [Roles and access](roles.md), [Findings](../findings/README.md), or [Renewals](../renewals.md).
