---
description: "Find the cause of missing data, unsuccessful syncs, unexpected prices and read-only controls."
icon: circle-question
---

# Troubleshooting

Start with the workspace name, the last successful sync and the provider's connector status. Those three checks usually establish whether you are seeing stale data, the wrong workspace or a coverage limitation.

| Symptom | What to check |
| --- | --- |
| Controls do not save | Confirm your role and whether you are in the read-only sample workspace. |
| Sign-in works but no Microsoft data appears | Sign-in does not grant provider access. Complete the connector flow, scan or import. |
| Microsoft consent fails | Read the displayed error, confirm the selected tenant and the administrator's ability to grant the requested permissions. Self-hosted operators should also check registered redirect URIs. |
| Sync fails after previously working | Check secret expiry, permission changes and provider availability. Inspect Sync history before retrying. |
| No inactivity findings | Check the source's activity columns, threshold, sign-in capability and report privacy. |
| User appears orphaned | Compare email addresses and aliases across the provider and directory. Check for legitimate external collaborators. |
| Prices or totals look too low | Look for unpriced products and incomplete contract-price coverage. |
| Acknowledged finding still contributes to unresolved totals | Acknowledgement is a review state. A later sync must confirm that the condition disappeared. |
| OpenAI or Anthropic key is rejected | Use the provider's organization admin key, not a regular inference/project key. |
| CSV data looks old | Upload or paste a current export. Imports do not automatically refresh. |
| Self-hosted login does not persist | Use localhost for the local demo; use HTTPS and correct proxy headers for a remote instance. |

## Get support

Open [Support](https://www.licensemeter.com/support) and include the affected page, provider, approximate time and displayed error. Describe the steps that reproduce the problem. Redact credentials, access tokens and personal information from screenshots or logs.

For provider outages, check the [status page](https://status.licensemeter.com). For a self-hosted instance, inspect your own application, database and scheduler logs as described in the [Docker guide](../self-hosting/README.md).

## Common questions

<details><summary>Does LicenseMeter remove licenses automatically?</summary>

No. Provider connectors read data. Remediation occurs separately in your administration tools or through a script you review and run yourself.

</details>

<details><summary>Does free access mean the figures are complete?</summary>

No. Detection quality depends on permissions, provider capabilities, report privacy, source freshness and the prices you enter. Review those factors before relying on a zero finding count or a savings estimate.

</details>

<details><summary>Why do the screenshots differ from my workspace?</summary>

Screenshots use a sample workspace with fictional data. Your role, source capabilities, connection state and application version can change the controls and results you see.

</details>
