import type { CSSProperties } from "react";
import Link from "next/link";

import { env, isDemoMode } from "~/env";
import { EmailCapture } from "~/components/EmailCapture";
import { RoiCalculator } from "~/components/RoiCalculator";
import { SignInButtons } from "~/components/SignInButtons";
import { Pill, type PillTone } from "~/components/ui";
import {
  DEMO_ANNUAL_WASTE_ROUNDED,
  DEMO_FIGURES,
  demoEuros,
} from "~/lib/demoFigures";
import { ALL_RULES } from "~/lib/rules";
import { getScanStats } from "~/server/marketingStats";

/** "12,4": German decimal convention, matching the euro figures around it. */
const fmtPct = (n: number): string =>
  new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(n);

/* Plain-text names by design: referencing compatibility is nominative use;
 * official logos would need each vendor's permission (see footer notice). */
const CONNECTOR_STRIP: Array<{
  name: string;
  href: string;
  blurb: string;
  tag?: string;
  tone?: PillTone;
}> = [
  {
    name: "Microsoft 365",
    tag: "Core",
    tone: "moss",
    href: "/security",
    blurb: "The full scan: licenses, sign-in activity and usage reports.",
  },
  {
    name: "Adobe",
    href: "/connectors/adobe",
    blurb: "Creative Cloud seats held by people who are disabled or gone.",
  },
  {
    name: "Zoom",
    href: "/connectors/zoom",
    blurb: "Licensed seats nobody has opened since Teams took over.",
  },
  {
    name: "Atlassian",
    href: "/connectors/atlassian",
    blurb: "Jira and Confluence seats that outlived their users.",
  },
  {
    name: "Salesforce",
    href: "/connectors/salesforce",
    blurb: "CRM licenses, the most expensive seats to forget.",
  },
  {
    name: "OpenAI",
    href: "/connectors/openai",
    blurb: "API spend by day, plus departed people still on the console.",
  },
  {
    name: "Anthropic",
    href: "/connectors/anthropic",
    blurb: "Claude API costs tracked daily, console access cross-checked.",
  },
  {
    name: "ChatGPT",
    href: "/connectors/chatgpt",
    blurb: "Enterprise seats matched against your directory via CSV import.",
  },
  {
    name: "Claude",
    href: "/connectors/claude",
    blurb: "Team and Enterprise seats that outlived their users.",
  },
];

/* Ledger lines render from the tested demo figures and sum exactly to the
 * headline: the card is a synthetic sample tenant, not customer proof. */
const LEDGER_LINES = [
  {
    label: "Left the company, still licensed",
    cents: DEMO_FIGURES.byCategory.leavers,
    tone: "rust",
  },
  {
    label: "App seats with no directory account",
    cents: DEMO_FIGURES.byCategory.orphaned,
    tone: "plum",
  },
  {
    label: "Inactive 90+ days or never used",
    cents: DEMO_FIGURES.byCategory.idle,
    tone: "gold",
  },
  {
    label: "Copilot seats never opened",
    cents: DEMO_FIGURES.byCategory.copilotUnused,
    tone: "plum",
  },
  {
    label: "Unassigned paid seats",
    cents: DEMO_FIGURES.byCategory.shelfware,
    tone: "slate",
  },
  {
    label: "Licensed guest accounts",
    cents: DEMO_FIGURES.byCategory.guests,
    tone: "teal",
  },
] as const;

const TRUST_ITEMS = [
  "Built by Microsoft MVP Ugur Koc",
  "Exact Graph permissions shown before consent",
  "Read-only access, no mailbox or file content",
  "EU storage details documented",
  "Disconnect deletes everything",
] as const;

const SECURITY_POINTS = [
  {
    title: "Procurement sees the number",
    body: `The demo tenant shows € ${demoEuros(
      DEMO_FIGURES.monthlyWasteCents,
    )}/mo of recoverable spend before anyone exports a report.`,
  },
  {
    title: "IT keeps control",
    body: "LicenseMeter asks for read-only access, shows the consent path first and leaves remediation in your tenant.",
  },
  {
    title: "Finance gets proof",
    body: "Every finding has a monthly euro impact, a category and an export path instead of a generic dashboard score.",
  },
] as const;

