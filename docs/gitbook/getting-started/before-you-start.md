---
description: "Prepare the right workspace, access, data source and prices before connecting."
---

# Before you start

You need a LicenseMeter identity and access to the workspace you intend to use. Microsoft administrator rights are separate: being a LicenseMeter Owner does not give you permission to grant Microsoft consent, and being a Microsoft administrator does not automatically make you a LicenseMeter member.

## Prepare these items

| Item | Why you need it |
| --- | --- |
| Intended sign-in email | Invitations match the invited identity; using another address can leave you in a different workspace. |
| Existing workspace owner, if there is one | Ask for an invitation before connecting the same Microsoft tenant again. One Microsoft tenant cannot be bound to two workspaces. |
| Microsoft tenant to assess | Confirm the organization in Microsoft's dialog, especially if you administer several customers. |
| LicenseMeter Admin or Owner for live setup | Viewers can review results but cannot configure connectors or run refreshes. |
| Appropriate Microsoft consent administrator | The managed path requests tenant-wide Microsoft Graph application permissions. Your tenant's approval policies still apply. |
| Contract prices and currency | Default prices are estimates. Prepare the monthly equivalent per seat for your products. |
| Authorized CSV exports, if using import | A user export is required; a usage export is optional. Each file must be 5 MB or smaller. |

For Microsoft's requirements, see [granting tenant-wide admin consent](https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/grant-admin-consent). A Privileged Role Administrator can grant Microsoft Graph application permissions; the product also supports the Global Administrator consent path. Application Administrator and Cloud Application Administrator alone cannot approve Microsoft Graph application permissions.

## Choose a data route

| Route | Prepare | Refresh | Additional provider connectors |
| --- | --- | --- | --- |
| [Managed connection](../connectors/microsoft-managed.md) | Workspace access and Microsoft admin consent | Scheduled and manual sync | Available after the live Microsoft connection is established |
| [Bring your own registration](../connectors/microsoft-byo.md) | Tenant/client IDs, an approved app registration, and a secret or certificate | Scheduled and manual sync | Available after the live Microsoft connection is established |
| [CSV import](csv-import.md) | Authorized exports | Upload fresh files | Remain unavailable until live Microsoft is connected |
| [Instant scan](instant-scan.md) | Supported sign-in path, delegated permission approval and sufficient Microsoft access | Run a new scan | Remain unavailable until live Microsoft is connected |

Some deployments hide managed consent, BYO credentials or instant scans. Use the controls your deployment actually offers. If none of the live routes is available, use CSV exports or contact the operator.

## Understand the access you grant

A live connection lets LicenseMeter repeatedly read the approved organization's directory, licensing and reporting data. It does not give the connector permission to remove licenses or edit users. Microsoft records the consent on an enterprise application in your tenant. With BYO, your registration and credentials also remain under your administration.

To stop future access, disconnect the connector and revoke its Microsoft permissions or credentials as appropriate. Previously imported data is not erased by revocation. If the same registration also supports your self-hosted sign-in, removing it can prevent users from signing in: check that dependency and keep a recovery route before retiring it.

Next: [Sign in and find your workspace](sign-in.md).
