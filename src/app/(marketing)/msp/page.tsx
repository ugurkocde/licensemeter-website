import type { Metadata } from "next";
import Link from "next/link";

import { isDemoMode, siteUrl } from "~/env";
import { buttonClass } from "~/components/ui";
import { DEMO_FIGURES, demoEuros } from "~/lib/demoFigures";
import { SUPPORT_MAILTO } from "~/lib/support";

export const metadata: Metadata = {
  title: "For MSPs",
  description:
    "LicenseMeter for Microsoft-centric MSPs: a portfolio of client tenants sorted by waste, admin consent without shared credentials, per-client price books and a PDF waste report for every QBR.",
};

const STEPS = [
  {
    n: "01",
    title: "You start the flow",
    body: "Sign in with your own account and start the connect flow for the client tenant. No client credentials change hands at any point.",
  },
  {
    n: "02",
    title: "Their Global Administrator (or Privileged Role Administrator) consents",
    body: "The client's admin completes Microsoft's standard admin-consent dialog: read-only application permissions, recorded in their audit log.",
  },
  {
    n: "03",
    title: "You own the workspace",
    body: "The workspace binds to you the moment consent lands, and the first sync starts. The client can revoke the enterprise app in Entra ID at any time.",
  },
] as const;

const FEATURES = [
  {
    title: "Portfolio, sorted by waste",
    body: "Seats, spend, monthly waste, open findings and sync health for every client workspace in one table, sorted by waste so you open the right tenant first.",
  },
  {
    title: "A price book per client",
    body: "Each workspace carries its own prices and currency: list-price estimates prefilled, the client's negotiated rates editable per SKU. Findings are priced in their numbers, not ours.",
  },
  {
    title: "The QBR deliverable",
    body: "A branded PDF waste report per tenant: spend, waste and every finding with its monthly cost. Plus CSV exports for finance and generated PowerShell scripts the client's IT reviews and runs.",
  },
  {
    title: "A digest that does the chasing",
    body: "Each workspace emails its owners and admins a weekly digest with the waste number and the largest open findings. Clients see progress between QBRs without logging in.",
  },
] as const;

const TRUST_ITEMS = [
  "Read-only application permissions (no write scope exists)",
  "Remediation ships as PowerShell scripts, run by the client's IT",
  "EU data residency (Postgres, Frankfurt)",
  "Disconnecting a workspace deletes everything",
] as const;

const BASE = siteUrl();

/* Static breadcrumb; "<" escaped so nothing can terminate the script. */
const MSP_LD = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: BASE },
    {
      "@type": "ListItem",
      position: 2,
      name: "For MSPs",
      item: `${BASE}/msp`,
    },
  ],
};

const Ctas = ({ demoEnabled }: { demoEnabled: boolean }) => (
  <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center">
    {demoEnabled && (
      <form action="/api/auth/demo" method="post">
        <button className={buttonClass("primary", "w-full sm:w-auto")}>
          Open the live demo
        </button>
      </form>
    )}
    <a
      href={SUPPORT_MAILTO}
      className={buttonClass(
        demoEnabled ? "secondary" : "primary",
        "w-full sm:w-auto",
      )}
    >
      Talk to us
    </a>
  </div>
);

export default function MspPage() {
  const demoEnabled = isDemoMode();

  return (
    <main className="mx-auto max-w-5xl px-6 pt-6 pb-24">
      <p className="text-xs font-medium tracking-[0.2em] text-rust-text uppercase">
        For managed service providers
      </p>
      <h1 className="mt-4 font-display text-4xl tracking-tight text-balance">
        Every client tenant. One waste ledger.
      </h1>
      <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-soft">
        You run Microsoft 365 for five, twenty, fifty clients. LicenseMeter
        gives every client tenant its own read-only workspace, and gives you
        one portfolio, sorted by what each client wastes per month.
      </p>
      <div className="mt-8">
        <Ctas demoEnabled={demoEnabled} />
      </div>

      <section className="mt-14">
        <h2 className="font-display text-2xl tracking-tight">
          Connecting a client takes one consent.
        </h2>
        <div className="mt-8 grid gap-10 md:grid-cols-3">
          {STEPS.map((step) => (
            <div key={step.n}>
              <div className="font-mono text-xs text-rust-text">{step.n}</div>
              <h3 className="mt-3 font-display text-xl tracking-tight">
                {step.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-ink-soft">
                {step.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-14 border border-line bg-card px-6 py-6">
        <h2 className="text-xs font-medium tracking-[0.18em] text-ink-faint uppercase">
          The finding your clients pay you to catch
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-ink-soft">
          Offboarding is where client money leaks. LicenseMeter cross-checks
          every Adobe, Zoom, Atlassian, Salesforce, ChatGPT and Claude seat
          against the client&rsquo;s directory, so the account you
          disabled months ago surfaces with the paid seats it still holds. The
          live demo tenant shows the pattern: {DEMO_FIGURES.leaverCount}{" "}
          ex-employees still licensed, {DEMO_FIGURES.crossVendorLeaverCount} of
          them in connected apps. That&rsquo;s{" "}
          <span className="tnum font-mono text-rust-text">
            € {demoEuros(DEMO_FIGURES.byCategory.leavers)}
          </span>{" "}
          a month for people who already left.
        </p>
      </section>

      <section className="mt-14 grid gap-px border border-line bg-line sm:grid-cols-2">
        {FEATURES.map((f) => (
          <div key={f.title} className="bg-card px-6 py-6">
            <h2 className="font-display text-xl tracking-tight">{f.title}</h2>
            <p className="mt-3 text-sm leading-relaxed text-ink-soft">
              {f.body}
            </p>
          </div>
        ))}
      </section>

      <section className="mt-14">
        <h2 className="font-display text-2xl tracking-tight">
          Built to pass your client&rsquo;s security review.
        </h2>
        <ul className="mt-4 flex flex-col gap-2 text-sm text-ink-soft">
          {TRUST_ITEMS.map((item) => (
            <li key={item} className="flex gap-3">
              <span aria-hidden="true" className="mt-0.5 text-moss">·</span>
              {item}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-ink-soft">
          The{" "}
          <Link
            href="/security"
            className="font-medium text-ink underline underline-offset-4 hover:text-rust-text"
          >
            security overview
          </Link>{" "}
          lists every granted scope and what is stored. It is written to be
          forwarded to the client&rsquo;s security team as is.
        </p>
      </section>

      <section className="mt-14 border-t border-line pt-10">
        <h2 className="font-display text-3xl tracking-tight text-balance">
          Bring your worst tenant.
        </h2>
        <p className="mt-3 max-w-xl leading-relaxed text-ink-soft">
          Walk through the demo workspace first, then connect the client you
          suspect most. The first scan is free, read-only, and takes one
          consent.
        </p>
        <div className="mt-8">
          <Ctas demoEnabled={demoEnabled} />
        </div>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(MSP_LD).replaceAll("<", "\\u003c"),
        }}
      />
    </main>
  );
}
