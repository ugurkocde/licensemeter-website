import type { Metadata } from "next";
import Link from "next/link";

import { siteUrl } from "~/env";
import { Pill } from "~/components/ui";
import { CONNECTOR_GUIDES } from "~/lib/connectorGuides";

export const metadata: Metadata = {
  title: "Connectors",
  description:
    "Setup guides for every LicenseMeter connector: Adobe, Zoom, Atlassian, Salesforce, OpenAI, Anthropic, ChatGPT and Claude. Read-only credentials, official vendor documentation, what is read and what never is.",
};

const BASE = siteUrl();

/* Static breadcrumb; "<" escaped so nothing can terminate the script. */
const CONNECTORS_LD = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: BASE },
    {
      "@type": "ListItem",
      position: 2,
      name: "Connectors",
      item: `${BASE}/connectors`,
    },
  ],
};

export default function ConnectorsIndexPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 pt-6 pb-24">
      <p className="text-xs font-medium tracking-[0.2em] text-brand-text uppercase">
        Connectors
      </p>
      <h1 className="mt-4 font-display text-4xl tracking-tight text-balance">
        Connect what your company already pays for.
      </h1>
      <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-soft">
        Microsoft 365 is the core connection, granted once through
        Microsoft&rsquo;s admin-consent dialog, documented in the{" "}
        <Link
          href="/security"
          className="font-medium text-ink underline underline-offset-4 hover:text-brand-text"
        >
          security overview
        </Link>
        . Every connector below adds another vendor to the same directory
        cross-check, read-only, with a step-by-step guide and the official
        vendor documentation linked.
      </p>

      <section className="mt-12 grid gap-px border border-line bg-line sm:grid-cols-2">
        <h2 className="sr-only">Setup guides</h2>
        {CONNECTOR_GUIDES.map((g) => (
          <Link
            key={g.slug}
            href={`/connectors/${g.slug}`}
            className="group bg-card px-6 py-6 transition hover:bg-canvas"
          >
            <div className="flex items-center gap-2">
              <span className="font-display text-xl tracking-tight group-hover:underline group-hover:underline-offset-4">
                {g.name}
              </span>
              <Pill tone={g.kind === "api" ? "brand" : "slate"}>
                {g.kind === "api" ? "Connect via API" : "CSV import"}
              </Pill>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">
              {g.summary}
            </p>
            {g.kind === "import" && (
              <p className="mt-2 text-xs leading-relaxed text-ink-faint">
                No API: you paste an exported member list, matched against your
                directory. Re-import to refresh.
              </p>
            )}
          </Link>
        ))}
      </section>

      <p className="mt-8 text-sm text-ink-soft">
        All connector credentials are stored encrypted (AES-256-GCM), used
        read-only and deleted the moment you disconnect. Product names are
        trademarks of their respective owners; LicenseMeter is independent of
        all of them.
      </p>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(CONNECTORS_LD).replaceAll("<", "\\u003c"),
        }}
      />
    </main>
  );
}
