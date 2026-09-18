"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { BrandMark } from "~/components/BrandMark";
import { SUPPORT_MAILTO } from "~/lib/support";

const SOCIAL_LINKS = [
  {
    href: "https://github.com/ugurkocde/licensemeter",
    label: "GitHub",
    path: "M12 .5C5.37.5 0 5.87 0 12.5c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58 0-.29-.01-1.04-.02-2.05-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.33-1.76-1.33-1.76-1.09-.74.08-.73.08-.73 1.2.09 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.49.99.11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6.01 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.24 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.62-5.49 5.92.43.37.81 1.1.81 2.22 0 1.6-.01 2.9-.01 3.29 0 .32.21.7.82.58A12.01 12.01 0 0 0 24 12.5C24 5.87 18.63.5 12 .5Z",
  },
  {
    href: "https://x.com/ugurkocde",
    label: "X",
    path: "M18.9 1.5h3.68l-8.04 9.19L24 22.5h-7.4l-5.8-7.58-6.64 7.58H.48l8.6-9.83L0 1.5h7.59l5.24 6.93L18.9 1.5Zm-1.29 18.79h2.04L6.49 3.6H4.3l13.31 16.69Z",
  },
];

const ENGLISH = {
  description:
    "License waste analytics for Microsoft 365 and connected SaaS. Read-only, EU-hosted, built for IT and finance.",
  hosted: "Hosted in the EU",
  support: "Email support",
  columns: [
    {
      title: "Product",
      links: [
        ["/#get-started", "Start free"],
        ["/msp", "For MSPs"],
        ["/connectors", "Connectors"],
        ["/security", "Security"],
        ["/faq", "FAQ"],
      ],
    },
    {
      title: "Learn",
      links: [
        ["/waste", "Waste patterns"],
        ["/sample-report", "Sample report"],
        ["/roi", "ROI calculator"],
        ["/compare/m365-admin-center", "vs M365 admin center"],
      ],
    },
    {
      title: "Legal",
      links: [
        ["/trust-center", "Trust Center"],
        ["/impressum", "Imprint"],
        ["/privacy", "Privacy"],
        ["/terms", "Terms"],
        ["/dpa", "Data Processing Agreement"],
      ],
    },
    {
      title: "Contact",
      links: [
        ["/support", "Contact support"],
        ["/trust-center#subprocessors", "Subprocessors"],
      ],
    },
  ],
  copyright: "operated by UgurLabs",
  legal:
    "Independent tool, not affiliated with the vendors named on this site. All product names are trademarks of their respective owners.",
} as const;

const GERMAN = {
  description:
    "Analyse von Lizenzverschwendung für Microsoft 365 und verbundene SaaS-Dienste. Schreibgeschützt, in der EU gehostet, für IT und Finanzen.",
  hosted: "In der EU gehostet",
  support: "Support per E-Mail",
  columns: [
    {
      title: "Produkt",
      links: [
        ["/de/security", "Sicherheit"],
        ["/de/trust-center", "Trust Center"],
        ["/connectors", "Konnektoren (EN)"],
      ],
    },
    {
      title: "Informationen",
      links: [
        ["/de/dpa", "Auftragsverarbeitung"],
        ["/status", "Systemstatus (EN)"],
        ["/faq", "FAQ (EN)"],
      ],
    },
    {
      title: "Rechtliches",
      links: [
        ["/impressum", "Impressum"],
        ["/privacy", "Datenschutz (EN)"],
        ["/terms", "Nutzungsbedingungen (EN)"],
      ],
    },
    {
      title: "Kontakt",
      links: [
        ["/support", "Support (EN)"],
        ["/de/trust-center#subprocessors", "Unterauftragsverarbeiter"],
      ],
    },
  ],
  copyright: "betrieben von UgurLabs",
  legal:
    "Unabhängiges Werkzeug ohne Verbindung zu den auf dieser Website genannten Anbietern. Alle Produktnamen sind Marken ihrer jeweiligen Inhaber.",
} as const;

export const MarketingFooter = ({ year }: { year: number }) => {
  const german = usePathname().startsWith("/de/");
  const copy = german ? GERMAN : ENGLISH;
  return (
    <footer className="border-line bg-card border-t">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-12 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <div className="font-display flex items-center gap-2 text-lg tracking-tight">
            <BrandMark size={18} />
            <span>
              License<span className="text-brand-text">Meter</span>
            </span>
          </div>
          <p className="text-ink-soft mt-3 max-w-xs text-sm leading-relaxed">
            {copy.description}
          </p>
          <p className="border-line-strong text-ink-soft bg-canvas mt-4 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium">
            <span
              aria-hidden="true"
              className="bg-brand inline-block size-1.5 rounded-full"
            />
            {copy.hosted}
          </p>
          <div className="mt-4 flex items-center gap-2">
            {SOCIAL_LINKS.map((social) => (
              <a
                key={social.label}
                href={social.href}
                target="_blank"
                rel="noreferrer"
                aria-label={social.label}
                className="border-line-strong text-ink-soft hover:border-brand hover:text-ink focus-visible:ring-brand bg-canvas inline-flex size-11 touch-manipulation items-center justify-center rounded-lg border transition-colors focus-visible:ring-2"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="size-4"
                  aria-hidden="true"
                >
                  <path d={social.path} />
                </svg>
              </a>
            ))}
          </div>
        </div>
        {copy.columns.map((column) => (
          <div key={column.title}>
            <h3 className="text-ink-faint text-xs font-medium tracking-[0.18em] uppercase">
              {column.title}
            </h3>
            {column.title === (german ? "Kontakt" : "Contact") && (
              <a
                href={SUPPORT_MAILTO}
                className="border-line-strong text-ink hover:border-brand bg-canvas mt-3 inline-flex min-h-11 items-center rounded-xl border px-4 py-2 text-sm font-medium"
              >
                {copy.support}
              </a>
            )}
            <ul className="mt-2 flex flex-col">
              {column.links.map(([href, label]) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="text-ink-soft hover:text-ink inline-flex min-h-11 items-center text-sm underline-offset-4 hover:underline"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-line text-ink-faint mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 border-t px-6 py-6 text-xs">
        <span>
          &copy; {year} LicenseMeter, {copy.copyright}
        </span>
        <span className="max-w-3xl">{copy.legal}</span>
      </div>
    </footer>
  );
};
