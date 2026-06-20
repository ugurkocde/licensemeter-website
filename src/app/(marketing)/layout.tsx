import Link from "next/link";

import { BrandMark } from "~/components/BrandMark";
import { HeaderAuthCta } from "~/components/HeaderAuthCta";
import { MarketingMobileNav } from "~/components/MarketingMobileNav";
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "~/lib/support";

const NAV = [
  { href: "/pricing", label: "Pricing" },
  { href: "/msp", label: "MSP" },
  { href: "/security", label: "Security" },
  { href: "/faq", label: "FAQ" },
];

const FOOTER_COLUMNS = [
  {
    title: "Product",
    links: [
      { href: "/#get-started", label: "Free waste scan" },
      { href: "/pricing", label: "Pricing" },
      { href: "/msp", label: "For MSPs" },
      { href: "/connectors", label: "Connectors" },
      { href: "/security", label: "Security" },
      { href: "/faq", label: "FAQ" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/impressum", label: "Imprint" },
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
      { href: "/cookies", label: "Cookie policy" },
      { href: "/security#dpa", label: "DPA (on request)" },
    ],
  },
  {
    title: "Contact",
    links: [
      { href: SUPPORT_MAILTO, label: SUPPORT_EMAIL },
      { href: "/security#subprocessors", label: "Subprocessors" },
    ],
  },
];

/*
 * No request-time reads here (cookies, headers): the session-dependent header
 * CTA is resolved client-side by HeaderAuthCta so every marketing route stays
 * statically rendered and CDN-cacheable.
 */
export default function MarketingLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="bg-canvas min-h-screen">
      <a
        href="#content"
        className="focus:border-ink focus:bg-canvas focus:text-ink sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:border focus:px-4 focus:py-2 focus:text-sm focus:font-medium"
      >
        Skip to content
      </a>
      <header className="relative mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-3 gap-y-3 px-6 py-6 sm:gap-x-6">
        <Link
          href="/"
          className="font-display flex items-center gap-2.5 text-lg tracking-tight sm:text-xl"
        >
          <BrandMark size={22} />
          <span>
            License<span className="text-brand-text">Meter</span>
          </span>
        </Link>
        <div className="flex items-center gap-2 sm:gap-5">
          {/* Inline links above sm; below they live in the burger drawer so
              the header keeps only brand + CTA. */}
          <nav aria-label="Main" className="hidden items-center gap-5 sm:flex">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-ink-soft hover:text-ink -my-3 py-3 text-sm underline-offset-4 hover:underline"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <HeaderAuthCta />
          <MarketingMobileNav items={NAV} />
        </div>
      </header>

      {/* Skip-link target. Each marketing page renders its own <main>, so this
          wrapper only carries the id and adds no extra landmark. */}
      <div id="content">{children}</div>

      <footer className="border-line bg-card border-t">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-12 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="font-display flex items-center gap-2 text-lg tracking-tight">
              <BrandMark size={18} />
              <span>
                License<span className="text-brand-text">Meter</span>
              </span>
            </div>
            <p className="text-ink-soft mt-3 max-w-xs text-sm leading-relaxed">
              License waste analytics for Microsoft 365, with Adobe, Zoom,
              Atlassian, Salesforce, OpenAI, Anthropic, ChatGPT and Claude
              connectors. Read-only, EU-hosted, built for IT and finance.
            </p>
          </div>
          {FOOTER_COLUMNS.map((col) => (
            <div key={col.title}>
              <h3 className="text-ink-faint text-xs font-medium tracking-[0.18em] uppercase">
                {col.title}
              </h3>
              {col.title === "Contact" && (
                <a
                  href={SUPPORT_MAILTO}
                  className="border-line-strong text-ink hover:border-brand focus-visible:ring-brand mt-4 inline-flex min-h-11 touch-manipulation items-center justify-center rounded-xl border bg-canvas px-4 py-2.5 text-sm font-medium transition focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-card"
                >
                  Email support
                </a>
              )}
              <ul className="mt-3 flex flex-col gap-2">
                {col.links.map((link) => (
                  <li key={link.label}>
                    {link.href.startsWith("/") ? (
                      <Link
                        href={link.href}
                        className="text-ink-soft hover:text-ink -my-1 py-1 text-sm underline-offset-4 hover:underline"
                      >
                        {link.label}
                      </Link>
                    ) : (
                      <a
                        href={link.href}
                        className="text-ink-soft hover:text-ink -my-1 py-1 text-sm underline-offset-4 hover:underline"
                      >
                        {link.label}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-line text-ink-faint mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 border-t px-6 py-6 text-xs">
          <span>LicenseMeter, operated by UgurLabs UG</span>
          <span>
            Independent tool, not affiliated with Microsoft, Adobe, Zoom,
            Atlassian, Salesforce, ChatGPT or Claude. All product names are
            trademarks of their respective owners.
          </span>
        </div>
      </footer>
    </div>
  );
}
