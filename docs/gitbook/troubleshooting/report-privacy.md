---
description: "Understand how concealed report names and unavailable signals limit per-user findings."
icon: shield-halved
---

# Report privacy and detection coverage

Microsoft usage reports can conceal user identities. When LicenseMeter cannot match a report row to a directory user, it cannot make the same user-level activity assessment from that row.

Check **Settings > Detection capabilities** for **Identifiable usage reports**, **Entra ID P1 sign-in activity** and **Copilot usage data**. An unavailable capability explains a limit in the evidence; it is not evidence that the tenant has no unused licenses.

## What remains available

Directory state, assigned licenses and purchased seat counts can still support relevant findings when activity reports are incomplete. Imported data supports only the columns and time period in the export. Adobe entitlements do not provide an inactivity signal.

## Before changing report privacy

Changing Microsoft's report privacy setting affects reporting across the organization and can expose user-identifiable activity to people authorized to view those reports. It is a tenant-wide privacy decision, not a LicenseMeter-only preference.

If your organization approves that change, an authorized administrator can review **Microsoft 365 admin center > Settings > Org settings > Reports**. Record the previous setting and the reason. To reverse the setting, re-enable concealed identities in the same Reports settings. Previously downloaded exports or data already collected by reporting tools are not erased by switching it back.

LicenseMeter's connector only reads the report-privacy setting through **ReportSettings.Read.All**; it does not change it. Keeping names concealed is valid when your organization's privacy requirements call for it. Treat the resulting detection limits explicitly in your reviews.

See [Microsoft usage report privacy guidance](https://learn.microsoft.com/microsoft-365/admin/activity-reports/activity-reports?view=o365-worldwide) and your internal privacy policy before deciding.
