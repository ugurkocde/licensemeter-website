import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowUpRight,
  Cable,
  FileCheck2,
  ScanLine,
  ShieldCheck,
  Terminal,
  TrendingDown,
} from "lucide-react";
import { isDemoMode, signInEnabled, signInPath, siteUrl } from "~/env";
import { SignInButtons } from "~/components/SignInButtons";
import { FeatureShowcase } from "~/components/landing/FeatureShowcase";
import { OrbitHero } from "~/components/landing/OrbitHero";
import { Reveal } from "~/components/landing/Reveal";
import { buttonClass } from "~/components/ui";
import { SITE_DEFINITION, SITE_DESCRIPTION, SITE_TITLE } from "~/lib/site";

const STEPS = [
  {
    Icon: Cable,
    title: "Connect your tools",
    body: "Link Microsoft 365 and your SaaS apps with read-only access. See every permission before you connect.",
  },
  {
    Icon: ScanLine,
    title: "Find the quiet waste",
    body: "Spot inactive accounts, forgotten licenses and paid seats with nobody assigned. Every finding comes with evidence.",
  },
  {
    Icon: TrendingDown,
    title: "Make room for savings",
    body: "See the monthly cost of each unused seat. Export the findings and reclaim the licenses you choose.",
  },
];

const BASE = siteUrl();

export const metadata: Metadata = {
  title: { absolute: SITE_TITLE },
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "LicenseMeter",
    url: BASE,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    creator: "@ugurkocde",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
};

/* Page-level JSON-LD describes the free application. */
const HOME_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      "@id": `${BASE}/#software`,
      name: "LicenseMeter",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: BASE,
      description: SITE_DEFINITION,
      publisher: { "@id": `${BASE}/#organization` },
      isAccessibleForFree: true,
    },
  ],
};

/* Fully static marketing page; daily revalidation is a safe default that keeps
 * it CDN-cacheable while letting content edits propagate within a day. */
export const revalidate = 86400;

