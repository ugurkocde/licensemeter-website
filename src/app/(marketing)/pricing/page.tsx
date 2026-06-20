import type { Metadata } from "next";
import Link from "next/link";

import { siteUrl } from "~/env";
import { ButtonLink } from "~/components/ui";
import {
  DEMO_ANNUAL_WASTE_ROUNDED,
  DEMO_FIGURES,
  demoEuros,
} from "~/lib/demoFigures";
import { ALL_RULES } from "~/lib/rules";
import { SITE_DEFINITION } from "~/lib/site";
import { SUPPORT_MAILTO } from "~/lib/support";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Flat monthly pricing per tenant, sized by seat count. Every plan starts with a free waste scan.",
};

const TIERS = [
  {
    name: "Starter",
    price: "79",
    seats: "up to 250 seats",
    featured: false,
  },
  {
    name: "Growth",
    price: "199",
    seats: "up to 1.000 seats",
    featured: true,
  },
  {
    name: "Scale",
    price: "499",
    seats: "up to 2.500 seats",
    featured: false,
  },
] as const;

const BASE = siteUrl();

/* Growth annual cost, computed from the tier price so the payback copy can
 * never drift from the card. German thousands format, whole euros. */
const GROWTH_MONTHLY = Number(TIERS.find((t) => t.name === "Growth")!.price);
const GROWTH_ANNUAL = new Intl.NumberFormat("de-DE").format(
  GROWTH_MONTHLY * 12,
);

/* SoftwareApplication with concrete EUR offers: the machine-readable price
 * list answer engines quote instead of guessing. Static content from TIERS;
 * "<" escaped so nothing can terminate the script element. */
const PRICING_LD = {
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
      publisher: { "@id": `${BASE}/#organization` },
      offers: TIERS.map((tier) => ({
        "@type": "Offer",
        name: tier.name,
        price: tier.price,
        priceCurrency: "EUR",
        // Google requires availability or priceValidUntil for price snippets.
        availability: "https://schema.org/InStock",
        description: `Per tenant, per month, ${tier.seats}`,
        url: `${BASE}/pricing`,
      })),
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: BASE },
        {
          "@type": "ListItem",
          position: 2,
          name: "Pricing",
          item: `${BASE}/pricing`,
        },
      ],
    },
  ],
};

const INCLUDED = [
  // Count computed from the engine so the copy cannot go stale.
  `All ${ALL_RULES.length} waste rules with monthly euro impact`,
  "Unlimited workspace members (finance viewers included)",
  "Nightly sync, manual sync, full sync history",
  "Editable price book with list-price estimates",
  "CSV exports and generated PowerShell remediation scripts",
  "EU data residency, deletion on disconnect",
];

export default function PricingPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 pt-6 pb-24">
      <p className="text-xs font-medium tracking-[0.2em] text-rust-text uppercase">
        Pricing
      </p>
      <h1 className="mt-4 font-display text-4xl tracking-tight text-balance">
        Flat per tenant. Sized by seats, not by your waste.
      </h1>
      <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-soft">
        Every plan starts the same way: connect read-only and see your waste
        number for free. The subscription is for acting on it month after
        month. Licenses leak every time someone joins, moves or leaves.
      </p>

      <div className="mt-12 grid gap-px border border-line bg-line md:grid-cols-3">
        {TIERS.map((tier) => (
          <div
            key={tier.name}
            className={`flex flex-col bg-card px-6 py-6 ${
              tier.featured ? "outline outline-2 -outline-offset-1 outline-ink" : ""
            }`}
          >
            <div className="flex items-baseline justify-between">
              <h2 className="text-xs font-medium tracking-[0.18em] text-ink-faint uppercase">
                {tier.name}
              </h2>
              {tier.featured && (
                <span className="bg-ink px-2 py-0.5 text-[11px] font-medium tracking-wide text-paper uppercase">
                  Most common
                </span>
              )}
            </div>
            <div className="mt-4 font-display text-4xl tracking-tight">
              € {tier.price}
              <span className="font-sans text-sm text-ink-soft"> / month</span>
            </div>
            <div className="mt-1 text-sm text-ink-soft">{tier.seats}</div>
            <div className="mt-6">
              <ButtonLink
                href="/#get-started"
                variant={tier.featured ? "primary" : "secondary"}
                className="w-full"
              >
                Start with a free scan
              </ButtonLink>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-4 text-sm text-ink-soft">
        More than 2.500 seats or managing multiple tenants as an MSP?{" "}
        <a
          href={SUPPORT_MAILTO}
          className="font-medium text-ink underline underline-offset-4 hover:text-rust-text"
        >
          Talk to us.
        </a>{" "}
        The portfolio view, per-client price books and QBR reports are on the{" "}
        <Link
          href="/msp"
          className="font-medium text-ink underline underline-offset-4 hover:text-rust-text"
        >
          MSP page
        </Link>
        .
      </p>

      <section className="mt-14 grid gap-10 md:grid-cols-2">
        <div>
          <h2 className="font-display text-2xl tracking-tight">
            Every plan includes
          </h2>
          <ul className="mt-4 flex flex-col gap-2 text-sm text-ink-soft">
            {INCLUDED.map((item) => (
              <li key={item} className="flex gap-3">
                <span aria-hidden="true" className="mt-0.5 text-moss">·</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div className="border border-line bg-card px-6 py-6">
          <h2 className="text-xs font-medium tracking-[0.18em] text-ink-faint uppercase">
            Does it pay for itself?
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">
            A single Microsoft 365 E3 seat is roughly{" "}
            <span className="tnum font-mono">€ 440</span> a year, a Copilot
            seat about <span className="tnum font-mono">€ 340</span>. The
            Growth plan costs{" "}
            <span className="tnum font-mono">€ {GROWTH_ANNUAL}</span> a year.
            Six reclaimed E3 seats cover it. The live demo tenant of{" "}
            {DEMO_FIGURES.users} people shows{" "}
            <span className="tnum font-mono text-rust-text">
              € {demoEuros(DEMO_FIGURES.monthlyWasteCents)}
            </span>{" "}
            a month recoverable, about{" "}
            <span className="tnum font-mono text-rust-text">
              € {DEMO_ANNUAL_WASTE_ROUNDED}
            </span>{" "}
            a year.
          </p>
          <p className="mt-3 text-xs text-ink-faint">
            Billing is not switched on yet. Workspaces that connect now use
            LicenseMeter free until it is, and you will hear from me well
            before anything costs money.
          </p>
        </div>
      </section>

      <p className="mt-12 text-sm text-ink-soft">
        Questions about scopes or data handling first? Read the{" "}
        <Link
          href="/security"
          className="font-medium text-ink underline underline-offset-4 hover:text-rust-text"
        >
          security overview
        </Link>{" "}
        or the{" "}
        <Link
          href="/faq"
          className="font-medium text-ink underline underline-offset-4 hover:text-rust-text"
        >
          FAQ
        </Link>
        .
      </p>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(PRICING_LD).replaceAll("<", "\\u003c"),
        }}
      />
    </main>
  );
}
