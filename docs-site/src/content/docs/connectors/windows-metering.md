---
title: Windows software metering
description: Enable optional Windows application launch observations with separate consent and an Intune collector.
---

Software Metering reads the output of a customer-deployed Intune Remediations detection script. It shows the last observed launch of selected Windows applications, the observation period, and collection health. It is optional for each workspace.

This feature requires installation setup and a Windows pilot. Your existing Microsoft 365 connection continues to use its original permissions. Workspace users who do not enable metering are not asked for metering permissions.

## What the report means

The initial collector tracks these executable names, case-insensitively:

| Application | Executable |
| --- | --- |
| Microsoft Visio | `VISIO.EXE` |
| Microsoft Project | `WINPROJ.EXE` |
| Adobe Photoshop | `Photoshop.exe` |
| Adobe Illustrator | `Illustrator.exe` |
| Adobe InDesign | `InDesign.exe` |
| SOLIDWORKS | `SLDWORKS.exe` |

All six are collected together. Select an application in LicenseMeter to view or export its observations. Custom catalogues are not supported in this version.

A process launch is evidence that an executable started. It does not measure foreground time, productive work, installation status, license ownership, or activity on another device or platform. Background processes and executables with the same name can affect results. Check the installation and license assignment before taking action. LicenseMeter does not reclaim licenses from this report.

| Evidence | Meaning |
| --- | --- |
| Launch observed | A launch falls within the selected period ending on the report date. |
| No launch observed | The collector reports continuous coverage for the selected 30, 60 or 90 days, with no launch in that period. |
| Building coverage | Collection has not yet covered the selected period. |
| Coverage unknown | No valid output, disabled auditing, collection errors, gaps, or an unsuccessful refresh. |
| Report stale | The report is more than eight days old. |

Missing results never establish inactivity. The default observation period is 60 days. The report includes all Windows devices returned by Intune, so devices outside the collector assignment normally show unknown coverage.

## Prerequisites

