import type { Metadata } from "next";
import Link from "next/link";

import { isDemoMode, signInEnabled, signInPath, siteUrl } from "~/env";
import { SignInButtons } from "~/components/SignInButtons";
import { ComparisonTable } from "~/components/compare/ComparisonTable";
import { CorrectionNote } from "~/components/compare/CorrectionNote";
import { statusQuoSourcePath } from "~/lib/compare";
import { powershellAudit } from "~/lib/compare/status-quo/powershell-audit";
import { CONNECTOR_SCOPES } from "~/lib/scopes";

export const metadata: Metadata = {
  title: "LicenseMeter vs a manual PowerShell audit",
  description:
    "An honest comparison for admins who audit Microsoft 365 licenses with Get-MgUser and Get-MgSubscribedSku: what a script does well, and what continuous, priced, joined-signal monitoring adds.",
  alternates: { canonical: "/compare/powershell-audit" },
};

const BASE = siteUrl();

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
        the audit has to be joined across signals, priced in your currency and
        repeated every month.
      </p>

      <section className="mt-14">
        <h2 className="font-display text-2xl tracking-tight">
          Side by side, dimension by dimension
        </h2>
        <ComparisonTable comparison={powershellAudit} />
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
              A list of stale SKU assignments starts a debate; a monthly cost
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

      <CorrectionNote repoPath={statusQuoSourcePath(powershellAudit.slug)} />

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