const STEPS = [
  {
    n: "01",
    title: "Consent once",
    body: "A Global Admin grants read-only application permissions. No agent, no write access, five minutes.",
  },
  {
    n: "02",
    title: "Join the evidence",
    body: "Directory, license assignments, sign-in activity, usage reports and connected app seats are checked against who still works there.",
  },
  {
    n: "03",
    title: "Price every leak",
    body: `${ALL_RULES.length} waste rules classify the finding and calculate the monthly impact in euros.`,
  },
  {
    n: "04",
    title: "Reclaim with proof",
    body: "Export the finance CSV or hand IT the generated PowerShell script for the seats you decide to remove.",
  },
] as const;

const SCAN_STREAM = [
  "Directory status",
  "License assignments",
  "Sign-in activity",
  "Usage reports",
  "Connected app seats",
  "Daily AI spend",
] as const;

// Mirrors the tiers on /pricing - keep both in sync.
const PRICING_TEASER = [
  { name: "Starter", price: "79", seats: "up to 250 seats" },
  { name: "Growth", price: "199", seats: "up to 1.000 seats" },
  { name: "Scale", price: "499", seats: "up to 2.500 seats" },
] as const;

const HERO_METRICS = [
  {
    label: "Sample data",
    value: `${DEMO_FIGURES.users}`,
    suffix: "users",
  },
  {
    label: "Findings",
    value: `${DEMO_FIGURES.findingsCount}`,
    suffix: "priced",
  },
  {
    label: "Rules",
    value: `${ALL_RULES.length}`,
    suffix: "active",
  },
] as const;

const trustItemClass =
  "after:mx-4 after:text-line-strong after:content-['/'] last:after:content-none sm:after:mx-6";

const barStyle = (cents: number): CSSProperties & { "--bar": string } => ({
  "--bar": `${Math.max(
    8,
    Math.round((cents / DEMO_FIGURES.monthlyWasteCents) * 100),
  )}%`,
});

/* Static with daily revalidation: the only time-sensitive content is the
 * current month in the ledger-card header, and up to a day of staleness at a
 * month rollover is acceptable. Keeps the page CDN-cacheable for visitors and
 * crawlers alike. */
export const revalidate = 86400;

