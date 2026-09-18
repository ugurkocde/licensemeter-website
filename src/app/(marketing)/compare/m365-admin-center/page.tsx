import type { Metadata } from "next";
import Link from "next/link";

import { isDemoMode, signInEnabled, signInPath, siteUrl } from "~/env";
import { SignInButtons } from "~/components/SignInButtons";

export const metadata: Metadata = {
  title: "LicenseMeter vs the Microsoft 365 admin center",
  description:
    "An honest comparison for admins who work from Billing > Licenses and Reports > Usage: what the admin center answers well, and what a joined, priced, continuously monitored view adds.",
  alternates: { canonical: "/compare/m365-admin-center" },
};

const BASE = siteUrl();

/*
 * Every admin-center cell is grounded in Microsoft's own documentation
 * (learn.microsoft.com: activity-reports overview, active-users-ww,
 * assign-licenses-to-users, reports-show-anonymous-user-name) and every
 * LicenseMeter cell in the codebase: the rules in ~/lib/rules.ts, the price
 * book, the digest and monthly-report crons, and the CSV/PowerShell exports.
 * No invented numbers.
 */
const COMPARISON_ROWS = [
  {
    dimension: "Cost",
    adminCenter:
      "Included with every tenant. The only spend is the admin time it takes to walk the reports.",
    licensemeter:
      "Free for every tenant, including continuous monitoring and exports.",
  },
  {
    dimension: "Assignment counts",
    adminCenter:
      "Authoritative. Billing > Licenses is the source of truth for assigned and unassigned seats per product.",
    licensemeter:
      "Read nightly from the same Graph data. Unassigned paid seats do not just appear in a count: they become priced shelfware findings.",
  },
  {
    dimension: "Activity per user",
    adminCenter:
      "Reports > Usage shows last-activity dates per workload, one report at a time. Microsoft documents that you cannot generate a report for a single account listing which services it uses.",
    licensemeter:
      "One nightly sync joins directory status, license assignments, sign-in activity and Exchange, OneDrive, SharePoint and Teams usage into a single per-user picture.",
  },
  {
    dimension: "User names in reports",
    adminCenter:
      "Concealed by default since September 2021. A Global Administrator can re-enable identifiable names tenant-wide under Org Settings > Reports.",
    licensemeter:
      "Reads the same reports, so the same setting applies. With names concealed, usage findings degrade to aggregate counts while directory-based findings stay per user, and the settings page explains the switch.",
  },
  {
    dimension: "Euro figures",
    adminCenter:
      "License counts and usage counts, with no cost attached to either. There is no Microsoft API that exposes your negotiated seat prices.",
    licensemeter:
      "Every finding carries a monthly euro figure from an editable per-tenant price book, prefilled with list-price estimates.",
  },
  {
    dimension: "Cadence and alerts",
    adminCenter:
      "The reports are there when you go and look. Nothing emails you when a new idle seat starts billing.",
    licensemeter:
      "Nightly sync, a weekly digest with the waste number and the largest open findings, and a monthly board-ready PDF report.",
  },
  {
    dimension: "Offboarding leaks",
    adminCenter:
      "You can filter sign-in-blocked users on the Active users page and check their licenses one by one. Nothing surfaces the pattern for you.",
    licensemeter:
      "Disabled accounts still holding paid seats surface automatically as priced findings, including the connected-app seats the same people still hold.",
  },
  {
    dimension: "Finance handoff",
    adminCenter:
      "Each usage report exports its own CSV, per workload, anonymous by default and without cost columns.",
    licensemeter:
      "One CSV of all findings with owner, rule and monthly euro cost, written for the finance side of the renewal conversation.",
  },
  {
    dimension: "Remediation",
    adminCenter:
      "Point and click, seat by seat, or scripts you write and maintain yourself.",
    licensemeter:
      "Generates the PowerShell remediation script for the seats you choose. Your IT reviews and runs it; LicenseMeter itself never writes to the tenant.",
  },
  {
    dimension: "Beyond Microsoft 365",
    adminCenter:
      "Stops at the Microsoft bill. Adobe, Zoom, Atlassian, Salesforce and the AI consoles each have their own admin pages.",
    licensemeter:
      "Connectors cross-check Adobe, Zoom, Atlassian, Salesforce, OpenAI, Anthropic, ChatGPT and Claude seats against Entra ID in the same pass.",
  },
] as const;

/* Static breadcrumb; "<" escaped so nothing can terminate the script. */
const COMPARE_LD = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: BASE },
    {
      "@type": "ListItem",
      position: 2,
      name: "LicenseMeter vs the Microsoft 365 admin center",
      item: `${BASE}/compare/m365-admin-center`,
    },
  ],
};

