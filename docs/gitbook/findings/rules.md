---
description: "Understand what each finding category signals and where evidence may be incomplete."
icon: list-check
---

# Detection rules

LicenseMeter evaluates the data available to the workspace. A provider that supplies only entitlements cannot support the same inactivity checks as one that supplies activity dates.

| Finding | What to investigate |
| --- | --- |
| Disabled account still licensed | A disabled directory account retains a paid assignment. Check offboarding and retention requirements. |
| Licensed but never active | No usable activity is recorded for the licensed user. Check report coverage and account age. |
| Inactive seat | Activity falls outside the workspace's configured inactivity window. Verify the user's current need. |
| Unassigned paid seats | Purchased capacity exceeds assignments. Check planned onboarding and contract reduction dates. |
| Copilot seat unused | Available Copilot reports do not show expected recent use. Confirm report availability and adoption context. |
| Licensed guest account | A guest has a paid assignment. Confirm whether the workload and collaboration scenario require it. |
| Adobe seat, user disabled in Entra | Adobe entitlement remains while the matched directory account is disabled. |
| Adobe seat without Entra account | No matching directory identity was found for the Adobe seat. Check aliases and external collaborators. |
| Connected app seat, user disabled in Entra | Another provider still lists a seat for a matched disabled directory user. |
| Connected app seat without Entra account | A provider member does not match the directory. Validate email differences and legitimate external access. |
| Connected app seat inactive | The provider supplied an activity date outside the selected window. |
| Suite + standalone double-pay | A suite and a separate product may cover overlapping capabilities. Check the exact entitlement before changing either. |
| Service plans disabled on paid suite | Paid suite services are disabled. Check intentional service-plan policy and the remaining benefits of the suite. |

## Coverage affects conclusions

Concealed report identities prevent reliable joins for some usage-based findings. Sign-in data depends on provider capability and permissions. CSV data is limited to its included columns and export date. A zero finding count is not proof that every possible source of waste was assessed.

Use the finding details and **Settings > Detection capabilities** together. See [report privacy](../troubleshooting/report-privacy.md) for how concealed names affect analysis.
