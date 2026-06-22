import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { isDemoMode, siteUrl } from "~/env";
import { buttonClass, Pill } from "~/components/ui";
import { CONNECTOR_GUIDES, connectorGuide } from "~/lib/connectorGuides";

type Params = { slug: string };

export const generateStaticParams = (): Params[] =>
  CONNECTOR_GUIDES.map((g) => ({ slug: g.slug }));

export const dynamicParams = false;

export const generateMetadata = async ({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> => {
  const guide = connectorGuide((await params).slug);
  if (!guide) return {};
  return {
    title: `${guide.name} connector setup`,
    description: guide.summary,
  };
};

const BASE = siteUrl();

export default async function ConnectorGuidePage({
  params,
}: {
  params: Promise<Params>;
}) {
  const guide = connectorGuide((await params).slug);
  if (!guide) notFound();
  const demoEnabled = isDemoMode();

  /* Static breadcrumb; "<" escaped so nothing can terminate the script. */
  const guideLd = {
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
      {
        "@type": "ListItem",
        position: 3,
        name: guide.name,
        item: `${BASE}/connectors/${guide.slug}`,
      },
    ],
  };

  return (
    <main className="mx-auto max-w-3xl px-6 pt-6 pb-24">
      <nav
        aria-label="Breadcrumb"
        className="text-xs font-medium tracking-[0.2em] text-ink-faint uppercase"
      >
        <Link
          href="/connectors"
          className="underline-offset-4 hover:text-ink hover:underline"
        >
          Connectors
        </Link>{" "}
        /{" "}
        <span aria-current="page" className="text-brand-text">
          {guide.name}
        </span>
      </nav>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-4xl tracking-tight text-balance">
          Connect {guide.name} to LicenseMeter.
        </h1>
        <Pill tone="gold">
          {guide.kind === "api" ? "API connector" : "CSV import"}
        </Pill>
      </div>
      <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-soft">
        {guide.intro}
      </p>

      <section className="mt-12">
        <h2 className="font-display text-2xl tracking-tight">
          Setup, step by step.
        </h2>
        <ol className="mt-6 flex flex-col gap-8">
          {guide.steps.map((step, i) => (
            <li key={step.title} className="flex gap-5">
              <span
                aria-hidden="true"
                className="font-mono text-xs text-brand-text"
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <h3 className="font-display text-xl tracking-tight">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                  {step.body}
                </p>
                {step.doc && (
                  <p className="mt-2 text-sm">
                    <a
                      href={step.doc.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-ink underline underline-offset-4 hover:text-brand-text"
                    >
                      {step.doc.label}
                    </a>{" "}
                    <span className="text-ink-faint">
                      (official documentation)
                    </span>
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </section>

      {guide.detects.length > 0 && (
        <section className="mt-12">
          <h2 className="font-display text-2xl tracking-tight">
            What it finds.
          </h2>
          <ul className="mt-4 flex flex-col gap-2 text-sm leading-relaxed text-ink-soft">
            {guide.detects.map((line) => (
              <li key={line} className="flex gap-3">
                <span aria-hidden="true" className="mt-0.5 text-brand-text">
                  ·
                </span>
                {line}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-12 grid gap-px border border-line bg-line sm:grid-cols-2">
        <div className="bg-card px-6 py-6">
          <h2 className="text-xs font-medium tracking-[0.18em] text-ink-faint uppercase">
            What LicenseMeter reads
          </h2>
          <ul className="mt-3 flex flex-col gap-2 text-sm leading-relaxed text-ink-soft">
            {guide.reads.map((line) => (
              <li key={line} className="flex gap-3">
                <span aria-hidden="true" className="mt-0.5 text-moss">
                  ·
                </span>
                {line}
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-card px-6 py-6">
          <h2 className="text-xs font-medium tracking-[0.18em] text-ink-faint uppercase">
            What it never reads
          </h2>
          <ul className="mt-3 flex flex-col gap-2 text-sm leading-relaxed text-ink-soft">
            {guide.neverReads.map((line) => (
              <li key={line} className="flex gap-3">
                <span aria-hidden="true" className="mt-0.5 text-brand-text">
                  ·
                </span>
                {line}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <p className="mt-8 text-sm leading-relaxed text-ink-soft">
        {guide.kind === "api"
          ? "Credentials are validated against the vendor before anything is stored, encrypted at rest (AES-256-GCM), used read-only and deleted the moment you disconnect."
          : "Nothing leaves the pasted table: the member list is stored like any other connector seat snapshot and deleted the moment you clear it."}{" "}
        Data lives in the EU (Postgres, Frankfurt). The{" "}
        <Link
          href="/security"
          className="font-medium text-ink underline underline-offset-4 hover:text-brand-text"
        >
          security overview
        </Link>{" "}
        covers the full picture.
      </p>

      <section className="mt-12 border-t border-line pt-10">
        <h2 className="font-display text-3xl tracking-tight text-balance">
          Ready in a few minutes.
        </h2>
        <p className="mt-3 max-w-xl leading-relaxed text-ink-soft">
          Open the connector page in your workspace, or walk through the live
          demo first to see the findings this connector produces.
        </p>
        <div className="mt-6 flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <a
            href={`/auth/sign-in?returnTo=${encodeURIComponent(guide.settingsPath)}`}
            className={buttonClass("primary", "w-full sm:w-auto")}
          >
            Open the {guide.name} connector
          </a>
          {demoEnabled && (
            <form action="/api/auth/demo" method="post">
              <button className={buttonClass("secondary", "w-full sm:w-auto")}>
                Open the live demo
              </button>
            </form>
          )}
        </div>
        <p className="mt-3 text-xs text-ink-faint">
          Opening the connector signs you in with Microsoft first.
        </p>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(guideLd).replaceAll("<", "\\u003c"),
        }}
      />
    </main>
  );
}
