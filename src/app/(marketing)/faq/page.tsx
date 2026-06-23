import type { Metadata } from "next";
import Link from "next/link";

import { siteUrl } from "~/env";
import { CONNECTOR_SCOPES } from "~/lib/scopes";
import { SUPPORT_MAILTO } from "~/lib/support";

export const metadata: Metadata = {
  title: "FAQ",
  description:
    "The questions IT and security teams ask before granting LicenseMeter admin consent: write access, mailbox content, data residency, retention, Entra P1, DPA.",
};

const FAQS = [
  {
    q: "Can LicenseMeter change anything in our tenant?",
    a: "No. The connector app holds exclusively read-only application permissions. There is no write scope to misuse. Remediation happens through PowerShell scripts we generate for your admins to review and run themselves.",
  },
  {
    q: "Can you read our email, files or Teams messages?",
    a: "No. The granted scopes cannot access mailbox content, files or messages. Usage reports are consumed as last-activity dates and counts: metadata, never content.",
  },
  {
    q: "Where is our data stored, and for how long?",
    a: "In Postgres in the EU (Frankfurt). Data is kept only while your tenant is connected: disconnecting the workspace deletes everything immediately, and you can additionally revoke the enterprise application in Entra ID at any time.",
  },
  {
    q: "How are the Adobe, Zoom, Atlassian, Salesforce, OpenAI and Anthropic credentials stored?",
    a: "Encrypted at rest (AES-256-GCM) and used exclusively to read seat assignments, member lists and daily cost totals, never content or prompts. Disconnecting the connector or the workspace deletes the credentials immediately. The security overview lists what each connector stores.",
  },
  {
    q: "Who in our company can see the data?",
    a: "Only people the workspace owner invites, in the role they assign. A viewer has read-only access to dashboards and exports (built for finance); an admin can also run syncs, edit prices, change settings and invite people; an owner can additionally manage other owners and disconnect the workspace. Signing in with an account from your tenant grants nothing by itself.",
  },
  {
    q: "Do we need Entra ID P1?",
    a: "No. With P1, LicenseMeter uses precise last-sign-in timestamps. Without it, detection automatically falls back to Microsoft 365 usage reports. The settings page shows exactly which signals are active for your tenant.",
  },
  {
    q: "Our usage reports have concealed user names. Does it still work?",
    a: "Yes, with reduced granularity: directory-based findings (disabled accounts, shelfware, guests) stay per-user, usage-based findings become aggregate counts. A Global Admin can enable identifiable report names in the Microsoft 365 admin center; the change is audit-logged.",
  },
  {
    q: "Are you a verified Microsoft publisher?",
    a: "Not yet. Publisher verification is in progress; until it lands, the consent dialog shows the app id instead of a verified publisher name. Microsoft displays the current verification status directly in the consent dialog, so your admin can confirm it independently of this site. See the security overview for details.",
  },
  {
    q: "Does connecting really require a Global Administrator?",
    a: `Consent for the connector's Microsoft Graph application permissions can be granted by a Global Administrator or a Privileged Role Administrator. An Application Administrator is not sufficient for Graph application permissions, which is a Microsoft platform rule, not ours. An Application Administrator can also run a one-time instant scan with delegated permissions: no standing access, no stored tokens. Larger organizations can delegate consent for exactly LicenseMeter's ${CONNECTOR_SCOPES.length} read-only permissions to a designated role via an app consent policy; the security overview documents the setup. And you can start without any consent at all: the CSV trial computes your waste number from two Microsoft 365 admin center exports.`,
  },
  {
    q: "Do you offer a DPA (AVV)?",
    a: "Yes. LicenseMeter acts as a data processor under Art. 28 GDPR; a signed DPA is part of every subscription and available before you connect production data.",
  },
  {
    q: "What exactly do you charge for?",
    a: "The first scan is free. You see your waste number before paying anything. The subscription covers continuous monitoring: nightly syncs, new findings as people join and leave, exports and remediation scripts.",
  },
  {
    q: "We are an MSP. Can we manage several client tenants?",
    a: "Yes. Each client tenant becomes its own workspace: you start the connect flow, the client's Global Admin completes Microsoft's consent dialog, and the workspace binds to you, with no shared credentials. A portfolio view sorts all your workspaces by monthly waste, each with its own price book and a PDF waste report for the QBR. See the MSP page for details.",
  },
] as const;

const BASE = siteUrl();

/** Stable anchor per question so answers can be deep-linked. */
const slugify = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export default function FaqPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 pt-6 pb-24">
      <p className="text-xs font-medium tracking-[0.2em] text-brand-text uppercase">
        FAQ
      </p>
      <h1 className="mt-4 font-display text-4xl tracking-tight text-balance">
        The questions that come before consent.
      </h1>

      <h2 id="faq-list-heading" className="sr-only">Questions</h2>
      <dl aria-labelledby="faq-list-heading" className="mt-10 border border-line bg-card">
        {FAQS.map((item) => (
          <div
            key={item.q}
            id={slugify(item.q)}
            className="scroll-mt-24 border-b border-line px-6 py-5 last:border-b-0"
          >
            <dt className="font-medium text-ink">{item.q}</dt>
            <dd className="mt-2 text-sm leading-relaxed text-ink-soft">
              {item.a}
            </dd>
          </div>
        ))}
      </dl>

      <p className="mt-8 text-sm text-ink-soft">
        Anything missing?{" "}
        <a
          href={SUPPORT_MAILTO}
          className="font-medium text-ink underline underline-offset-4 hover:text-brand-text"
        >
          Ask directly
        </a>{" "}
        or read the{" "}
        <Link
          href="/security"
          className="font-medium text-ink underline underline-offset-4 hover:text-brand-text"
        >
          security overview
        </Link>
        .
      </p>

      <script
        type="application/ld+json"
        // Static content from the local FAQS const; "<" escaped so nothing can
        // terminate the script element.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "FAQPage",
                mainEntity: FAQS.map((item) => ({
                  "@type": "Question",
                  name: item.q,
                  acceptedAnswer: { "@type": "Answer", text: item.a },
                })),
              },
              {
                "@type": "BreadcrumbList",
                itemListElement: [
                  {
                    "@type": "ListItem",
                    position: 1,
                    name: "Home",
                    item: BASE,
                  },
                  {
                    "@type": "ListItem",
                    position: 2,
                    name: "FAQ",
                    item: `${BASE}/faq`,
                  },
                ],
              },
            ],
          }).replaceAll("<", "\\u003c"),
        }}
      />
    </main>
  );
}
