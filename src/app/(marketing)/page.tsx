import Link from "next/link";
import {
  Calculator,
  Check,
  FileSpreadsheet,
  ShieldCheck,
  Terminal,
} from "lucide-react";

import { isDemoMode, signInEnabled, signInPath, siteUrl } from "~/env";
import { RoiCalculator } from "~/components/RoiCalculator";
import { SignInButtons } from "~/components/SignInButtons";
import { HeroVisual } from "~/components/landing/HeroVisual";
import { Reveal } from "~/components/landing/Reveal";
import { buttonClass } from "~/components/ui";
import { DEMO_FIGURES, demoEuros } from "~/lib/demoFigures";
import { PLANS } from "~/lib/plans";
import { ALL_RULES } from "~/lib/rules";
import { SITE_DEFINITION } from "~/lib/site";
import { getScanStats } from "~/server/marketingStats";

const GITHUB_URL = "https://github.com/ugurkocde/licensemeter";

/* The exact read-only Microsoft Graph permissions requested at connect, shown
 * up front to clear the consent objection. Kept in sync with the consent path. */
const GRAPH_SCOPES = [
  "User.Read.All",
  "AuditLog.Read.All",
  "Reports.Read.All",
  "LicenseAssignment.Read.All",
  "ReportSettings.Read.All",
] as const;

/** "12,4": German decimal convention, matching the euro figures around it. */
const fmtPct = (n: number): string =>
  new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(n);

/* Plain-text names by design: referencing compatibility is nominative use;
 * official logos would need each vendor's permission (see footer notice). */
const CONNECTORS = [
  "Microsoft 365",
  "Adobe",
  "Zoom",
  "Atlassian",
  "Salesforce",
  "ChatGPT",
  "Claude",
] as const;

const VALUE_CARDS = [
  {
    Icon: Calculator,
    title: "Procurement sees the number",
    body: `The sample tenant shows € ${demoEuros(
      DEMO_FIGURES.monthlyWasteCents,
    )}/mo of recoverable spend before anyone exports a report.`,
  },
  {
    Icon: ShieldCheck,
    title: "IT keeps control",
    body: "Read-only access, the consent path shown up front, and remediation that stays in your tenant. No agent, no write access.",
  },
  {
    Icon: FileSpreadsheet,
    title: "Finance gets proof",
    body: "Every finding carries a monthly euro impact, a category and an export path. Evidence, not a generic dashboard score.",
  },
] as const;

const STEPS = [
  {
    n: "01",
    title: "Connect read-only",
    body: "One Global Admin grants read-only application permissions. No agent, no write access, about five minutes.",
  },
  {
    n: "02",
    title: "See every leak, priced",
    body: `Directory, license assignments, sign-in activity, usage reports and connected-app seats are cross-checked against who still works there. ${ALL_RULES.length} rules price each finding in euros per month.`,
  },
  {
    n: "03",
    title: "Reclaim with proof",
    body: "Export the finance CSV or hand IT the generated PowerShell script for the seats you decide to remove.",
  },
] as const;

const HERO_TRUST = [
  "Read-only",
  "No mailbox or files",
  "EU-hosted",
  "Disconnect deletes everything",
] as const;

const INCLUDED = [
  "Every connector: Microsoft 365, Adobe, Zoom, Atlassian, Salesforce, ChatGPT, Claude",
  "All waste rules, priced in euros per month",
  "Nightly sync, full history and offboarding-leak alerts",
  "CSV + PowerShell exports and board-ready PDF reports",
  "Unlimited workspace members, finance viewers included",
  "EU-hosted, read-only, disconnect deletes everything",
] as const;

const BASE = siteUrl();

/* Page-level JSON-LD for SEO/GEO. SoftwareApplication reuses the same @id as
 * the pricing page so answer engines treat them as one entity; offers come
 * straight from PLANS (monthly, EUR). The HowTo mirrors the three connect
 * steps rendered below. "<" escaped so nothing can terminate the script. */
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
      offers: PLANS.map((plan) => ({
        "@type": "Offer",
        name: plan.name,
        price: String(plan.monthly),
        priceCurrency: "EUR",
        availability: "https://schema.org/InStock",
        description: `Per tenant, per month, ${plan.seats}`,
        url: `${BASE}/pricing`,
      })),
    },
    {
      "@type": "HowTo",
      name: "How to find Microsoft 365 license waste with LicenseMeter",
      description:
        "Connect Microsoft 365 read-only, see every wasted seat priced in euros, and reclaim it with proof.",
      step: STEPS.map((step, index) => ({
        "@type": "HowToStep",
        position: index + 1,
        name: step.title,
        text: step.body,
      })),
    },
  ],
};

