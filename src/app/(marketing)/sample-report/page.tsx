import type { Metadata } from "next";
import Link from "next/link";

import { isDemoMode, signInEnabled, signInPath, siteUrl } from "~/env";
import { SignInButtons } from "~/components/SignInButtons";
import {
  DEMO_ANNUAL_WASTE_ROUNDED,
  DEMO_FIGURES,
  demoEuros,
} from "~/lib/demoFigures";

export const metadata: Metadata = {
  title: "Sample license waste report - synthetic demo tenant",
  description: `A walkthrough of a LicenseMeter license waste report, computed from the synthetic ${DEMO_FIGURES.users}-user demo tenant: per-rule findings with euro figures, the weekly digest, the monthly PDF report and the PowerShell remediation. Not a customer story.`,
  alternates: { canonical: "/sample-report" },
};

const BASE = siteUrl();

/*
 * Every figure on this page comes from DEMO_FIGURES, which
 * demoFigures.test.ts recomputes from the demo fixtures and the rules engine.
 * The tenant is a synthetic fixture, labeled as such throughout - this page
 * must never read as a customer case study.
 */
const HEADLINE_STATS = [
  { label: "Users", value: String(DEMO_FIGURES.users) },
  {
    label: "Microsoft 365 spend / month",
    value: `€ ${demoEuros(DEMO_FIGURES.monthlySpendCents)}`,
  },
  { label: "Findings", value: String(DEMO_FIGURES.findingsCount) },
  {
    label: "Recoverable / month",
    value: `€ ${demoEuros(DEMO_FIGURES.monthlyWasteCents)}`,
  },
] as const;

/* Same category labels as the landing ledger card, so the two views of the
 * demo tenant can never drift apart. Sums to monthlyWasteCents. */
const FINDING_ROWS = [
  {
    category: "Left the company, still licensed",
    flags:
      "Accounts disabled in Entra ID that still hold Microsoft 365 or connected-app seats: the classic offboarding leak.",
    cents: DEMO_FIGURES.byCategory.leavers,
  },
  {
    category: "Inactive 90+ days or never used",
    flags:
      "Licensed people with no sign-in and no Exchange, OneDrive, SharePoint or Teams activity inside the window, or none ever.",
    cents: DEMO_FIGURES.byCategory.idle,
  },
  {
    category: "Unassigned paid seats",
    flags:
      "Purchased seats no one is assigned to: prepaid units minus consumed units, per SKU (shelfware).",
    cents: DEMO_FIGURES.byCategory.shelfware,
  },
  {
    category: "Copilot seats never opened",
    flags: "Copilot licenses with no Copilot activity in 60 days.",
    cents: DEMO_FIGURES.byCategory.copilotUnused,
  },
  {
    category: "App seats with no directory account",
    flags:
      "Connected-app seats whose owner has no Entra ID account at all - orphans left behind by manual admin-console work.",
    cents: DEMO_FIGURES.byCategory.orphaned,
  },
  {
    category: "Licensed guest accounts",
    flags: "Guest users holding paid licenses.",
    cents: DEMO_FIGURES.byCategory.guests,
  },
] as const;

/* Static breadcrumb; "<" escaped so nothing can terminate the script. */
const SAMPLE_REPORT_LD = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: BASE },
    {
      "@type": "ListItem",
      position: 2,
      name: "Sample license waste report",
      item: `${BASE}/sample-report`,
    },
  ],
};

