import type { Metadata } from "next";
import Link from "next/link";

import { isDemoMode, signInEnabled, signInPath, publicSiteUrl } from "~/env";
import { SignInButtons } from "~/components/SignInButtons";
import { DEMO_FIGURES, demoEuros } from "~/lib/demoFigures";

import { WASTE_EXPLAINERS } from "./content";

export const metadata: Metadata = {
  title: "Microsoft 365 license waste patterns",
  description:
    "The six ways Microsoft 365 tenants pay for seats nobody uses: disabled accounts still licensed, never-active users, inactive seats, unassigned licenses, idle Copilot seats and licensed guests. One explainer per pattern, with detection recipes.",
  alternates: { canonical: "/waste" },
};

const BASE = publicSiteUrl();

/* Static breadcrumb; "<" escaped so nothing can terminate the script. */
const INDEX_LD = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: BASE },
    {
      "@type": "ListItem",
      position: 2,
      name: "License waste patterns",
      item: `${BASE}/waste`,
    },
  ],
};

export default function WasteIndexPage() {
  const demoEnabled = isDemoMode();
  const signInOk = signInEnabled();
  const signInHref = signInPath();

  return (
    <main className="mx-auto max-w-5xl px-6 pt-6 pb-24">
      <p className="text-brand-text text-xs font-medium tracking-[0.2em] uppercase">
        Waste patterns
      </p>
      <h1 className="font-display mt-4 text-4xl tracking-tight text-balance">
        The six ways Microsoft 365 tenants pay for nothing
      </h1>
      <p className="text-ink-soft mt-4 max-w-2xl text-lg leading-relaxed">
        License waste is not one problem, it is a handful of distinct patterns
        with distinct causes and distinct detection signals. Each explainer
        below covers one pattern: why it happens, how to detect it yourself with
        Graph PowerShell, and how LicenseMeter&rsquo;s detection rules find and
        price it automatically.
      </p>

      <div className="border-line bg-line mt-10 grid gap-px border sm:grid-cols-2">
        {WASTE_EXPLAINERS.map((entry) => (
          <Link
            key={entry.slug}
            href={`/waste/${entry.slug}`}
            className="group bg-card px-6 py-6"
          >
            <h2 className="font-display group-hover:text-brand-text text-xl tracking-tight">
              {entry.name}
            </h2>
            <p className="text-ink-soft mt-3 text-sm leading-relaxed">
              {entry.summary}
            </p>
            <p className="text-ink mt-4 text-sm font-medium underline underline-offset-4">
              Read the explainer
            </p>
          </Link>
        ))}
      </div>

      <section className="border-line bg-card mt-14 border px-6 py-6">
        <h2 className="text-ink-faint text-xs font-medium tracking-[0.18em] uppercase">
          What the patterns add up to
        </h2>
        <p className="text-ink-soft mt-3 max-w-3xl text-sm leading-relaxed">
          The sample tenant of {DEMO_FIGURES.users} people shows{" "}
          <span className="tnum text-waste-text font-mono">
            € {demoEuros(DEMO_FIGURES.monthlyWasteCents)}
          </span>{" "}
          a month in waste across {DEMO_FIGURES.findingsCount} findings, every
          one priced from an editable per-tenant price book prefilled with
          list-price estimates. The{" "}
          <Link
            href="/roi"
            className="text-ink hover:text-brand-text font-medium underline underline-offset-4"
          >
            waste calculator
          </Link>{" "}
          turns your own seat count and cost per seat into an estimate, and the{" "}
          <Link
            href="/compare/powershell-audit"
            className="text-ink hover:text-brand-text font-medium underline underline-offset-4"
          >
            PowerShell comparison
          </Link>{" "}
          covers when a script is enough and when it is not.
        </p>
      </section>

      {/* Final CTA band, same pattern as /roi and /compare/powershell-audit. */}
      <section className="border-line mt-14 border-t pt-10">
        <h2 className="font-display text-3xl tracking-tight text-balance">
          Find all six patterns in your tenant.
        </h2>
        <p className="text-ink-soft mt-3 max-w-xl leading-relaxed">
          Connect read-only and the free scan checks every pattern on this page
          against your directory, license assignments, sign-in activity and
          usage reports.
        </p>
        <div className="mt-8">
          <SignInButtons
            signInEnabled={signInOk}
            signInHref={signInHref}
            demoEnabled={demoEnabled}
            showNote={false}
            primaryLabel="Run my free scan"
          />
          <p className="text-ink-faint mt-3 text-xs">
            Free scans and continuous monitoring. No credit card, read-only
            access.
          </p>
        </div>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(INDEX_LD).replaceAll("<", "\\u003c"),
        }}
      />
    </main>
  );
}