/* Static with daily revalidation: the only time-sensitive content is the
 * current month inside the hero ledger card, and up to a day of staleness at a
 * month rollover is acceptable. Keeps the page CDN-cacheable. */
export const revalidate = 86400;

export default async function LandingPage() {
  const signInOk = signInEnabled();
  const signInHref = signInPath();
  const demoEnabled = isDemoMode();
  /* Build/ISR-time aggregate; null until the numbers are worth quoting. */
  const stats = await getScanStats();
  const trialHref = signInOk ? signInHref : "#get-started";
  const month = new Date().toLocaleString("en-US", { month: "long" });

  return (
    <main>
      {/* 1 — Hero */}
      <section id="get-started" className="relative overflow-hidden">
        <div className="brand-radial absolute inset-0" aria-hidden="true" />
        <div className="relative mx-auto max-w-6xl px-6 pt-10 pb-14 lg:pt-16 lg:pb-20">
          <div className="grid gap-10 lg:grid-cols-[0.92fr_1.08fr] lg:items-center">
            <div className="rise rise-1">
              <p className="text-brand-text text-xs font-medium tracking-[0.12em] uppercase">
                Microsoft 365 license waste, priced in euros
              </p>
              <h1 className="font-display mt-4 text-4xl leading-[1.05] font-semibold tracking-tight text-balance md:text-5xl xl:text-[4rem]">
                See what your unused licenses really cost you.
              </h1>
              <p className="text-ink-soft mt-5 max-w-xl text-base leading-relaxed lg:text-lg">
                LicenseMeter connects to Microsoft 365 read-only and shows IT and
                finance exactly which seats are wasted, priced in euros, before
                your next renewal.{" "}
                <span className="text-brand-text font-semibold">
                  The first scan is free.
                </span>
              </p>
              <p className="text-ink-faint mt-4 max-w-xl text-sm leading-relaxed">
                LicenseMeter is a SaaS license optimization tool that connects
                read-only to Microsoft 365, cross-checks Adobe, Zoom, Atlassian,
                Salesforce, ChatGPT and Claude seats against your directory, and
                prices every leaked, unused or forgotten seat in euros per month.
              </p>
              <div className="mt-6">
                <SignInButtons
                  signInEnabled={signInOk}
                  signInHref={signInHref}
                  demoEnabled={demoEnabled}
                  showNote={false}
                />
                <p className="text-ink-faint mt-3 text-xs">
                  Start free with a 14-day trial. No credit card, read-only
                  access.
                </p>
              </div>
            </div>

            <div id="sample-tenant" className="rise rise-3 scroll-mt-8">
              <HeroVisual month={month} />
            </div>
          </div>
        </div>
      </section>

      {/* 2 — Works with */}
      <section className="border-line bg-subtle border-y">
        <div className="mx-auto max-w-6xl px-6 py-10 lg:py-12">
          <ul className="text-ink-soft flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[13px]">
            {HERO_TRUST.map((item) => (
              <li key={item} className="flex items-center gap-1.5">
                <Check className="text-good size-4 shrink-0" />
                {item}
              </li>
            ))}
            <li>
              <Link
                href="/security"
                className="text-brand-text font-medium underline underline-offset-4 hover:opacity-80"
              >
                Security overview →
              </Link>
            </li>
          </ul>
          <div className="border-line mt-8 border-t pt-8">
            <p className="text-ink-faint text-center text-sm">
              Works with the tools your seats live in
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {CONNECTORS.map((name) => (
                <span
                  key={name}
                  className="border-line bg-card text-ink-soft rounded-full border px-3 py-1.5 text-sm"
                >
                  {name}
                </span>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm">
              <Link
                href="/connectors"
                className="text-brand-text inline-flex min-h-11 items-center font-medium underline underline-offset-4 hover:opacity-80"
              >
                See all connectors →
              </Link>
              {stats && (
                <span className="text-ink-faint">
                  {fmtPct(stats.avgWastePct)}% average waste across{" "}
                  {stats.tenants} connected tenants
                </span>
              )}
            </div>
            <p className="text-ink-faint/70 mx-auto mt-6 max-w-2xl text-center text-xs leading-relaxed">
              All product names are trademarks of their respective owners.
              LicenseMeter is not affiliated with or endorsed by them.
            </p>
          </div>
        </div>
      </section>

      {/* 3 — Value cards */}
      <section className="mx-auto max-w-6xl px-6 py-16 lg:py-24">
        <div className="max-w-2xl">
          <h2 className="font-display text-3xl font-semibold tracking-tight text-balance lg:text-4xl">
            Proof procurement, IT and finance can all act on.
          </h2>
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {VALUE_CARDS.map((card, index) => (
            <Reveal key={card.title} delay={index * 80}>
              <article className="border-line bg-card shadow-card hover:shadow-float h-full rounded-2xl border p-6 transition-shadow duration-200">
                <span className="bg-brand-soft text-brand-text ring-brand/10 inline-flex size-12 items-center justify-center rounded-2xl ring-1">
                  <card.Icon className="size-6" strokeWidth={1.75} />
                </span>
                <h3 className="font-display mt-4 text-xl font-semibold tracking-tight">
                  {card.title}
                </h3>
                <p className="text-ink-soft mt-2 text-sm leading-relaxed">
                  {card.body}
                </p>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      {/* 4 — How it works */}
      <section className="border-line bg-subtle border-y">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-16 lg:grid-cols-[0.8fr_1.2fr] lg:items-start lg:py-24">
          <div className="lg:sticky lg:top-8">
            <h2 className="font-display text-3xl font-semibold tracking-tight text-balance lg:text-4xl">
              A license ledger, not another dashboard.
            </h2>
            <p className="text-ink-soft mt-4 leading-relaxed">
              Built around evidence procurement and IT can both inspect: who owns
              the seat, why it is waste, what it costs, and how to reclaim it.
            </p>
          </div>
          <div className="grid gap-4">
            {STEPS.map((step) => (
              <Reveal key={step.n}>
                <article className="group border-line bg-card shadow-card hover:shadow-float grid items-start gap-4 rounded-2xl border p-5 transition-shadow duration-200 sm:grid-cols-[auto_1fr]">
                  <span className="bg-brand-soft text-brand-deep font-display flex size-11 items-center justify-center rounded-full text-lg font-semibold">
                    {step.n}
                  </span>
                  <div>
                    <h3 className="font-display text-xl font-semibold tracking-tight">
                      {step.title}
                    </h3>
                    <p className="text-ink-soft mt-1.5 text-sm leading-relaxed">
                      {step.body}
                    </p>
                  </div>
                </article>
              </Reveal>
            ))}

            {/* Consent objection: the exact read-only Graph scopes, up front. */}
            <Reveal>
              <div className="border-line bg-card rounded-2xl border p-5">
                <div className="flex items-start gap-3">
                  <span className="bg-brand-soft text-brand-text inline-flex size-9 shrink-0 items-center justify-center rounded-xl">
                    <ShieldCheck className="size-5" strokeWidth={1.75} />
                  </span>
                  <div>
                    <p className="text-sm font-medium">
                      Read-only, never content. Disconnect deletes everything.
                    </p>
                    <p className="text-ink-soft mt-1.5 text-sm leading-relaxed">
                      The consent screen requests exactly these Microsoft Graph
                      permissions, all read-only:
                    </p>
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {GRAPH_SCOPES.map((scope) => (
                        <li
                          key={scope}
                          className="border-line bg-subtle text-ink-soft rounded-full border px-2.5 py-1 font-mono text-xs"
                        >
                          {scope}
                        </li>
                      ))}
                    </ul>
                    <Link
                      href="/security"
                      className="text-brand-text mt-3 inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4 hover:opacity-80"
                    >
                      Security overview →
                    </Link>
                  </div>
                </div>
              </div>
            </Reveal>

            {/* Open-source scanner as an earlier trust signal. */}
            <p className="text-ink-soft text-sm">
              Prefer not to connect yet?{" "}
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noreferrer"
                className="text-brand-text font-medium underline underline-offset-4 hover:opacity-80"
              >
                Run our open-source scanner locally →
              </a>
            </p>
          </div>
        </div>
      </section>

      {/* 5 — ROI calculator */}
      <section className="mx-auto max-w-6xl px-6 py-16 lg:py-24">
        <div className="max-w-2xl">
          <p className="text-brand-text text-xs font-medium tracking-[0.12em] uppercase">
            Estimate your own waste
          </p>
          <h2 className="font-display mt-3 text-3xl font-semibold tracking-tight text-balance lg:text-4xl">
            Put your own numbers in before you connect.
          </h2>
          <p className="text-ink-soft mt-3 leading-relaxed">
            The estimate runs entirely in your browser. No data leaves this page,
            and your free scan replaces every assumption with real tenant data.
          </p>
        </div>
        <div className="mt-10">
          <RoiCalculator />
        </div>
      </section>

      {/* 6 — Pricing */}
      <section id="pricing" className="mx-auto max-w-6xl px-6 py-16 lg:py-24">
        <div className="max-w-2xl">
          <p className="text-brand-text text-xs font-medium tracking-[0.12em] uppercase">
            Pricing
          </p>
          <h2 className="font-display mt-3 text-3xl font-semibold tracking-tight text-balance lg:text-4xl">
            Flat pricing, sized by seats, not by how much waste we find.
          </h2>
          <p className="text-ink-soft mt-3 leading-relaxed">
            Every plan includes every connector and every rule. You only pay for
            the size of your tenant.
          </p>
          <div className="bg-brand-soft text-brand-deep mt-5 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium">
            <Check className="size-4 shrink-0" />
            Every plan starts with a 14-day free trial, no card required
          </div>
        </div>

        <div className="mt-10 grid gap-5 lg:grid-cols-3 lg:items-stretch">
          {PLANS.map((p) => (
            <article
              key={p.name}
              className={`relative flex h-full flex-col rounded-2xl border p-6 ${
                p.featured
                  ? "border-brand ring-brand/30 bg-card shadow-float ring-2"
                  : "border-line bg-card shadow-card"
              }`}
            >
              {p.featured && (
                <span className="bg-brand absolute -top-3 left-6 rounded-full px-3 py-1 text-[11px] font-medium tracking-wide text-white uppercase">
                  Most popular
                </span>
              )}
              <p className="text-ink-faint text-xs font-medium tracking-[0.12em] uppercase">
                {p.name}
              </p>
              <div className="font-display mt-3 text-4xl font-semibold tracking-tight">
                € {p.monthly}
                <span className="text-ink-soft text-base font-normal">
                  {" "}
                  / month
                </span>
              </div>
              <p className="text-ink-soft mt-1 text-sm">{p.seats}</p>
              <a
                href={trialHref}
                className={buttonClass(
                  p.featured ? "primary" : "secondary",
                  "mt-5 w-full",
                )}
              >
                Start free — no card
              </a>
              <p className="text-ink-faint mt-3 text-xs">
                First scan free, then free for 14 days, then € {p.monthly}/month.
              </p>
            </article>
          ))}
        </div>

        <div className="border-line bg-subtle mt-6 rounded-2xl border p-6">
          <p className="text-ink-faint text-xs font-medium tracking-[0.12em] uppercase">
            Every plan includes
          </p>
          <ul className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            {INCLUDED.map((item) => (
              <li key={item} className="text-ink-soft flex gap-3">
                <Check className="text-good mt-0.5 size-4 shrink-0" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-ink-soft text-sm">
            Over 2.500 seats, or an MSP managing many tenants?{" "}
            <Link
              href="/msp"
              className="text-brand-text font-medium underline underline-offset-4 hover:opacity-80"
            >
              Talk to us →
            </Link>
          </p>
          <Link
            href="/pricing"
            className="text-brand-text inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4 hover:opacity-80"
          >
            Compare plans in detail →
          </Link>
        </div>

        {/* Free, open-source PowerShell option (the open-core entry point) */}
        <div className="border-line bg-card mt-6 flex flex-col gap-4 rounded-2xl border p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-4">
            <span className="bg-ink-panel text-canvas inline-flex size-10 shrink-0 items-center justify-center rounded-xl">
              <Terminal className="size-5" strokeWidth={1.75} />
            </span>
            <div>
              <p className="font-display text-base font-semibold tracking-tight">
                Prefer to run it yourself? It&rsquo;s free and open source.
              </p>
              <p className="text-ink-soft mt-1 text-sm leading-relaxed">
                LicenseMeter Scan is a free PowerShell module that scans the
                Microsoft 365 part locally and writes a self-contained HTML
                report. No account, nothing leaves your tenant. Connectors,
                history and alerts are the hosted upgrade.
              </p>
            </div>
          </div>
          <a
            href="https://github.com/ugurkocde/licensemeter"
            target="_blank"
            rel="noreferrer"
            className={buttonClass("secondary", "shrink-0")}
          >
            Get it on GitHub →
          </a>
        </div>
      </section>

      {/* Final CTA band */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="brand-radial border-line bg-brand-soft relative overflow-hidden rounded-3xl border px-6 py-10 sm:px-10">
          <div className="relative flex flex-col gap-7 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="font-display max-w-2xl text-3xl font-semibold tracking-tight text-balance lg:text-4xl">
                See the number before your next renewal call.
              </h2>
              <p className="text-ink-soft mt-3 max-w-xl leading-relaxed">
                Every month it runs, the waste keeps billing. The scan is free
                and takes minutes. Pay only if you keep monitoring.
              </p>
            </div>
            <div className="lg:max-w-md lg:shrink-0">
              <SignInButtons
                signInEnabled={signInOk}
                signInHref={signInHref}
                demoEnabled={demoEnabled}
                showNote={false}
              />
              <p className="text-ink-faint mt-3 text-xs">
                Start free with a 14-day trial. No credit card, read-only
                access.
              </p>
            </div>
          </div>
        </div>
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