export default async function LandingPage() {
  const entraConfigured = Boolean(env.AUTH_MICROSOFT_ENTRA_ID_ID);
  const demoEnabled = isDemoMode();
  const month = new Date().toLocaleString("en-US", { month: "long" });
  /* Build/ISR-time aggregate; null (renders nothing) until the numbers are
   * worth quoting. Reads the db without any request-bound API, so the route
   * stays fully static. */
  const stats = await getScanStats();

  return (
    <main>
      <section id="get-started" className="relative overflow-hidden">
        <div
          className="enterprise-grid absolute inset-0 opacity-70"
          aria-hidden="true"
        />
        <div className="relative mx-auto max-w-6xl px-6 pt-6 pb-8 lg:pt-8 lg:pb-10">
          <div className="grid gap-7 lg:grid-cols-[0.95fr_1.25fr] lg:items-center">
            <div className="rise rise-1">
              <p className="text-rust-text text-xs font-medium tracking-[0.2em] uppercase">
                Microsoft 365 renewal waste scan
              </p>
              <h1 className="font-display mt-4 max-w-3xl text-4xl leading-[1.02] tracking-tight text-balance md:text-5xl xl:text-[4.15rem]">
                Find the paid seats that outlived your users.
              </h1>
              <p className="text-ink-soft mt-4 max-w-2xl text-base leading-relaxed xl:text-lg">
                For Microsoft 365 admins and finance/procurement teams at
                100-2,500 seats. LicenseMeter finds offboarding and renewal
                waste, prices it in euros, and gives you proof before the next
                renewal conversation.
              </p>
              <p className="text-ink-soft mt-3 max-w-2xl text-sm leading-relaxed">
                Read-only scan: license assignments, sign-in activity and usage
                reports. No mailbox or file content.
              </p>
              <div className="mt-6">
                <SignInButtons
                  entraConfigured={entraConfigured}
                  demoEnabled={demoEnabled}
                  showNote={false}
                />
              </div>
              <p className="text-ink-faint mt-3 max-w-xl text-xs leading-relaxed">
                First scan free. Paid plans start at EUR 79/month only after you
                decide to keep monitoring.
              </p>
              <ul className="text-ink-soft mt-5 flex flex-wrap gap-y-2 text-[13px]">
                {TRUST_ITEMS.map((item, index) => (
                  <li
                    key={item}
                    className={`${trustItemClass} ${
                      index > 1 ? "hidden xl:list-item" : ""
                    }`}
                  >
                    {item}
                  </li>
                ))}
                <li className={trustItemClass}>
                  <Link
                    href="/security"
                    className="text-ink hover:text-rust-text font-medium underline underline-offset-4 transition-colors"
                  >
                    Security overview
                  </Link>
                </li>
              </ul>
              {stats && (
                <p className="text-ink-faint mt-4 text-[13px]">
                  Across {stats.tenants} connected tenants, an average of{" "}
                  {fmtPct(stats.avgWastePct)} percent of license spend is waste.
                </p>
              )}
            </div>

            <div
              id="sample-tenant"
              className="ledger-shell rise rise-3 border-line bg-card relative scroll-mt-8 border shadow-[0_16px_40px_rgba(28,26,22,0.10)]"
            >
              <div className="border-line bg-paper/70 relative grid grid-cols-3 border-b">
                {HERO_METRICS.map((metric, index) => (
                  <div
                    key={metric.label}
                    className={`px-3 py-3 sm:px-4 sm:py-4 ${
                      index > 0 ? "border-line border-l" : ""
                    }`}
                  >
                    <div className="text-ink-faint text-[10px] font-medium tracking-[0.14em] uppercase sm:text-[11px] sm:tracking-[0.18em]">
                      {metric.label}
                    </div>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="tnum font-display text-ink text-2xl tracking-tight sm:text-3xl">
                        {metric.value}
                      </span>
                      <span className="text-ink-soft text-xs">
                        {metric.suffix}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="relative grid xl:grid-cols-[1fr_0.72fr]">
                <div className="px-4 py-5 sm:px-6">
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <div>
                      <p className="text-ink-faint text-xs font-medium tracking-[0.18em] uppercase">
                        Waste ledger · {month}
                      </p>
                      <div className="font-display text-rust-text mt-2 text-4xl tracking-tight sm:mt-3 sm:text-6xl">
                        € {demoEuros(DEMO_FIGURES.monthlyWasteCents)}
                      </div>
                    </div>
                    <div className="text-left sm:text-right">
                      <p className="text-rust-text text-[11px] font-medium tracking-[0.14em] uppercase">
                        Synthetic demo tenant
                      </p>
                      <p className="text-ink-faint font-mono text-xs">
                        Meridian Industries GmbH
                      </p>
                      <p className="text-ink-soft mt-1 text-xs">
                        about € {DEMO_ANNUAL_WASTE_ROUNDED} a year
                      </p>
                    </div>
                  </div>

                  <ul className="mt-5 hidden space-y-3 xl:block">
                    {LEDGER_LINES.map((line) => (
                      <li key={line.label}>
                        <div className="flex items-baseline justify-between gap-4">
                          <span className="text-ink-soft text-sm">
                            {line.label}
                          </span>
                          <span className="tnum text-ink font-mono text-sm whitespace-nowrap">
                            € {demoEuros(line.cents)}
                            <span className="text-ink-faint">/mo</span>
                          </span>
                        </div>
                        <div className="bg-line mt-2 h-1.5 overflow-hidden">
                          <div
                            className={`meter-bar meter-${line.tone} h-full`}
                            style={barStyle(line.cents)}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>

                <aside className="border-line bg-ink text-paper hidden border-t px-4 py-5 xl:block xl:border-t-0 xl:border-l">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-paper/60 text-[11px] font-medium tracking-[0.18em] uppercase">
                      Sample tenant scan
                    </p>
                    <span className="status-dot" aria-hidden="true" />
                  </div>
                  <ol className="mt-5 space-y-3">
                    {SCAN_STREAM.map((item, index) => (
                      <li
                        key={item}
                        className="border-paper/10 flex items-center justify-between gap-3 border-b pb-3 last:border-b-0"
                      >
                        <span className="text-paper/80 text-sm">{item}</span>
                        <span className="text-rust-bright font-mono text-[11px]">
                          0{index + 1}
                        </span>
                      </li>
                    ))}
                  </ol>
                  <div className="border-paper/10 bg-paper/5 mt-6 border p-4">
                    <div className="text-paper/50 font-mono text-[11px] tracking-[0.14em] uppercase">
                      Read-only consent
                    </div>
                    <p className="text-paper/80 mt-2 text-sm leading-relaxed">
                      License, directory and usage metadata only. No mailbox or
                      file content.
                    </p>
                  </div>
                  {demoEnabled && (
                    <form
                      action="/api/auth/demo"
                      method="post"
                      className="mt-5"
                    >
                      <button className="border-paper/20 text-paper hover:border-rust-bright hover:text-rust-bright w-full cursor-pointer border px-4 py-3 text-left text-sm font-medium transition-colors">
                        Open this sample tenant
                      </button>
                    </form>
                  )}
                </aside>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-line bg-card border-y">
        <div className="bg-line mx-auto grid max-w-6xl gap-px px-6 py-px md:grid-cols-3">
          {SECURITY_POINTS.map((item) => (
            <div key={item.title} className="bg-card px-5 py-6">
              <h2 className="font-display text-xl tracking-tight">
                {item.title}
              </h2>
              <p className="text-ink-soft mt-2 text-sm leading-relaxed">
                {item.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-10 px-6 pt-18 lg:grid-cols-[0.72fr_1.28fr] lg:items-start">
        <div className="lg:sticky lg:top-8">
          <p className="text-rust-text text-xs font-medium tracking-[0.2em] uppercase">
            Product mechanics
          </p>
          <h2 className="font-display mt-3 text-4xl tracking-tight text-balance">
            A license ledger, not another vanity dashboard.
          </h2>
          <p className="text-ink-soft mt-4 leading-relaxed">
            The workflow is built around evidence procurement and IT can both
            inspect: who owns the seat, why it is waste, what it costs and how
            to reclaim it.
          </p>
        </div>

        <div className="grid gap-4">
          {STEPS.map((step) => (
            <article
              key={step.n}
              className="group border-line bg-card hover:border-line-strong grid gap-4 border p-5 transition-[border-color,transform] duration-200 motion-safe:hover:-translate-y-0.5 sm:grid-cols-[5rem_1fr]"
            >
              <div className="text-rust-text font-mono text-xs">{step.n}</div>
              <div>
                <h3 className="font-display text-2xl tracking-tight">
                  {step.title}
                </h3>
                <p className="text-ink-soft mt-2 text-sm leading-relaxed">
                  {step.body}
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pt-18">
        <div className="border-line flex flex-col gap-5 border-b pb-7 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-rust-text text-xs font-medium tracking-[0.2em] uppercase">
              Connector coverage
            </p>
            <h2 className="font-display mt-3 max-w-2xl text-4xl tracking-tight text-balance">
              Cross-check SaaS seats against the directory you already trust.
            </h2>
          </div>
          <Link
            href="/connectors"
            className="text-ink hover:text-rust-text min-h-11 shrink-0 self-start py-3 text-sm font-medium underline underline-offset-4 transition-colors md:self-auto"
          >
            View connector notes
          </Link>
        </div>
        <div className="bg-line grid gap-px sm:grid-cols-2 lg:grid-cols-3">
          {CONNECTOR_STRIP.map((connector) => (
            <Link
              key={connector.name}
              href={connector.href}
              className="group bg-paper hover:bg-card px-5 py-5 transition-colors duration-200"
            >
              <div className="flex min-h-8 items-center gap-2">
                <span className="font-medium underline-offset-4 group-hover:underline">
                  {connector.name}
                </span>
                {connector.tag && connector.tone ? (
                  <Pill tone={connector.tone}>{connector.tag}</Pill>
                ) : null}
              </div>
              <p className="text-ink-soft mt-3 text-sm leading-relaxed">
                {connector.blurb}
              </p>
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-8 px-6 pt-18 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
        <div className="border-line bg-card border">
          <div className="px-6 py-6">
            <p className="text-rust-text text-xs font-medium tracking-[0.2em] uppercase">
              Published pricing
            </p>
            <h2 className="font-display mt-3 text-3xl tracking-tight text-balance">
              Sized by seats, not by how much waste we find.
            </h2>
            <p className="text-ink-soft mt-3 text-sm leading-relaxed">
              See your number free, compare it against the published plan and
              decide with your own tenant data.
            </p>
          </div>
          <div className="border-line grid border-t">
            {PRICING_TEASER.map((tier, index) => (
              <div
                key={tier.name}
                className={`grid grid-cols-[1fr_auto] gap-4 px-6 py-4 ${
                  index > 0 ? "border-line border-t" : ""
                }`}
              >
                <div>
                  <div className="text-ink-faint text-xs font-medium tracking-[0.18em] uppercase">
                    {tier.name}
                  </div>
                  <div className="text-ink-soft mt-1 text-xs">{tier.seats}</div>
                </div>
                <div className="tnum font-display text-right text-2xl tracking-tight">
                  € {tier.price}
                  <span className="text-ink-soft font-sans text-xs">
                    {" "}
                    / month
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="border-line border-t px-6 py-5">
            <Link
              href="/pricing"
              className="text-ink hover:text-rust-text inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4 transition-colors"
            >
              See full pricing
            </Link>
          </div>
        </div>

        <div>
          <h2 className="font-display text-3xl tracking-tight text-balance">
            What does your tenant leak?
          </h2>
          <p className="text-ink-soft mt-3 max-w-xl leading-relaxed">
            Your assumptions, your math. The scan replaces guesses with your
            actual number.
          </p>
          <div className="mt-6">
            <RoiCalculator />
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-8 px-6 pt-18 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="border-line bg-card border px-6 py-6">
          <h2 className="font-display text-2xl tracking-tight">
            Built by Ugur Koc
          </h2>
          <p className="text-ink-soft mt-3 text-sm leading-relaxed">
            I am a Microsoft MVP for Intune and Security Copilot, and I build{" "}
            <a
              href="https://github.com/ugurkocde"
              target="_blank"
              rel="noreferrer"
              className="text-ink hover:text-rust-text font-medium underline underline-offset-4 transition-colors"
            >
              open-source tools for Microsoft 365 admins
            </a>{" "}
            (IntuneAssignmentChecker, IntuneBrew, DeviceOffboardingManager).
            LicenseMeter asks for read-only access to your tenant, so you should
            know exactly who is behind it. I answer support myself.
          </p>
          <Link
            href="/security"
            className="text-ink hover:text-rust-text mt-4 inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4 transition-colors"
          >
            Read the security overview
          </Link>
        </div>

        <div
          id="request-scan"
          className="border-line bg-ink text-paper scroll-mt-8 border px-6 py-6"
        >
          <h2 className="font-display text-2xl tracking-tight">
            Need the one-pager first?
          </h2>
          <p className="text-paper/75 mt-3 text-sm leading-relaxed">
            Leave your email and the security one-pager plus a getting-started
            guide for your first scan land in your inbox right away. One short
            note follows when billing starts. Unsubscribe any time.
          </p>
          <div className="mt-5">
            <EmailCapture statusTone="dark" />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pt-18 pb-24">
        <div className="border-line bg-card relative overflow-hidden border px-6 py-8 sm:px-8 lg:px-10">
          <div
            className="enterprise-grid absolute inset-0 opacity-55"
            aria-hidden="true"
          />
          <div className="relative flex flex-col gap-7 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-rust-text text-xs font-medium tracking-[0.2em] uppercase">
                Free read-only scan
              </p>
              <h2 className="font-display mt-3 max-w-2xl text-4xl tracking-tight text-balance">
                See the waste ledger before the next renewal conversation.
              </h2>
              <p className="text-ink-soft mt-3 max-w-2xl leading-relaxed">
                {demoEnabled
                  ? "Run the free read-only scan on your Microsoft 365 tenant. If you need to look around first, the sample tenant is still available."
                  : "Connect read-only and see the monthly cost of every wasted seat before you decide anything."}
              </p>
            </div>
            <div className="lg:max-w-md">
              <SignInButtons
                entraConfigured={entraConfigured}
                demoEnabled={demoEnabled}
                showNote={false}
              />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
