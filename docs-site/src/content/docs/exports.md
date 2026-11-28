---
title: "Exports and reports"
description: "Share findings, license inventory, price data and PDF reports with the right audience."
---

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

## Share the executive report

Pro and MSP. On the **Executive report** page, an Owner or Admin can create a read-only link for a CFO or board member who has no LicenseMeter account. The link opens the same one-page report as the PDF, with a PDF download, and names no employees.

| Link type | What it shows |
| --- | --- |
| Snapshot | The report as it was when the link was created. It keeps working until it expires or is revoked, also if the workspace leaves Pro |
| Live | The current report on every visit. It stops working when the workspace is no longer on Pro or MSP |

A link is valid for 7, 30 or 90 days and is shown only once, when it is created: LicenseMeter stores only a fingerprint of it. The list on the page shows each link's name, type, expiry and views. **Revoke** ends a link immediately and stays available on every plan. An unknown, expired or revoked link shows the same "not found" page. Share links are not available in the sample workspace.

## Before sharing a report

Check the workspace, sync timestamp, currency and contract-price coverage. An export can contain names, email addresses and license information, so share it only with the intended audience.

The sample workspace can export demonstration reports. Keep those clearly identified as sample data when showing LicenseMeter to others.

## Remediation scripts

Downloading a script does not run it. Review its target accounts, requested permissions, affected services and proposed operations before execution. Confirm approvals and a recovery plan through your normal administration process. LicenseMeter's own provider connectors remain read-only.

For recurring delivery, review the monthly PDF preference under [Settings](/workspace/settings/). Self-hosted installations need their own configured email service and scheduler.
