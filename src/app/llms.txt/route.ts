import { siteUrl } from "~/env";
import { CONNECTOR_GUIDES } from "~/lib/connectorGuides";
import { SITE_DEFINITION } from "~/lib/site";

/* Curated site map for LLMs (llms.txt convention): a definition, the facts
 * worth citing, and where the details live. Served as a route handler: a
 * public/ file would conflict with App Router metadata routes. */
export const dynamic = "force-static";

export function GET(): Response {
  const base = siteUrl();
  const body = `# LicenseMeter

> ${SITE_DEFINITION}

Operated by Ugurlabs UG and maintained by Ugur Koc, Microsoft MVP for Intune and Security Copilot. Key facts:

- Read-only by design: the connector app holds no write scopes; remediation ships as generated PowerShell scripts that admins review and run themselves.
- Never reads content: no mailboxes, files or messages. License assignments, sign-in activity and usage metadata only.
- EU data residency (Postgres, Frankfurt); disconnecting a workspace deletes all synced data immediately.
- Free for every workspace: all connectors, waste rules, continuous monitoring, reports and exports, with no time limit. MSP portfolios are free too. The optional Pro and MSP plans add support by email, a signed DPA (AVV), an MCP server and 24 months of waste history.
- Works with and without Entra ID P1: detection falls back to Microsoft 365 usage reports when precise sign-in timestamps are unavailable.

## Pages

- [Home](${base}/): product overview, live demo entry and the free waste scan
- [Pricing](${base}/pricing): the Free, Pro and MSP plans with prices, a feature comparison and the two ways to buy (German version at ${base}/de/pricing)
- [For MSPs](${base}/msp): portfolio view across client tenants, consultant consent flow, per-client price books and QBR-ready reports
- [ROI calculator](${base}/roi): estimate the monthly license waste for a tenant by seat count and per-seat cost, computed entirely in the browser
- [Waste patterns](${base}/waste): explainer per detection rule (disabled accounts still licensed, never active, inactive 90+ days, unassigned seats, unused Copilot, licensed guests) with manual PowerShell detection and how LicenseMeter automates it
- [Sample report](${base}/sample-report): what a first scan surfaces, walked through on the synthetic demo tenant (clearly labeled; not a customer story)
- [vs PowerShell audit](${base}/compare/powershell-audit): honest comparison of a manual Get-MgUser/Get-MgSubscribedSku audit with continuous joined-signal detection
- [vs the M365 admin center](${base}/compare/m365-admin-center): what the admin center covers and what it does not (per-seat euro figures, joined activity, offboarding-leak detection)
- [vs Excel tracking](${base}/compare/excel-license-tracking): why license spreadsheets go stale and what live sync plus activity-joined findings add
- [Security](${base}/security): granted scopes, stored data, residency, subprocessors, DPA
- [Trust Center](${base}/trust-center): how data is accessed, where it lives, who processes it, and the documents behind it (German version at ${base}/de/trust-center)
- [DPA](${base}/dpa): pre-signed Art. 28 GDPR data processing agreement, downloadable in English and German (German version at ${base}/de/dpa)
- [FAQ](${base}/faq): the questions IT and security teams ask before granting admin consent
- [Connectors](${base}/connectors): step-by-step setup guides for all ${CONNECTOR_GUIDES.length} connectors (${CONNECTOR_GUIDES.map((g) => g.name).join(", ")})
- [Support](${base}/support): contact the Ugurlabs team by chat or email
- [Status](${base}/status): live operational status for LicenseMeter and the infrastructure it relies on
`;
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
