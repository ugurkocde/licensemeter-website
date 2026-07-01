import Link from "next/link";
import {
  Calculator,
  Check,
  Download,
  PiggyBank,
  Receipt,
  Search,
  Terminal,
  TrendingDown,
} from "lucide-react";

import { isDemoMode, signInEnabled, signInPath, siteUrl } from "~/env";
import { SignInButtons } from "~/components/SignInButtons";
import { HeroVisual } from "~/components/landing/HeroVisual";
import { Reveal } from "~/components/landing/Reveal";
import { buttonClass } from "~/components/ui";
import {
  DEMO_ANNUAL_WASTE_ROUNDED,
  DEMO_FIGURES,
  demoEuros,
} from "~/lib/demoFigures";
import { MSP_PRICE_EUR, PLANS, TRIAL_DAYS } from "~/lib/plans";
import { SITE_DEFINITION } from "~/lib/site";
import { SUPPORT_MAILTO } from "~/lib/support";

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
    title: "Every seat, priced",
    body: "Each wasted seat carries a euro-per-month figure, summed to one recoverable total. Not a vanity score.",
  },
  {
    Icon: Receipt,
    title: "Evidence, per seat",
    body: "Who owns it, which app, why it's waste, and since when. Proof procurement and IT can both act on.",
  },
  {
    Icon: Download,
    title: "Reclaim, don't just report",
    body: "Export a finance CSV or a ready-to-run PowerShell script to remove the seats you choose.",
  },
] as const;

/* We don't yet have an aggregate "average customer" figure to quote honestly,
 * so the savings band pairs a sourced industry benchmark with the one number
 * we can stand behind today: the live demo tenant (see demoFigures.ts). Swap
 * in a real cross-tenant average once enough paying tenants make that an
 * honest claim rather than a guess. */
const SAVINGS_STATS = [
  {
    Icon: TrendingDown,
    value: "36%",
    label: "of purchased SaaS seats sit unused",
    detail: "Industry-wide average across organizations, every vendor.",
    source: "Zylo, 2026 SaaS Management Index",
  },
  {
    Icon: PiggyBank,
    value: `€ ${demoEuros(DEMO_FIGURES.monthlyWasteCents)}`,
    unit: "/mo",
    label: "found in our live demo tenant",
    detail: `${DEMO_FIGURES.users} seats, real rules — about € ${DEMO_ANNUAL_WASTE_ROUNDED}/yr.`,
    source: "Sample tenant below, not an average customer",
  },
  {
    Icon: Search,
    value: "€ 0",
    label: "to find your own number",
    detail: `Free scan, then ${TRIAL_DAYS} days of monitoring, free.`,
    source: "No credit card, read-only access",
  },
] as const;

const HERO_TRUST = [
  "Read-only consent, exact scopes shown up front",
  "Never reads mailbox, files or content",
  "EU data residency (Frankfurt)",
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
 * straight from PLANS (monthly, EUR). "<" escaped so nothing can terminate the
 * script. */
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
  ],
};

/* Fully static marketing page; daily revalidation is a safe default that keeps
 * it CDN-cacheable while letting copy/pricing edits propagate within a day. */
export const revalidate = 86400;

