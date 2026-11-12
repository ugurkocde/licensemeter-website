import type { Metadata } from "next";
import Link from "next/link";

import { siteUrl } from "~/env";
import { DemoClip } from "~/components/landing/DemoClip";
import { Pill } from "~/components/ui";
import { buttonClass } from "~/components/ui";
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
      <p className="text-brand-text text-xs font-medium tracking-[0.2em] uppercase">
        Connectors
      </p>
      <h1 className="font-display mt-4 text-4xl tracking-tight text-balance">
        Connect what your company already pays for.
      </h1>
      <p className="text-ink-soft mt-4 max-w-2xl text-lg leading-relaxed">
        Microsoft 365 is the core connection, granted once through
        Microsoft&rsquo;s admin-consent dialog, documented in the{" "}
        <Link
          href="/security"
          className="text-ink hover:text-brand-text font-medium underline underline-offset-4"
        >
          security overview
        </Link>
        . Every connector below adds another vendor to the same directory
        cross-check, read-only, with a step-by-step guide and the official
        vendor documentation linked.
      </p>

      <DemoClip
        src="/videos/feature-connectors.mp4"
        poster="/videos/feature-connectors.webp"
        label="Product demo: connecting the Atlassian connector"
        caption="Connecting Atlassian in the demo workspace: read-only credentials in, first sync done, seats in the directory cross-check."
        className="mt-10 max-w-3xl"
      />

      <section className="border-line bg-line mt-12 grid gap-px border sm:grid-cols-2">
        <h2 className="sr-only">Setup guides</h2>
        {CONNECTOR_GUIDES.map((g) => (
          <Link
            key={g.slug}
            href={`/connectors/${g.slug}`}
            className="group bg-card hover:bg-canvas min-w-0 px-6 py-6 transition"
          >
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <span
                aria-hidden="true"
                className="border-line bg-canvas font-display text-ink-soft flex size-10 shrink-0 items-center justify-center rounded-xl border text-sm"
              >
                {g.name.charAt(0)}
              </span>
              <span className="font-display min-w-0 text-xl tracking-tight break-words group-hover:underline group-hover:underline-offset-4">
                {g.name}
              </span>
              <Pill tone={g.kind === "api" ? "brand" : "slate"}>
                {g.kind === "api" ? "Connect via API" : "CSV import"}
              </Pill>
            </div>
            <p className="text-ink-soft mt-2 text-sm leading-relaxed">
              {g.summary}
            </p>
            {g.kind === "import" && (
              <p className="text-ink-faint mt-2 text-xs leading-relaxed">
                No API: you paste an exported member list, matched against your
                directory. Re-import to refresh.
              </p>
            )}
          </Link>
        ))}
      </section>

      <p className="text-ink-soft mt-8 text-sm">
        All connector credentials are stored encrypted (AES-256-GCM), used
        read-only and removed from the live database the moment you disconnect
        the connector. Product names are trademarks of their respective owners;
        LicenseMeter is independent of all of them.
      </p>

      <section className="border-line bg-subtle mt-12 rounded-2xl border px-6 py-8 sm:px-8">
        <h2 className="font-display text-2xl tracking-tight text-balance">
          Start with Microsoft 365, then add every paid seat source.
        </h2>
        <p className="text-ink-soft mt-2 max-w-2xl text-sm leading-relaxed">
          Run the read-only demo first, or create a workspace and follow the
          guided Microsoft consent flow. No credit card is required.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/#get-started" className={buttonClass("primary")}>
            Start Free
          </Link>
          <Link href="/security" className={buttonClass("secondary")}>
            Review Security
          </Link>
        </div>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(CONNECTORS_LD).replaceAll("<", "\\u003c"),
        }}
      />
    </main>
  );
}
