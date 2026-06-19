import { siteUrl } from "~/env";
import { SITE_DEFINITION } from "~/lib/site";

/* Curated site map for LLMs (llms.txt convention): a definition, the facts
 * worth citing, and where the details live. Served as a route handler: a
 * public/ file would conflict with App Router metadata routes. */
export const dynamic = "force-static";

export function GET(): Response {
  const base = siteUrl();
  const body = `# LicenseMeter

> ${SITE_DEFINITION}

Operated by UgurLabs UG and maintained by Ugur Koc, Microsoft MVP for Intune and Security Copilot. Key facts:

- Read-only by design: the connector app holds no write scopes; remediation ships as generated PowerShell scripts that admins review and run themselves.
- Never reads content: no mailboxes, files or messages. License assignments, sign-in activity and usage metadata only.
- EU data residency (Postgres, Frankfurt); disconnecting a workspace deletes all synced data immediately.
- Flat pricing per tenant: Starter € 79/month (up to 250 seats), Growth € 199/month (up to 1.000 seats), Scale € 499/month (up to 2.500 seats). The first waste scan is free.
- Works with and without Entra ID P1: detection falls back to Microsoft 365 usage reports when precise sign-in timestamps are unavailable.

## Pages

- [Home](${base}/): product overview, live demo entry and the free waste scan
- [Pricing](${base}/pricing): flat per-tenant tiers and what every plan includes
- [For MSPs](${base}/msp): portfolio view across client tenants, consultant consent flow, per-client price books and QBR-ready reports
- [Security](${base}/security): granted scopes, stored data, residency, subprocessors, DPA
- [FAQ](${base}/faq): the questions IT and security teams ask before granting admin consent
- [Connectors](${base}/connectors): step-by-step setup guides for all 8 connectors (Adobe, Zoom, Atlassian, Salesforce, OpenAI, Anthropic, ChatGPT, Claude)
`;
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
