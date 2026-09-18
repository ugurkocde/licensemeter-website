import type { Metadata } from "next";
import Link from "next/link";

import { isDemoMode, signInEnabled, signInPath, siteUrl } from "~/env";
import { SignInButtons } from "~/components/SignInButtons";
import { CONNECTOR_SCOPES } from "~/lib/scopes";

export const metadata: Metadata = {
  title: "LicenseMeter vs a manual PowerShell audit",
  description:
    "An honest comparison for admins who audit Microsoft 365 licenses with Get-MgUser and Get-MgSubscribedSku: what a script does well, and what continuous, priced, joined-signal monitoring adds.",
  alternates: { canonical: "/compare/powershell-audit" },
};

const BASE = siteUrl();

/*
 * Every LicenseMeter cell is grounded in the codebase: the rules in
 * ~/lib/rules.ts, the read-only scopes in ~/lib/scopes.ts, the graceful
 * degradation described in README.md, the price book, the acknowledge/reopen
 * finding actions and the CSV/PowerShell exports. No invented numbers.
 */
const COMPARISON_ROWS = [
  {
    dimension: "Cost",
    script:
      "Free, apart from the hours it takes to write, run and interpret the output.",
    licensemeter:
      "Free for every tenant, including continuous monitoring and exports.",
  },
  {
    dimension: "Data gathering",
    script:
      "Separate calls: Get-MgUser for accounts, Get-MgSubscribedSku for seat counts, audit logs for sign-ins, usage reports per workload. You join the results yourself.",
    licensemeter:
      "One nightly sync joins directory data, license assignments, sign-in activity and per-workload usage reports into a single per-user picture.",
  },
  {
    dimension: "Sign-in activity",
    script:
      "signInActivity needs Entra ID P1. Without it, your script has to fall back to workload reports, and you have to build that fallback.",
    licensemeter:
      "Same Graph constraint, handled for you: without P1, inactivity detection automatically falls back to per-workload usage reports.",
  },
  {
    dimension: "Euro figures",
    script:
      "SKU GUIDs and part numbers. Mapping them to what a seat actually costs is a manual lookup you repeat every run.",
    licensemeter:
      "Every finding carries a monthly euro figure from an editable per-tenant price book, prefilled with list-price estimates.",
  },
  {
    dimension: "Cadence",
    script:
      "Runs when someone remembers to run it. Between runs, new leavers and new idle seats bill unnoticed.",
    licensemeter:
      "Nightly sync plus manual sync, with full sync history. Waste is monitored month after month, not sampled once.",
  },
  {
    dimension: "Findings workflow",
    script:
      "Console output or a CSV you triage in a spreadsheet. Re-running the script forgets what you already decided.",
    licensemeter:
      "Findings persist with an acknowledge and reopen workflow, so the seats you have already handled stay handled across syncs.",
  },
  {
    dimension: "Finance handoff",
    script:
      "You format the export yourself and explain the columns in the email.",
    licensemeter:
      "One-click CSV export of all findings with their monthly cost, written for the finance side of the renewal conversation.",
  },
  {
    dimension: "Remediation",
    script: "You write the cleanup script, and you own every line of it.",
    licensemeter:
      "Generates the PowerShell remediation script for you. Your IT reviews and runs it; LicenseMeter itself never writes to the tenant.",
  },
  {
    dimension: "Beyond Microsoft 365",
    script:
      "Graph cmdlets stop at the tenant boundary. Adobe, Zoom or Salesforce seats need separate scripts against separate admin APIs.",
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
      name: "LicenseMeter vs a manual PowerShell audit",
      item: `${BASE}/compare/powershell-audit`,
    },
  ],
};