export default function LandingPage() {
  const signInOk = signInEnabled();
  const signInHref = signInPath();
  const demoEnabled = isDemoMode();
  return (
    <main>
      <OrbitHero
        signInEnabled={signInOk}
        signInHref={signInHref}
        demoEnabled={demoEnabled}
      />
      <section
        className="border-line border-t px-6 py-20 lg:py-24"
        aria-labelledby="how-it-works"
      >
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-brand-text text-xs font-medium tracking-[0.12em] uppercase">
              Less waste. More visibility.
            </p>
            <h2
              id="how-it-works"
              className="font-display mt-4 text-3xl font-semibold tracking-[-0.04em] text-balance sm:text-4xl"
            >
              From scattered seats
              <br />
              to a clear next step.
            </h2>
          </div>
          <div className="mt-14 grid gap-10 md:grid-cols-3 md:gap-12">
            {STEPS.map(({ Icon, title, body }, index) => (
              <Reveal key={title} delay={index * 80}>
                <div className="border-line flex items-center justify-between border-b pb-5">
                  <span className="bg-subtle text-ink flex size-11 items-center justify-center rounded-xl">
                    <Icon
                      className="size-5"
                      strokeWidth={1.6}
                      aria-hidden="true"
                    />
                  </span>
                  <span className="text-ink-faint font-mono text-xs">
                    0{index + 1}
                  </span>
                </div>
                <h3 className="mt-6 text-lg font-semibold tracking-tight">
                  {title}
                </h3>
                <p className="text-ink-soft mt-3 text-sm leading-7">{body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
      <section id="product-tour" className="bg-canvas px-6 py-20 lg:py-24">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 text-center">
            <p className="text-brand-text text-xs font-medium tracking-[0.12em] uppercase">
              A closer look
            </p>
            <h2 className="font-display mt-4 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
              Your license spend, finally in focus.
            </h2>
            <p className="text-ink-soft mt-4 text-base">
              Explore the dashboard with a sample workspace.
            </p>
          </div>
          <FeatureShowcase />
        </div>
      </section>
      <section
        className="mx-auto max-w-6xl px-6 py-20 lg:py-24"
        aria-labelledby="trust-heading"
      >
        <div className="grid items-start gap-10 lg:grid-cols-[1fr_1.2fr] lg:gap-20">
          <div>
            <span className="text-brand-text inline-flex items-center gap-2 text-xs font-medium tracking-[0.12em] uppercase">
              <ShieldCheck className="size-4" aria-hidden="true" />
              Read-only by design
            </span>
            <h2
              id="trust-heading"
              className="font-display mt-4 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl"
            >
              Your tenant.
              <br />
              Your control.
            </h2>
            <p className="text-ink-soft mt-5 max-w-md text-sm leading-7">
              LicenseMeter reads license and activity metadata. It never reads
              mailbox or file content, and never removes a license
              automatically. Hosted in the EU, with deletion when you
              disconnect.
            </p>
            <Link
              href="/trust-center"
              className="text-ink mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-medium underline underline-offset-4"
            >
              Explore the Trust Center{" "}
              <ArrowUpRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
          <div className="divide-line divide-y">
            <div className="flex gap-5 pb-8">
              <FileCheck2
                className="text-ink-soft mt-1 size-5 shrink-0"
                aria-hidden="true"
              />
              <div>
                <h3 className="font-semibold">
                  Real calculations. Sample data.
                </h3>
                <p className="text-ink-soft mt-3 text-sm leading-7">
                  Inspect the worked example behind the demo. Each finding shows
                  the account, the reason and the cost.
                </p>
                <Link
                  href="/sample-report"
                  className="text-brand-text mt-3 inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4"
                >
                  Read the sample report
                </Link>
              </div>
            </div>
            <div className="flex gap-5 pt-8">
              <Terminal
                className="text-ink-soft mt-1 size-5 shrink-0"
                aria-hidden="true"
              />
              <div>
                <h3 className="font-semibold">Prefer to run it yourself?</h3>
                <p className="text-ink-soft mt-3 text-sm leading-7">
                  LicenseMeter is MIT-licensed. Self-host the whole app with
                  Docker, or read the code before you connect anything.
                </p>
                <a
                  href="https://github.com/ugurkocde/licensemeter-website"
                  target="_blank"
                  rel="noreferrer"
                  className={buttonClass("secondary", "mt-4")}
                >
                  View the source on GitHub{" "}
                  <ArrowUpRight className="size-4" aria-hidden="true" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-6 pb-20">
        <div className="border-line bg-canvas rounded-3xl border px-5 py-14 text-center sm:px-10 sm:py-16">
          <h2 className="font-display mx-auto max-w-2xl text-3xl font-semibold tracking-[-0.04em] text-balance sm:text-4xl">
            Your next renewal deserves
            <br className="hidden sm:block" /> a smaller number.
          </h2>
          <p className="text-ink-soft mx-auto mt-5 max-w-lg text-base leading-7">
            Find your unused licenses today. Keep monitoring for free, for as
            long as you need.
          </p>
          <div className="mt-8">
            <SignInButtons
              signInEnabled={signInOk}
              signInHref={signInHref}
              demoEnabled={demoEnabled}
              showNote={false}
              primaryLabel="Run my free scan"
              centered
              primaryVariant="ink"
            />
          </div>
          <p className="text-ink-faint mt-5 text-xs">
            Free to use. No credit card. Read-only access.
          </p>
        </div>
        <p className="text-ink-faint mx-auto mt-10 max-w-xl text-center text-xs leading-6">
          Built and maintained by{" "}
          <a
            href="https://ugurkoc.de"
            target="_blank"
            rel="noreferrer"
            className="text-ink-soft underline underline-offset-4"
          >
            Ugur Koc
          </a>
          , Microsoft MVP for Intune and Security Copilot. Operated by UgurLabs
          in Düsseldorf, Germany.
        </p>
      </section>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(HOME_LD).replaceAll("<", "\\u003c"),
        }}
      />
    </main>
  );
}
