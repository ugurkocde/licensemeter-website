---
description: "Assign responsibility and track a finding until a later sync verifies the outcome."
icon: clipboard-check
---

# Remediation workflow

The workflow records what your team plans to do. Detection status records whether LicenseMeter still observes the underlying condition. These are separate.

## Track the work

In a finding, an Admin can set:

- **Remediation status:** Not planned, Planned, Remediation requested, or In progress.
- **Assignee:** a member of the current workspace.
- **Due date:** the date by which the decision or action is needed.
- **External ticket URL:** a link to the work item in your service-management system.
- **Notes:** the decision context, approvals or next steps.

Select **Save workflow**. The sample workspace shows **Workflow preview** instead of saving changes.

## Understand the outcome

Acknowledge a finding when it has been reviewed and should remain tracked. Reopen it if it needs attention again. Neither action changes anything at the provider.

After an approved provider-side action, run another sync. LicenseMeter automatically resolves a finding when the relevant condition is no longer present. A resolved finding can contribute to the **Verified savings (30d)** metric; financial savings still depend on the contract and billing cycle.

Before changing Microsoft licenses, identify the affected account and services, check retention and downstream access, and record the current assignments. Reassigning the original license may restore access if a seat remains available, but it does not guarantee recovery of data already deleted under a service's retention rules. Treat exported remediation scripts as a proposal that requires separate review and execution.

See [Exports](../exports.md) for sharing the findings and downloading a remediation script.