- A workspace Admin and an existing Microsoft 365 connection bound to the intended tenant.
- An installation operator who has configured the separate metering application below.
- An administrator permitted to grant Microsoft Graph application permissions, normally a Global Administrator or Privileged Role Administrator.
- Supported Windows devices managed by Intune or co-managed with Configuration Manager, with Microsoft Entra join or hybrid join.
- Qualifying Remediations licensing. Microsoft lists Windows Enterprise E3/E5, Windows Education A3/A5, and Windows VDA per user. Check the current [Remediations requirements](https://learn.microsoft.com/en-us/intune/device-management/tools/deploy-remediations) for your deployment.
- Authority within your organization to enable process auditing and collect device-linked activity metadata.

Microsoft's Remediations guidance advises against collecting personal data through scripts. This collector avoids usernames, command lines, document paths, and raw events in its output, but timestamps linked to device identifiers can still relate to employees. Review that guidance and your organization's privacy requirements before deployment. Do not use this report to evaluate individual employee performance.

## Operator setup: separate application

Create a **new** Microsoft Entra application registration for Software Metering. On the hosted service, the service operator does this once. For self-hosting, the installation operator supplies the registration and environment settings.

1. Select accounts in any organizational directory for a multi-tenant deployment.
2. Add a Web redirect URI of `https://YOUR-APP-HOST/api/connect/metering/callback`. Use the public origin configured for your installation.
3. Under Microsoft Graph, add only these **Application** permissions:
   - `DeviceManagementScripts.Read.All`: discover remediation packages and read their results.
   - `DeviceManagementManagedDevices.Read.All`: read device identifiers, names and operating systems.
4. Remove default permissions that the registration does not need. No Graph write permissions are needed.
5. Create a client secret and configure `METERING_CLIENT_ID` and `METERING_CLIENT_SECRET` in the server environment. Keep the secret server-side and rotate it through your normal process.
6. Deploy the database migration and application together. Docker applies committed migrations on startup. The metering migrations enable row-level security and install policies for the existing application and tenant roles. Hosted operators must apply both the table and policy migrations through their approved schema process before serving the new application. Confirm the policies match any custom role configuration.

Do not reuse the sign-in or Microsoft 365 connector application. Do not add these permissions to the base connector. The implementation rejects a reused application ID and access tokens containing additional application roles.

Microsoft supports incremental consent for delegated permissions. Application-permission consent using `.default` covers the application's configured permissions. A separate application keeps metering consent optional and independently revocable. See [Microsoft's consent model](https://learn.microsoft.com/en-us/entra/identity-platform/consent-types-developer) and [admin consent endpoint](https://learn.microsoft.com/en-us/entra/identity-platform/v2-admin-consent).

The permissions are tenant-wide. Selecting a package limits what LicenseMeter imports; it does not narrow the permission granted to that package. The scripts permission can read other Intune scripts and results. Device reads include metadata for the tenant's managed devices.

## Customer setup

### 1. Enable and consent

Open **Software Metering** in the workspace navigation. Select **Enable Software Metering**, then **Grant metering permissions**. Finish consent in the same browser session, for the tenant already connected to this workspace. LicenseMeter verifies the application's token and read access before accepting the connection.

Consent propagation can take time. If verification fails, wait a few minutes and select **Check metering access**. This also works when a tenant administrator has granted the separate application access directly in Microsoft Entra. The person starting and completing the redirect flow must be an Admin of the same LicenseMeter workspace; invite the consent administrator to the workspace if needed. The ordinary Microsoft 365 connection is independent of this step.

### 2. Enable process auditing

Through your approved Intune settings catalogue or Group Policy, enable **Advanced Audit Policy Configuration > Detailed Tracking > Audit Process Creation > Success**. In Intune, the relevant audit setting may appear as **Audit Process Creation** under **Audit**. Confirm the effective policy on a pilot device; naming and availability depend on your Windows and management configuration.

Command-line collection is not required. Do not enable it solely for this feature. Process auditing increases local Security log volume. Size and retain that log so the collector can read all events between scheduled runs.

Use the locale-independent subcategory ID to inspect the effective policy on the pilot device:

```powershell
auditpol /get /subcategory:"{0CCE922B-69AE-11D9-BED3-505054503030}"
```

The collector checks this policy without changing it. It reads process creation event 4688 and audit-policy changes (4719) from the local Security log. See [Audit Process Creation](https://learn.microsoft.com/en-us/previous-versions/windows/it-pro/windows-10/security/threat-protection/auditing/audit-process-creation).

### 3. Deploy the detection script

Download **Collect-LicenseMeterUsage.ps1** from the setup panel. Review the script, then create an Intune Remediations package with:

- The downloaded file as the detection script, with no remediation script.
- **Run this script using the logged-on credentials: No**, so it runs as SYSTEM.
- **Run script in 64-bit PowerShell: Yes**.
- A daily schedule, initially assigned only to a small Windows pilot group.
- Signature enforcement consistent with your policy. The downloaded script is unsigned; sign it with a trusted organizational certificate if your policy requires signatures.

The script exits with code 0 and emits a small JSON report. It does not remediate devices. Microsoft limits script output to 2,048 characters; the fixed catalogue keeps output within this limit. Do not append diagnostic text or change catalogue keys.

The first run establishes coverage from that moment. It does not reconstruct past months from a short event log. A protected local checkpoint in `%ProgramData%\LicenseMeter\Metering\usage-v1.json` carries launch dates forward across log rollover. Coverage restarts if events were lost before they were read, if the log was reset, or if the audit policy changed. Collection is bounded to 100,000 relevant events and 90 seconds per run; exceeding either limit discards that interval with a coverage gap and advances the checkpoint so the next run can recover. Powering a device off does not by itself reset coverage if all intervening events remain available.

### 4. Select the package and refresh

After the pilot reports to Intune, select **Load remediation packages** in LicenseMeter, choose the package you deployed, set the observation period, and save. Select **Refresh metering**. Configured workspaces also refresh during their normal scheduled sync, when execution time remains.

Verify a known application launch, the device identity, the report date, and coverage health. Then expand the assignment. Changing the selected package deletes the workspace's previous metering observations and history. Intune controls when device results become available; LicenseMeter does not remotely run scripts.

Collections are capped at 50,000 returned rows and 500 pages per resource, with bounded request time. Larger estates require an operator-supported collection strategy before rollout.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Setup is awaiting the operator | Separate metering app environment settings are missing or reuse another application. |
| Consent cannot be verified | Both required application permissions, correct tenant, propagation delay, Intune licensing and access policies. |
| No remediation packages | Create the detection package in the connected tenant, then reload. |
| No collector result | Device assignment, connectivity, Intune reporting, selected package and SYSTEM execution. |
| Enable process auditing | Effective Process Creation Success policy on the device. |
| Building coverage after a gap | Device missed the daily run, Security log rolled over before collection, or local state was reset. |
| Check collection health | Review the collector's health value in Intune. Wrong scripts, malformed output, missing keys and output over 2,048 characters are rejected. |
| Report stale | Device has not supplied a recent valid report. Intune may report unchanged results on a weekly cycle. |
| Refresh failed | Previous observations remain visible for reference but are marked unknown until a successful refresh. |

## Data and removal

LicenseMeter stores Intune device names and identifiers, catalogue keys, last-launch dates, coverage dates, health, and synchronization metadata. It does not store raw event logs or arbitrary script output. Daily aggregate history is pruned to 120 days during each successful refresh. The latest device snapshot remains until the next successful refresh or disconnection; stale records are not treated as inactivity.

To stop the feature:

1. Select **Disable metering**, then confirm deletion. This immediately deletes the workspace's metering connection, pending consent requests, snapshots and history. New reads stop. An already-running request may finish, but cannot restore deleted records.
2. Remove the separate metering application's permission grant or enterprise application in Microsoft Entra. Disabling in LicenseMeter does not revoke Microsoft consent.
3. Unassign the detection package in Intune to stop device collection. Remove its local checkpoint through your approved device process if needed.
4. Review the audit policy separately. Other security tools may rely on it, so do not disable it without checking.

Disconnecting the base Microsoft connection or deleting the workspace also deletes its stored metering data. Neither action unassigns the Windows collector or revokes the separate application's consent automatically.