export default function SampleReportPage() {
  const demoEnabled = isDemoMode();
  const signInOk = signInEnabled();
  const signInHref = signInPath();

  return (
    <main className="mx-auto max-w-5xl px-6 pt-6 pb-24">
      <p className="text-brand-text text-xs font-medium tracking-[0.2em] uppercase">
        Sample report
      </p>
      <h1 className="font-display mt-4 text-4xl tracking-tight text-balance">
        What a license waste report looks like
      </h1>
      <p className="bg-brand-soft text-brand-deep mt-5 inline-flex items-center rounded-full px-4 py-2 text-sm font-medium">
        Synthetic demo tenant - explore it yourself, no account needed
      </p>
      <p className="text-ink-soft mt-4 max-w-2xl text-lg leading-relaxed">
        This is not a customer story. &ldquo;{DEMO_FIGURES.orgName}&rdquo; is a
        fictional fixture tenant of {DEMO_FIGURES.users} users, deliberately
        seeded with all six waste patterns so you can see a full report before
        connecting anything. Every euro figure below is computed from that
        fixture by the same rules engine that scans real tenants, and the demo
        workspace showing these exact numbers is one click away.
      </p>

      <section className="mt-14">
        <h2 className="font-display text-2xl tracking-tight">
          The tenant on the scanner
        </h2>
        <p className="text-ink-soft mt-3 max-w-3xl text-sm leading-relaxed">
          A mid-sized organization as the rules engine sees one: a mix of E3,
          Business Premium, Copilot and connected-app seats, a directory with
          the usual history of joiners, movers and leavers, and admin consoles
          that were tidied less often than the org chart changed.
        </p>
        <dl className="border-line bg-line mt-8 grid gap-px border sm:grid-cols-2 lg:grid-cols-4">
          {HEADLINE_STATS.map((stat) => (
            <div key={stat.label} className="bg-card px-5 py-5">
              <dt className="text-ink-faint text-xs font-medium tracking-[0.18em] uppercase">
                {stat.label}
              </dt>
              <dd className="font-display tnum mt-2 text-2xl tracking-tight">
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>
        <p className="text-ink-faint mt-3 text-xs">
          Synthetic figures from the demo fixture, recomputed by the test suite
          so this page cannot drift from what the live demo shows.
        </p>
      </section>

      <section className="mt-14">
        <h2 className="font-display text-2xl tracking-tight">
          What the first scan surfaces
        </h2>
        <p className="text-ink-soft mt-3 max-w-3xl text-sm leading-relaxed">
          One read-only sync joins directory status, license assignments,
          sign-in activity and per-workload usage, then the rules engine prices
          what it finds: {DEMO_FIGURES.findingsCount} findings worth{" "}
          <span className="tnum text-waste-text font-mono">
            € {demoEuros(DEMO_FIGURES.monthlyWasteCents)}
          </span>{" "}
          a month, about{" "}
          <span className="tnum text-waste-text font-mono">
            € {DEMO_ANNUAL_WASTE_ROUNDED}
          </span>{" "}
          a year.
        </p>
        <div className="border-line mt-8 overflow-x-auto border">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-line bg-card border-b text-left">
                <th className="text-ink-faint px-4 py-3 text-xs font-medium tracking-[0.18em] uppercase">
                  Finding category
                </th>
                <th className="text-ink-faint px-4 py-3 text-xs font-medium tracking-[0.18em] uppercase">
                  What the rule flags
                </th>
                <th className="text-ink-faint px-4 py-3 text-right text-xs font-medium tracking-[0.18em] uppercase">
                  Waste / month
                </th>
              </tr>
            </thead>
            <tbody>
              {FINDING_ROWS.map((row) => (
                <tr
                  key={row.category}
                  className="border-line border-b last:border-b-0"
                >
                  <th
                    scope="row"
                    className="text-ink px-4 py-4 text-left align-top font-medium"
                  >
                    {row.category}
                  </th>
                  <td className="text-ink-soft px-4 py-4 align-top leading-relaxed">
                    {row.flags}
                  </td>
                  <td className="tnum px-4 py-4 text-right align-top font-mono whitespace-nowrap">
                    € {demoEuros(row.cents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-ink-soft mt-6 max-w-3xl text-sm leading-relaxed">
          The offboarding line is the one worth reading twice:{" "}
          {DEMO_FIGURES.leaverCount} disabled accounts still hold licenses, and{" "}
          {DEMO_FIGURES.crossVendorLeaverCount} of them also kept Adobe, Zoom,
          Atlassian, Salesforce or AI seats - waste no single admin console
          shows, because each one only sees its own slice. Every finding names
          the account, the rule, the evidence and the monthly cost from the
          editable price book.
        </p>
      </section>

      <section className="mt-14">
        <h2 className="font-display text-2xl tracking-tight">
          What arrives without logging in
        </h2>
        <div className="mt-6 grid gap-8 md:grid-cols-2">
          <div>
            <h3 className="font-display text-xl tracking-tight">
              The weekly digest
            </h3>
            <p className="text-ink-soft mt-3 text-sm leading-relaxed">
              Workspace owners and admins get a short email with the current
              waste number, what changed in the last seven days and the largest
              open findings. Waste that appears between visits - a leaver kept a
              seat, a license went idle - stops depending on someone remembering
              to check.
            </p>
          </div>
          <div>
            <h3 className="font-display text-xl tracking-tight">
              The monthly PDF report
            </h3>
            <p className="text-ink-soft mt-3 text-sm leading-relaxed">
              Once a month a board-ready PDF lands in the same inboxes: the
              recoverable total, every open finding priced, and the trend since
              last month. For this tenant that is the{" "}
              <span className="tnum text-waste-text font-mono">
                € {demoEuros(DEMO_FIGURES.monthlyWasteCents)}
              </span>{" "}
              figure, ready to forward to whoever owns the renewal.
            </p>
          </div>
        </div>
      </section>

      <section className="mt-14">
        <h2 className="font-display text-2xl tracking-tight">
          What remediation looks like
        </h2>
        <div className="mt-6 grid gap-8 md:grid-cols-2">
          <div>
            <h3 className="font-display text-xl tracking-tight">
              A script your IT reviews and runs
            </h3>
            <p className="text-ink-soft mt-3 text-sm leading-relaxed">
              For the seats you decide to reclaim, LicenseMeter generates the
              PowerShell remediation script - the same Graph cmdlets your team
              would write by hand, scoped to exactly the chosen findings. Your
              IT reads it, edits it if they like, and runs it themselves.
              LicenseMeter holds no write permission and never changes the
              tenant.
            </p>
          </div>
          <div>
            <h3 className="font-display text-xl tracking-tight">
              Acknowledge what stays
            </h3>
            <p className="text-ink-soft mt-3 text-sm leading-relaxed">
              Not every flagged seat is waste - the CFO&rsquo;s barely used
              license stays. Acknowledging a finding records that decision, and
              because findings persist across nightly syncs, it stays recorded.
              If the situation changes, the finding reopens instead of
              resurfacing as new. Finance gets the CSV of whatever remains open,
              priced per month.
            </p>
          </div>
        </div>
      </section>

      {/* Final CTA band, same pattern as the landing page and /msp. */}
      <section className="border-line mt-14 border-t pt-10">
        <h2 className="font-display text-3xl tracking-tight text-balance">
          Open the demo workspace, then get your own number.
        </h2>
        <p className="text-ink-soft mt-3 max-w-xl leading-relaxed">
          The sample tenant behind this page is browsable without an account:
          every finding, the price book, the exports. When you have seen enough,
          a free read-only scan replaces the synthetic figures with yours - the{" "}
          <Link
            href="/security"
            className="text-ink hover:text-brand-text font-medium underline underline-offset-4"
          >
            security overview
          </Link>{" "}
          lists every permission up front.
        </p>
        <div className="mt-8">
          <SignInButtons
            signInEnabled={signInOk}
            signInHref={signInHref}
            demoEnabled={demoEnabled}
            primaryLabel="Run my free scan"
          />
        </div>
      </section>

      <p className="text-ink-faint mt-10 text-xs">
        All figures on this page describe the synthetic demo workspace, not a
        customer environment. LicenseMeter is free, including continuous
        monitoring. No credit card required.
      </p>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(SAMPLE_REPORT_LD).replaceAll("<", "\\u003c"),
        }}
      />
    </main>
  );
}
