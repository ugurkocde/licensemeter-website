import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { isDemoMode, signInPath, siteUrl } from "~/env";
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
        className="text-ink-faint text-xs font-medium tracking-[0.2em] uppercase"
      >
        <Link
          href="/connectors"
          className="hover:text-ink underline-offset-4 hover:underline"
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
        <Pill tone={guide.kind === "api" ? "brand" : "slate"}>
          {guide.kind === "api" ? "Connect via API" : "CSV import"}
        </Pill>
      </div>
      {guide.kind === "import" && (
        <p className="text-ink-faint mt-3 max-w-2xl text-sm leading-relaxed">
          This is a CSV import, not an API connection: {guide.name} has no
          members API to read, so you paste an exported member list and
          LicenseMeter matches it against your directory. Re-import to refresh.
        </p>
      )}
      <p className="text-ink-soft mt-4 max-w-2xl text-lg leading-relaxed">
        {guide.intro}
      </p>

      <section className="mt-12">
        <h2 className="font-display text-2xl tracking-tight">
          Setup, step by step.
        </h2>
        <ol className="mt-6 flex flex-col gap-8">
          {guide.steps.map((step, i) => (
            <li key={step.title} className="flex min-w-0 gap-4 sm:gap-5">
              <span
                aria-hidden="true"
                className="text-brand-text font-mono text-xs"
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0">
                <h3 className="font-display text-xl tracking-tight">
                  {step.title}
                </h3>
                <p className="text-ink-soft mt-2 text-sm leading-relaxed break-words">
                  {step.body}
                </p>
                {step.doc && (
                  <p className="mt-2 text-sm">
                    <a
                      href={step.doc.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-ink hover:text-brand-text font-medium underline underline-offset-4"
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
          <ul className="text-ink-soft mt-4 flex flex-col gap-2 text-sm leading-relaxed">
            {guide.detects.map((line) => (
              <li key={line} className="flex gap-3">
                <span aria-hidden="true" className="text-brand-text mt-0.5">
                  ·
                </span>
                {line}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="border-line bg-line mt-12 grid gap-px border sm:grid-cols-2">
        <div className="bg-card px-6 py-6">
          <h2 className="text-ink-faint text-xs font-medium tracking-[0.18em] uppercase">
            What LicenseMeter reads
          </h2>
          <ul className="text-ink-soft mt-3 flex flex-col gap-2 text-sm leading-relaxed">
            {guide.reads.map((line) => (
              <li key={line} className="flex gap-3">
                <span aria-hidden="true" className="text-moss mt-0.5">
                  ·
                </span>
                {line}
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-card px-6 py-6">
          <h2 className="text-ink-faint text-xs font-medium tracking-[0.18em] uppercase">
            What it never reads
          </h2>
          <ul className="text-ink-soft mt-3 flex flex-col gap-2 text-sm leading-relaxed">
            {guide.neverReads.map((line) => (
              <li key={line} className="flex gap-3">
                <span aria-hidden="true" className="text-brand-text mt-0.5">
                  ·
                </span>
                {line}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <p className="text-ink-soft mt-8 text-sm leading-relaxed">
        {guide.kind === "api"
          ? "Credentials are validated against the vendor before anything is stored, encrypted at rest (AES-256-GCM), used read-only and deleted the moment you disconnect."
          : "Nothing leaves the pasted table: the member list is stored like any other connector seat snapshot and deleted the moment you clear it."}{" "}
        Data lives in the EU (Postgres, Frankfurt). The{" "}
        <Link
          href="/security"
          className="text-ink hover:text-brand-text font-medium underline underline-offset-4"
        >
          security overview
        </Link>{" "}
        covers the full picture.
      </p>

      <section className="border-line mt-12 border-t pt-10">
        <h2 className="font-display text-3xl tracking-tight text-balance">
          Ready in a few minutes.
        </h2>
        <p className="text-ink-soft mt-3 max-w-xl leading-relaxed">
          Open the connector page in your workspace, or walk through the live
          demo first to see the findings this connector produces.
        </p>
        <div className="mt-6 flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <a
            href={`${signInPath()}?returnTo=${encodeURIComponent(guide.settingsPath)}`}
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
        <p className="text-ink-faint mt-3 text-xs">
          Opening the connector asks you to sign in first.
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