export default async function LandingPage() {
  const signInOk = signInEnabled();
  const signInHref = signInPath();
  const demoEnabled = isDemoMode();
  const trialHref = signInOk ? signInHref : "#get-started";

  return (
    <main>
      {/* 1 — Hero */}
      <section id="get-started" className="relative overflow-hidden">
        <div className="brand-radial absolute inset-0" aria-hidden="true" />
        <div className="relative mx-auto max-w-6xl px-6 pt-10 pb-14 lg:pt-16 lg:pb-20">
          <div className="grid gap-10 lg:grid-cols-[0.92fr_1.08fr] lg:items-center">
            <div className="rise rise-1">
              <p className="text-brand-text text-xs font-medium tracking-[0.12em] uppercase">
                Subscription waste, priced in euros
              </p>
              <h1 className="font-display mt-4 text-4xl leading-[1.05] font-semibold tracking-tight text-balance md:text-5xl xl:text-[4rem]">
                You&rsquo;re paying for subscriptions nobody uses.
              </h1>
              <p className="text-ink-soft mt-5 max-w-xl text-base leading-relaxed lg:text-lg">
                Adobe, Microsoft, Atlassian and your AI tools quietly bill for
                seats that left, sit idle, or were never opened. LicenseMeter
                checks every seat against your directory and shows the waste{" "}
                <span className="text-brand-text font-semibold">
                  in euros, in one view.
                </span>
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
                  After the free scan, {TRIAL_DAYS} days of full monitoring,
                  free. No credit card, read-only access.
                </p>
              </div>
            </div>

            <div id="sample-tenant" className="rise rise-3 scroll-mt-8">
              <HeroVisual />
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
            </div>
          </div>
        </div>
      </section>

      {/* 3 — Savings stats */}
      <section className="mx-auto max-w-6xl px-6 py-16 lg:py-20">
        <div className="max-w-2xl">
          <p className="text-brand-text text-xs font-medium tracking-[0.12em] uppercase">
            How much is on the table
          </p>
          <h2 className="font-display mt-3 text-3xl font-semibold tracking-tight text-balance lg:text-4xl">
            Most teams are overpaying without knowing the number.
          </h2>
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {SAVINGS_STATS.map((stat) => (
            <article
              key={stat.label}
              className="border-line bg-card shadow-card h-full rounded-2xl border p-6"
            >
              <span className="bg-waste-soft text-waste-text ring-waste/10 inline-flex size-12 items-center justify-center rounded-2xl ring-1">
                <stat.Icon className="size-6" strokeWidth={1.75} />
              </span>
              <div className="font-display tnum mt-4 text-3xl font-semibold tracking-tight whitespace-nowrap">
                {stat.value}
                {"unit" in stat && (
                  <span className="text-ink-faint text-base font-normal">
                    {stat.unit}
                  </span>
                )}
              </div>
              <p className="text-ink mt-2 text-sm font-medium">{stat.label}</p>
              <p className="text-ink-soft mt-1.5 text-sm leading-relaxed">
                {stat.detail}
              </p>
              <p className="text-ink-faint mt-3 text-xs">{stat.source}</p>
            </article>
          ))}
        </div>
        <p className="text-ink-faint mt-6 text-xs leading-relaxed">
          Figures above are an industry benchmark and one worked example, not a
          guarantee &mdash; what your tenant recovers depends on how it&rsquo;s
          actually licensed. Run the free scan to see your own number.
        </p>
      </section>

      {/* 4 — Value cards */}
      <section className="mx-auto max-w-6xl px-6 py-16 lg:py-24">
        <div className="max-w-2xl">
          <h2 className="font-display text-3xl font-semibold tracking-tight text-balance lg:text-4xl">
            A bill you can actually cut.
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

      {/* 5 — Pricing */}
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
            Every plan starts with a {TRIAL_DAYS}-day free trial, no card
            required
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
                First scan free, then free for {TRIAL_DAYS} days, then €{" "}
                {p.monthly}/month.
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
            Running Microsoft 365 for many client tenants?{" "}
            <Link
              href="/msp"
              className="text-brand-text font-medium underline underline-offset-4 hover:opacity-80"
            >
              € {MSP_PRICE_EUR} per tenant on the MSP plan →
            </Link>
            <br className="hidden sm:block" />
            <span className="text-ink-faint">
              Over 2.500 seats in one tenant?{" "}
              <a
                href={SUPPORT_MAILTO}
                className="font-medium underline underline-offset-4 hover:opacity-80"
              >
                Talk to us →
              </a>
            </span>
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
                Start free with a {TRIAL_DAYS}-day trial. No credit card,
                read-only access.
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
