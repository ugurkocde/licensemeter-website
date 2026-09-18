---
description: "Choose the sample workspace, a live connection, an instant scan, or a CSV import."
icon: bolt
---

# Getting started

Start with the sample workspace to learn the interface. When you are ready, sign in to work with your own organization's data.

{% stepper %}
{% step %}
## Explore the sample tenant

Open [licensemeter.com](https://www.licensemeter.com) and select **Open the sample tenant**. No provider keys or Microsoft admin consent are needed. The workspace contains fictional users, products, findings, renewals and AI costs.
{% endstep %}
{% step %}
## Follow a finding

In **Overview**, select an item under **Next best actions**, or open **Findings**. Review the affected user or product, the evidence and the estimated monthly impact. The sample workspace is read-only; workflow and connector controls may show previews.
{% endstep %}
{% step %}
## Check the price basis

Open **Licenses & prices**. Notice the distinction between list-price estimates and your own contract prices. In a real workspace, set contract prices before using the figures for procurement decisions.
{% endstep %}
{% step %}
## Choose your data source

Leave the demo and sign in for your own workspace. Open **Connectors**, then choose the appropriate provider. Use the options below for Microsoft data.
{% endstep %}
{% endstepper %}

## Which Microsoft connection fits?

| Route | Suitable for | Refresh behavior |
| --- | --- | --- |
| Managed connector | Continuous monitoring with tenant-wide read access approved by an administrator | Scheduled sync and manual sync |
| Bring your own app | Organizations that manage their own connector registration, where the deployment enables this option | Scheduled sync and manual sync |
| Instant scan | A one-time read while signed in, where enabled | Run another scan to refresh |
| CSV import | A first assessment from admin-center exports without granting API consent | Import fresh exports to refresh |

Sign-in access and provider-data access are separate. Creating a LicenseMeter account does not itself grant access to Microsoft 365 or another vendor.

Continue with [Microsoft 365](../connectors/microsoft.md), [CSV imports](csv-import.md), or the [connector directory](../connectors/README.md).