export default function M365AdminCenterComparePage() {
  const demoEnabled = isDemoMode();
  const signInOk = signInEnabled();
  const signInHref = signInPath();

  return (
    <main className="mx-auto max-w-5xl px-6 pt-6 pb-24">
      <p className="text-brand-text text-xs font-medium tracking-[0.2em] uppercase">
        Compare
      </p>
      <h1 className="font-display mt-4 text-4xl tracking-tight text-balance">
        LicenseMeter vs the Microsoft 365 admin center
      </h1>
      <p className="text-ink-soft mt-4 max-w-2xl text-lg leading-relaxed">
        The admin center is included, and for what it claims to do it is
        authoritative: Billing &gt; Licenses is the source of truth for
        assignment counts, and Reports &gt; Usage answers most spot-check
        questions. This page is about the questions it stops answering when the
        job is finding waste, pricing it and watching it month after month.
      </p>

      <section className="mt-14">
        <h2 className="font-display text-2xl tracking-tight">
          Side by side, dimension by dimension
        </h2>
        <div className="border-line mt-8 overflow-x-auto border">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-line bg-card border-b text-left">
                <th
                  scope="col"
                  className="text-ink-faint px-4 py-3 text-xs font-medium tracking-[0.18em] uppercase"
                >
                  Dimension
                </th>
                <th
                  scope="col"
                  className="text-ink-faint px-4 py-3 text-xs font-medium tracking-[0.18em] uppercase"
                >
                  M365 admin center
                </th>
                <th
                  scope="col"
                  className="text-ink-faint px-4 py-3 text-xs font-medium tracking-[0.18em] uppercase"
                >
                  LicenseMeter
                </th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON_ROWS.map((row) => (
                <tr
                  key={row.dimension}
                  className="border-line border-b last:border-b-0"
                >
                  <th
                    scope="row"
                    className="text-ink px-4 py-4 text-left align-top font-medium whitespace-nowrap"
                  >
                    {row.dimension}
                  </th>
                  <td className="text-ink-soft px-4 py-4 align-top leading-relaxed">
                    {row.adminCenter}
                  </td>
                  <td className="text-ink-soft bg-card px-4 py-4 align-top leading-relaxed">
                    {row.licensemeter}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="border-line bg-card mt-14 border px-6 py-6">
        <h2 className="font-display text-2xl tracking-tight">
          When the admin center is enough
        </h2>
        <p className="text-ink-soft mt-3 max-w-3xl text-sm leading-relaxed">
          Honestly: for a lot of the daily work. Buying and assigning seats,
          checking counts before a true-up, a quick look at whether Teams
          adoption moved, a tenant small enough to eyeball - the admin center
          does all of that, included and authoritative. Every number
          LicenseMeter shows starts life in the same Graph data the admin center
          reads. The difference is not the data; it is the join, the euro figure
          and the watching.
        </p>
      </section>

      <section className="mt-14">
        <h2 className="font-display text-2xl tracking-tight">
          What the admin center does not do
        </h2>
        <div className="mt-6 grid gap-8 md:grid-cols-2">
          <div>
            <h3 className="font-display text-xl tracking-tight">
              The per-user join
            </h3>
            <p className="text-ink-soft mt-3 text-sm leading-relaxed">
              The usage reports are organized by workload, not by person, and
              Microsoft&rsquo;s own documentation says you cannot generate a
              report where you enter one account and get everything it uses.
              Answering &ldquo;which licensed people have been inactive
              everywhere for 90 days?&rdquo; means exporting several CSVs and
              joining them by hand. That join is exactly what LicenseMeter
              maintains for you, nightly.
            </p>
          </div>
          <div>
            <h3 className="font-display text-xl tracking-tight">
              A euro figure per wasted seat
            </h3>
            <p className="text-ink-soft mt-3 text-sm leading-relaxed">
              Usage reports carry counts, not costs, and no Microsoft API
              exposes the prices your tenant actually pays. LicenseMeter closes
              that gap with an editable per-tenant price book, prefilled with
              list-price estimates and adjustable to your negotiated rates, so
              every finding arrives as euros per month rather than a row count.
            </p>
          </div>
          <div>
            <h3 className="font-display text-xl tracking-tight">
              Watching, not just looking
            </h3>
            <p className="text-ink-soft mt-3 text-sm leading-relaxed">
              The admin center answers when asked; it never volunteers. New
              leavers keeping seats and new idle licenses bill quietly between
              visits. LicenseMeter syncs nightly, keeps findings across runs
              with an acknowledge and reopen workflow, emails a weekly digest
              and delivers a monthly PDF report, so the audit becomes a process
              instead of an errand.
            </p>
          </div>
          <div>
            <h3 className="font-display text-xl tracking-tight">
              Concealed names, on both sides
            </h3>
            <p className="text-ink-soft mt-3 text-sm leading-relaxed">
              Since September 2021 Microsoft conceals user names in usage
              reports by default, in the admin center and in the Graph API
              alike. LicenseMeter is subject to the same setting - no vendor can
              read around it - but it degrades rule by rule: usage-based
              findings become aggregate counts while directory-based findings
              such as disabled accounts, shelfware and guests keep working per
              user, and the settings page explains how a Global Administrator
              re-enables identifiable names for both tools at once.
            </p>
          </div>
        </div>
      </section>

      {/* Final CTA band, same pattern as the landing page and /msp. */}
      <section className="border-line mt-14 border-t pt-10">
        <h2 className="font-display text-3xl tracking-tight text-balance">
          Keep the admin center. Add the joined, priced view.
        </h2>
        <p className="text-ink-soft mt-3 max-w-xl leading-relaxed">
          Connect read-only and the free scan turns the reports you already have
          into per-seat findings with a monthly euro figure attached. The{" "}
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
          __html: JSON.stringify(COMPARE_LD).replaceAll("<", "\\u003c"),
        }}
      />
    </main>
  );
}
