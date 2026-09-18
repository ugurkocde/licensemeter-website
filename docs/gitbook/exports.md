---
description: "Share findings, license inventory, price data and PDF reports with the right audience."
icon: file-export
---

# Exports and reports

LicenseMeter provides exports for analysis and review. Viewer, Admin and Owner roles can read the workspace's exportable data.

| Export | Use |
| --- | --- |
| Findings CSV | Review individual findings and estimated impact outside LicenseMeter |
| License inventory CSV | Inspect product quantities and prices |
| Price book CSV | Maintain consistent product keys and contract prices |
| PDF report | Share a readable workspace summary |
| Audit export | Review recorded workspace actions |
| Remediation script | Prepare supported actions for separate administrative review and execution |

Use **PDF report** on Overview and the export controls on the relevant pages. Exports reflect the data and price basis available when generated. Refresh first if you need current results.

## Before sharing a report

Check the workspace, sync timestamp, currency and contract-price coverage. An export can contain names, email addresses and license information, so share it only with the intended audience.

The sample workspace can export demonstration reports. Keep those clearly identified as sample data when showing LicenseMeter to others.

## Remediation scripts

Downloading a script does not run it. Review its target accounts, requested permissions, affected services and proposed operations before execution. Confirm approvals and a recovery plan through your normal administration process. LicenseMeter's own provider connectors remain read-only.

For recurring delivery, review the monthly PDF preference under [Settings](workspace/settings.md). Self-hosted installations need their own configured email service and scheduler.
