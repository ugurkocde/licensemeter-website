import type { Metadata } from "next";
import Link from "next/link";

import { isDemoMode, signInEnabled, signInPath, siteUrl } from "~/env";
import { SignInButtons } from "~/components/SignInButtons";

export const metadata: Metadata = {
  title: "LicenseMeter vs tracking licenses in Excel",
  description:
    "An honest comparison for IT and finance teams who keep a license spreadsheet: what a sheet does well, where it fails silently, and what live sync, activity-joined findings and a price book add.",
  alternates: { canonical: "/compare/excel-license-tracking" },
};

const BASE = siteUrl();

/*
 * The spreadsheet cells describe failure modes any owner of a license sheet
 * recognizes; no invented statistics. Every LicenseMeter cell is grounded in
 * the codebase: nightly sync with history, the rules in ~/lib/rules.ts, the
 * price book, the acknowledge/reopen workflow and the CSV/PowerShell exports.
 */
const COMPARISON_ROWS = [
  {
    dimension: "Cost",
    spreadsheet:
      "Free, apart from the hours spent keeping it honest - and those hours are the whole product.",
    licensemeter:
      "Free for every tenant, including continuous monitoring and exports.",
  },
  {
    dimension: "Freshness",
    spreadsheet:
      "Accurate on the day someone updates it, stale the day after. Licenses move without the sheet hearing about it.",
    licensemeter:
      "Synced nightly from the source systems, with manual sync on demand and a full sync history.",
  },
  {
    dimension: "Activity signal",
    spreadsheet:
      "None. A spreadsheet records what someone typed, not whether the seat was ever opened.",
    licensemeter:
      "Joins license assignments with sign-in activity and per-workload usage reports, so idle and never-used seats surface with evidence.",
  },
  {
    dimension: "Staff changes",
    spreadsheet:
      "Breaks silently. Leavers stay listed as active until someone remembers to edit the row, and nobody is notified that nobody did.",
    licensemeter:
      "Disabled accounts still holding paid seats surface automatically, including the Adobe, Zoom or other connected-app seats the same people kept.",
  },
  {
    dimension: "Per-seat cost",
    spreadsheet:
      "Formulas someone built once and now has to update whenever prices, tiers or seat mixes change.",
    licensemeter:
      "An editable per-tenant price book prices every finding in euros per month, prefilled with list-price estimates.",
  },
  {
    dimension: "Coverage",
    spreadsheet:
      "Whatever columns someone added. Every new vendor means another tab and more manual entry.",
    licensemeter:
      "Connectors cross-check Microsoft 365, Adobe, Zoom, Atlassian, Salesforce, OpenAI, Anthropic, ChatGPT and Claude seats against Entra ID in the same pass.",
  },
  {
    dimension: "Findings workflow",
    spreadsheet:
      "Cell colors and comments, reconciled across the copies of the file that inevitably exist.",
    licensemeter:
      "Findings persist across syncs with an acknowledge and reopen workflow, so decisions survive the next update.",
  },
  {
    dimension: "Finance handoff",
    spreadsheet:
      "Already a spreadsheet, which is genuinely convenient - but the numbers are only as current as the last edit.",
    licensemeter:
      "One-click CSV export of all findings with owner, rule and monthly euro cost, current as of last night's sync.",
  },
  {
    dimension: "Remediation",
    spreadsheet: "A to-do column. The actual cleanup happens somewhere else.",
    licensemeter:
      "Generates the PowerShell remediation script for the seats you choose. Your IT reviews and runs it; LicenseMeter itself never writes to the tenant.",
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
      name: "LicenseMeter vs tracking licenses in Excel",
      item: `${BASE}/compare/excel-license-tracking`,
    },
  ],
};

