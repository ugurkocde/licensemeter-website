---
description: "Establish the live Microsoft connection and verify the first refresh without supplying a client secret."
---

# Connect with managed consent

Use this path when **Grant admin consent** is available. You do not create or paste your own application secret. Microsoft records the permission grant on the LicenseMeter enterprise application in the selected tenant.

## Before granting access

You need Admin or Owner membership in the intended LicenseMeter workspace. The Microsoft approval must be completed by an administrator authorized to grant the requested Graph application permissions, such as a Global Administrator or Privileged Role Administrator. [Microsoft documents the consent roles here](https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/grant-admin-consent).

Consent enables ongoing tenant-wide reads of the [listed directory, license and reporting data](microsoft.md). It grants no connector write permission. To undo future access, disconnect the connector and revoke that application's permissions in Entra. Previously collected data remains until separately deleted.

If another person must approve, coordinate with that administrator and ensure they have the required workspace access before starting their own flow. Do not share your LicenseMeter session or credentials. Confirm the workspace and Microsoft tenant together.

{% stepper %}
{% step %}
## Open the Microsoft connector

Select **Connectors > Microsoft 365** and confirm the active workspace. Select **Grant admin consent**. If the option is missing, ask the installation operator or use another supported [connection path](microsoft.md).
{% endstep %}
{% step %}
## Review Microsoft's approval screen

Use the intended administrator account and tenant. Check the application identity and requested read permissions before accepting. Cancel if the organization or application is unexpected.

The consent response must return to the initiating flow. A consent link is time-limited; if it expires or has already been used, start again from the connector page.
{% endstep %}
{% step %}
## Wait for the first sync

LicenseMeter returns to the Microsoft connector with **Tenant connected** and starts the first sync. It can redirect to Overview after either success or a partial run. Follow [Verify your first sync](../getting-started/first-sync.md) before using the totals.
{% endstep %}
{% step %}
## Establish your baseline

Check Detection capabilities, verify inventory and [enter contract prices](../licenses-and-prices.md). Then follow [Review your first finding](../getting-started/first-review.md). Add other provider connectors after the live Microsoft connection is working.
{% endstep %}
{% endstepper %}

## When consent does not finish

| Message | What to do |
| --- | --- |
| You need to be an admin or owner | Ask the workspace Owner for appropriate access or have an authorized member connect it. |
| Consent declined or incomplete | Review the Microsoft prompt and organization policy with the approving administrator. Retry only when approval is intended. |
| Link expired, already used or invalid | Start again from the connector page, rather than reusing the old Microsoft URL. |
| Tenant already connected to another workspace | Ask that workspace's Admin for an invitation. Do not create a duplicate. |
| Workspace connected to a different tenant | Stop and confirm the active workspace. Do not disconnect an existing tenant just to dismiss the error. |
| Tenant connected but first sync failed | Use the [first-sync recovery steps](../getting-started/first-sync.md); consent success is not proof that reports were collected. |
