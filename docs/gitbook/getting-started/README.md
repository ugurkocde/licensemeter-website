---
description: "Go from your first sign-in to a checked, priced finding and a report you can share."
---

# Getting started

Use this guide to set up your own workspace. If you only want to explore, take the separate [sample-workspace tour](sample-workspace.md). No account or provider consent is needed for that tour.

## Choose your starting point

| Your situation | Start here |
| --- | --- |
| You are setting up LicenseMeter for an organization | [Before you start](before-you-start.md), then [Sign in and find your workspace](sign-in.md) |
| A colleague invited you, or you are waiting for approval | [Sign in and find your workspace](sign-in.md) |
| You have Microsoft CSV exports and cannot grant API access | [Import Microsoft CSV exports](csv-import.md) |
| You already have data but are unsure what to do next | [Verify your first sync](first-sync.md), then [Review your first finding](first-review.md) |
| You operate your own installation | [Self-hosting](../self-hosting/README.md), then return here for the user workflow |

## Your first complete workflow

{% stepper %}
{% step %}
## Prepare access

Read [Before you start](before-you-start.md). Decide who will own the workspace, which Microsoft tenant you will assess, and whether you will connect continuously or start with a snapshot.
{% endstep %}
{% step %}
## Sign in and confirm the workspace

[Sign in](sign-in.md) using the identity intended for this workspace. Check the workspace name and your role. A new empty workspace shows **Add your Microsoft 365 directory**. If your organization already uses LicenseMeter, request an invitation instead of creating a duplicate connection.
{% endstep %}
{% step %}
## Add Microsoft data

Choose one path: [managed consent](../connectors/microsoft-managed.md), [your own app registration](../connectors/microsoft-byo.md), [CSV import](csv-import.md), or an [instant scan](instant-scan.md) where available. These are alternatives, not four steps you must complete.

Other provider connectors require a live Microsoft connection. A CSV import or instant scan provides a Microsoft assessment but does not unlock those connectors.
{% endstep %}
{% step %}
## Verify the result

Follow [Verify your first sync](first-sync.md). Check the workspace, source freshness, Sync history and Detection capabilities. Reaching Overview does not prove the sync was complete: partial runs can also take you there.
{% endstep %}
{% step %}
## Set prices and review one finding

Use [Review your first finding](first-review.md) to enter a contract price, inspect the evidence, record a decision and export a report. You can complete this review without changing anything at a provider.
{% endstep %}
{% step %}
## Bring in your team and other sources

[Invite colleagues](../workspace/members.md) with the access they need. For continuous monitoring, add further [connectors](../connectors/README.md) after the live Microsoft connection is working. Review [Settings](../workspace/settings.md) for notifications and sync history.
{% endstep %}
{% endstepper %}

## You are ready when

- You can identify the active workspace and your role.
- You know whether its data is live, imported or from a one-time scan.
- You checked source coverage and the latest sync or import.
- You reviewed the price basis and at least one finding's evidence.
- You know who owns the next action and how to share a report.

Zero findings alone is not a completion criterion. Missing data, permissions or prices can make an incomplete assessment look quiet.