export default function PowershellAuditComparePage() {
  const demoEnabled = isDemoMode();
  const signInOk = signInEnabled();
  const signInHref = signInPath();

  return (
    <main className="mx-auto max-w-5xl px-6 pt-6 pb-24">
      <p className="text-brand-text text-xs font-medium tracking-[0.2em] uppercase">
        Compare
      </p>
      <h1 className="font-display mt-4 text-4xl tracking-tight text-balance">
        LicenseMeter vs a manual PowerShell audit
      </h1>
      <p className="text-ink-soft mt-4 max-w-2xl text-lg leading-relaxed">
        If you can write{" "}
        <code className="tnum font-mono text-base">Get-MgUser</code> and{" "}
        <code className="tnum font-mono text-base">Get-MgSubscribedSku</code>{" "}
        one-liners, you can audit licenses for free, and for a one-off check
        that is a perfectly good answer. This page is about what changes when
        the audit has to be joined across signals, priced in euros and repeated
        every month.
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
                  Manual PowerShell
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
                    {row.script}
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
          When a script is enough
        </h2>
        <p className="text-ink-soft mt-3 max-w-3xl text-sm leading-relaxed">
          Honestly: often. A tenant small enough to eyeball, a single question
          like &ldquo;which disabled accounts still hold licenses?&rdquo;, a
          one-time cleanup before a renewal, or a team that already maintains
          Graph scripts and enjoys it - in all of those cases, PowerShell is
          free, transparent and entirely under your control. LicenseMeter
          exports its remediation as PowerShell precisely because we expect your
          IT to keep working that way: it complements the shell, it does not
          replace it.
        </p>
      </section>

      <section className="mt-14">
        <h2 className="font-display text-2xl tracking-tight">
          What a script cannot easily give you
        </h2>
        <div className="mt-6 grid gap-8 md:grid-cols-2">
          <div>
            <h3 className="font-display text-xl tracking-tight">
              The join, maintained
            </h3>
            <p className="text-ink-soft mt-3 text-sm leading-relaxed">
              The hard part is not any single cmdlet, it is joining accounts,
              license assignments, sign-in activity and Exchange, OneDrive,
              SharePoint and Teams usage per user, and keeping that join working
              when the tenant lacks Entra ID P1 or conceals report names,
              Microsoft&rsquo;s default since 2021. LicenseMeter detects both
              cases and degrades rule by rule instead of failing the run.
            </p>
          </div>
          <div>
            <h3 className="font-display text-xl tracking-tight">
              Memory between runs
            </h3>
            <p className="text-ink-soft mt-3 text-sm leading-relaxed">
              A script produces a snapshot. Monitoring needs state: which
              findings are new since last month, which you acknowledged, which
              came back. LicenseMeter keeps findings across nightly syncs with
              acknowledge and reopen actions, so the audit becomes a process
              rather than a yearly archaeology project.
            </p>
          </div>
          <div>
            <h3 className="font-display text-xl tracking-tight">
              Numbers finance accepts
            </h3>
            <p className="text-ink-soft mt-3 text-sm leading-relaxed">
              A list of stale SKU assignments starts a debate; a monthly euro
              figure starts a decision. The per-tenant price book prices every
              finding, prefilled with list-price estimates and editable to your
              negotiated rates, and the CSV export hands finance the list in
              their own format.
            </p>
          </div>
          <div>
            <h3 className="font-display text-xl tracking-tight">
              A safer permission story
            </h3>
            <p className="text-ink-soft mt-3 text-sm leading-relaxed">
              Ad-hoc scripts run with whatever rights your admin account has.
              LicenseMeter uses exactly {CONNECTOR_SCOPES.length} read-only
              application permissions (
              {CONNECTOR_SCOPES.map((s) => s.scope).join(", ")}), granted once
              via admin consent and listed in full on the{" "}
              <Link
                href="/security"
                className="text-ink hover:text-brand-text font-medium underline underline-offset-4"
              >
                security overview
              </Link>
              . No write scope exists.
            </p>
          </div>
        </div>
      </section>

      {/* Final CTA band, same pattern as the landing page and /msp. */}
      <section className="border-line mt-14 border-t pt-10">
        <h2 className="font-display text-3xl tracking-tight text-balance">
          Keep your scripts. Skip the joining.
        </h2>
        <p className="text-ink-soft mt-3 max-w-xl leading-relaxed">
          Connect read-only, get the joined, priced findings in minutes, and
          take away a generated PowerShell script your team reviews and runs.
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
