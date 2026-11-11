import type { Metadata } from "next";

import { isDemoMode, signInEnabled, signInPath, siteUrl } from "~/env";
import { RoiCalculator } from "~/components/RoiCalculator";
import { SignInButtons } from "~/components/SignInButtons";
import { DEMO_FIGURES, demoEuros } from "~/lib/demoFigures";

export const metadata: Metadata = {
  title: "Microsoft 365 license waste calculator",
  description:
    "Estimate what unused Microsoft 365 licenses cost you per month: seats times per-seat cost times an assumed waste share. Runs entirely in your browser, no data leaves the page.",
  alternates: { canonical: "/roi" },
};

const BASE = siteUrl();

/*
 * What typically produces the waste the calculator asks you to assume.
 * Every entry mirrors one of the detection rules in ~/lib/rules.ts and the
 * README rules table; no invented statistics, only the mechanism.
 */
const WASTE_DRIVERS = [
  {
    title: "Offboarding leaks",
    body: "An account gets disabled in Entra ID, but its licenses stay assigned. The seat keeps billing every month until someone notices. This is the classic leak: leavers accumulate quietly, one or two per departure.",
  },
  {
    title: "Seats that never started",
    body: "Licenses assigned ahead of onboarding, for a project that fizzled, or by an over-broad group rule. The user never signs in and never touches a workload, yet the seat is paid from day one.",
  },
  {
    title: "Seats that went quiet",
    body: "People change roles, tools change, and a licensed account stops signing in to Exchange, OneDrive, SharePoint or Teams. Without a last-activity check across those workloads, the seat looks fine in the admin center.",
  },
  {
    title: "Shelfware, overlaps and add-ons",
    body: "Purchased seats that were never assigned to anyone, suites paid alongside standalone plans that duplicate them, Copilot add-ons nobody uses, and paid licenses sitting on guest accounts. None of this shows up in a headcount comparison.",
  },
] as const;

/* Static breadcrumb; "<" escaped so nothing can terminate the script. */
const ROI_LD = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: BASE },
    {
      "@type": "ListItem",
      position: 2,
      name: "License waste calculator",
      item: `${BASE}/roi`,
    },
  ],
};

export default function RoiPage() {
  const demoEnabled = isDemoMode();
  const signInOk = signInEnabled();
  const signInHref = signInPath();

  return (
    <main className="mx-auto max-w-5xl px-6 pt-6 pb-24">
      <p className="text-brand-text text-xs font-medium tracking-[0.2em] uppercase">
        ROI calculator
      </p>
      <h1 className="font-display mt-4 text-4xl tracking-tight text-balance">
        Microsoft 365 license waste calculator
      </h1>
      <p className="text-ink-soft mt-4 max-w-2xl text-lg leading-relaxed">
        Put in your paid seat count, your monthly cost per seat and a waste
        share you consider plausible, and see what that assumption costs per
        month and per year. The estimate runs entirely in your browser, and a
        free read-only scan replaces it with your tenant&rsquo;s real number.
      </p>

      <div className="mt-10">
        <RoiCalculator />
      </div>

      <section className="mt-14">
        <h2 className="font-display text-2xl tracking-tight">
          What typically drives license waste
        </h2>
        <p className="text-ink-soft mt-3 max-w-2xl text-sm leading-relaxed">
          The waste share you pick above is an assumption, but the mechanisms
          behind it are concrete. These are the patterns LicenseMeter&rsquo;s
          detection rules look for in real tenants:
        </p>
        <div className="border-line bg-line mt-8 grid gap-px border sm:grid-cols-2">
          {WASTE_DRIVERS.map((driver) => (
            <div key={driver.title} className="bg-card px-6 py-6">
              <h3 className="font-display text-xl tracking-tight">
                {driver.title}
              </h3>
              <p className="text-ink-soft mt-3 text-sm leading-relaxed">
                {driver.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-14 grid gap-10 md:grid-cols-2">
        <div>
          <h2 className="font-display text-2xl tracking-tight">
            How the calculator works
          </h2>
          <p className="text-ink-soft mt-3 text-sm leading-relaxed">
            Seats times monthly cost per seat times your assumed waste share: no
            more, no less. The math runs in integer cents, the annual figure is
            twelve times the monthly one. LicenseMeter is free regardless of
            seat count. Nothing you type is sent anywhere.
          </p>
        </div>
        <div className="border-line bg-card border px-6 py-6">
          <h2 className="text-ink-faint text-xs font-medium tracking-[0.18em] uppercase">
            From assumption to detection
          </h2>
          <p className="text-ink-soft mt-3 text-sm leading-relaxed">
            A scan replaces the slider with findings: LicenseMeter joins
            directory data, license assignments, sign-in activity and usage
            reports read-only, then prices every wasted seat from an editable
            price book prefilled with list-price estimates, because there is no
            Microsoft API for your negotiated prices. The sample tenant of{" "}
            {DEMO_FIGURES.users} people shows{" "}
            <span className="tnum text-waste-text font-mono">
              € {demoEuros(DEMO_FIGURES.monthlyWasteCents)}
            </span>{" "}
            a month across {DEMO_FIGURES.findingsCount} findings, each with the
            account, the rule and the monthly cost attached.
          </p>
          <p className="text-ink-faint mt-3 text-xs">
            Every finding exports to CSV for finance, and IT gets a generated
            PowerShell remediation script to review and run. LicenseMeter itself
            never changes licenses in your tenant.
          </p>
        </div>
      </section>

      {/* Final CTA band, same pattern as the landing page and /msp. */}
      <section className="border-line mt-14 border-t pt-10">
        <h2 className="font-display text-3xl tracking-tight text-balance">
          Stop estimating. See your number.
        </h2>
        <p className="text-ink-soft mt-3 max-w-xl leading-relaxed">
          Connect read-only and the free scan replaces every assumption on this
          page with real tenant data, priced per seat and per month.
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
          __html: JSON.stringify(ROI_LD).replaceAll("<", "\\u003c"),
        }}
      />
    </main>
  );
}
