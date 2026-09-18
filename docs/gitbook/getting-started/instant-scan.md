---
description: "Use a delegated, one-time Microsoft assessment where your installation offers it."
---

# Run an instant scan

An instant scan reads Microsoft data using the permissions of the account approving that scan. It is an alternative to a continuous app-only connection. The control appears only when the installation has configured this path, and the scan can be started from either hosted account sign-in or the Entra sign-in path.

{% stepper %}
{% step %}
## Confirm the option is available

Open **Connectors > Microsoft 365** and look for **Run an instant scan**. If it is absent, use [CSV import](csv-import.md) for an assessment or choose a [live connection](../connectors/microsoft.md). A self-hosted operator controls which paths are enabled.
{% endstep %}
{% step %}
## Start with the intended identity

Select **Run an instant scan**. Follow Microsoft sign-in and permission approval using the Microsoft account whose tenant you intend to assess. On Entra sign-in installations, that must match the signed-in Microsoft account. With hosted account sign-in, the Microsoft scan establishes tenant access separately from your LicenseMeter login.

The required delegated consent and data access depend on your Microsoft roles and tenant policy. A normal user is not guaranteed to be able to run the scan. If administrator approval is requested, involve the organization's authorized administrator or use approved exports instead.
{% endstep %}
{% step %}
## Review the assessment

After the scan, check the active workspace, source capabilities and prices using the [first-sync checklist](first-sync.md). Run another scan when fresh results are needed.
{% endstep %}
{% endstepper %}

## What this does and does not establish

The application uses scan tokens during the request and does not persist them for a scheduled sync. The imported assessment remains stored in the workspace. Microsoft's consent record is separate from token storage; ending the browser session does not erase imported data or necessarily remove consent. Review the application's permissions in Entra if you need to withdraw approval for future scans.

An instant scan does not enable nightly monitoring or unlock the other provider connectors. Set up managed or BYO Microsoft access for those features.

| Message or situation | Next action |
| --- | --- |
| Scan cancelled or declined | No scan was performed; retry if authorized. |
| Administrator approval required | Ask the appropriate Microsoft administrator or use CSV exports. |
| Approving account does not match | Sign out and use the intended identity consistently. |
| Organization already has a connected workspace | Open it in the switcher or ask its Admin for an invitation. |
| Existing imported workspace needs an admin role | Ask a workspace Admin to refresh it. |

Next: [Review your first finding](first-review.md).