export default function ExcelLicenseTrackingComparePage() {
  const demoEnabled = isDemoMode();
  const signInOk = signInEnabled();
  const signInHref = signInPath();

  return (
    <main className="mx-auto max-w-5xl px-6 pt-6 pb-24">
      <p className="text-brand-text text-xs font-medium tracking-[0.2em] uppercase">
        Compare
      </p>
      <h1 className="font-display mt-4 text-4xl tracking-tight text-balance">
        LicenseMeter vs tracking licenses in Excel
      </h1>
      <p className="text-ink-soft mt-4 max-w-2xl text-lg leading-relaxed">
        A license spreadsheet is free, endlessly flexible and easy to hand to an
        auditor, which is why almost every IT team has one. This page is about
        the two things a sheet structurally cannot know: what changed since the
        last edit, and whether anyone actually uses the seats it lists.
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
                  License spreadsheet
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
                    {row.spreadsheet}
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
          When a spreadsheet is enough
        </h2>
        <p className="text-ink-soft mt-3 max-w-3xl text-sm leading-relaxed">
          Honestly: more often than vendors like to admit. A handful of
          subscriptions, one person who owns the sheet and actually maintains
          it, a once-a-year inventory before a renewal - a spreadsheet handles
          all of that for free. It is also genuinely good at what it was made
          for: contract metadata like renewal dates, owners and notes, which no
          API will ever tell you. The sheet fails only when it is asked to be a
          monitoring system, because it cannot observe anything.
        </p>
      </section>

      <section className="mt-14">
        <h2 className="font-display text-2xl tracking-tight">
          What LicenseMeter adds to the sheet
        </h2>
        <div className="mt-6 grid gap-8 md:grid-cols-2">
          <div>
            <h3 className="font-display text-xl tracking-tight">
              Live sync instead of manual entry
            </h3>
            <p className="text-ink-soft mt-3 text-sm leading-relaxed">
              Directory accounts, license assignments and connected-app seats
              are read from the source systems every night, read-only. Nobody
              retypes anything, so nothing goes quietly stale, and the sync
              history shows exactly when each picture was taken.
            </p>
          </div>
          <div>
            <h3 className="font-display text-xl tracking-tight">
              Findings, not rows
            </h3>
            <p className="text-ink-soft mt-3 text-sm leading-relaxed">
              A sheet lists seats; LicenseMeter joins each seat with sign-in and
              usage activity and flags the ones that are wasted: leavers still
              licensed, seats idle for 90 days or never opened, unassigned paid
              seats, unused Copilot, licensed guests. Each finding names the
              account, the rule and the evidence.
            </p>
          </div>
          <div>
            <h3 className="font-display text-xl tracking-tight">
              A price book that does the math
            </h3>
            <p className="text-ink-soft mt-3 text-sm leading-relaxed">
              Every finding carries a euro-per-month figure from an editable
              per-tenant price book, prefilled with list-price estimates and
              adjustable to your negotiated rates. When a price changes, you
              edit it once and every figure recalculates - no formula
              maintenance.
            </p>
          </div>
          <div>
            <h3 className="font-display text-xl tracking-tight">
              A workflow, and your exports back
            </h3>
            <p className="text-ink-soft mt-3 text-sm leading-relaxed">
              Findings persist across syncs with acknowledge and reopen actions,
              so decisions are not lost in a copy of the file. And because
              finance still lives in spreadsheets, everything exports back out:
              a CSV of all findings with their monthly cost, plus a generated
              PowerShell script for the cleanup itself.
            </p>
          </div>
        </div>
      </section>

      <section className="border-line bg-card mt-14 border px-6 py-6">
        <h2 className="font-display text-2xl tracking-tight">
          Start from the spreadsheet you already have
        </h2>
        <p className="text-ink-soft mt-3 max-w-3xl text-sm leading-relaxed">
          If you track licenses in a sheet, you already work in exports - so the
          natural first step needs no admin consent at all. The{" "}
          <a
            href={`${signInPath()}?returnTo=${encodeURIComponent("/app/connect/csv")}`}
            className="text-ink hover:text-brand-text font-medium underline underline-offset-4"
          >
            CSV import
          </a>{" "}
          computes your waste number from two Microsoft 365 admin center
          exports, with no consent at all. The link asks you to sign in first.
          If the number justifies it, connect read-only afterwards and let the
          nightly sync take over from the uploads.
        </p>
      </section>

      {/* Final CTA band, same pattern as the landing page and /msp. */}
      <section className="border-line mt-14 border-t pt-10">
        <h2 className="font-display text-3xl tracking-tight text-balance">
          Keep the sheet for contracts. Stop asking it to watch usage.
        </h2>
        <p className="text-ink-soft mt-3 max-w-xl leading-relaxed">
          Connect read-only, get activity-joined, priced findings in minutes,
          and export them straight back to the format finance already reads. The{" "}
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
