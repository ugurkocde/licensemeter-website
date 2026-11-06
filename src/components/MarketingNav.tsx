"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { MarketingMobileNav } from "~/components/MarketingMobileNav";
import { DEMO_BOOKING_URL } from "~/lib/support";

const ENGLISH = [
  { href: "/#product-tour", label: "Product" },
  { href: "/connectors", label: "Connectors" },
  { href: "/msp", label: "MSP" },
  { href: "/pricing", label: "Pricing" },
  { href: "/blog", label: "Blog" },
  { href: "/trust-center", label: "Trust Center" },
  { href: "https://docs.licensemeter.com/", label: "Docs" },
  { href: "/support", label: "Support" },
  {
    href: "https://github.com/ugurkocde/licensemeter-website",
    label: "GitHub",
  },
];

const GERMAN = [
  { href: "/de/security", label: "Sicherheit" },
  { href: "/de/trust-center", label: "Trust Center" },
  { href: "/de/dpa", label: "AV-Vertrag" },
  { href: "/de/pricing", label: "Preise" },
  { href: "https://docs.licensemeter.com/", label: "Docs" },
  { href: "/", label: "English" },
  {
    href: "https://github.com/ugurkocde/licensemeter-website",
    label: "GitHub",
  },
];

export const MarketingNav = () => {
  const pathname = usePathname();
  const german = pathname.startsWith("/de/");
  const items = german ? GERMAN : ENGLISH;
  const navLabel = german ? "Hauptnavigation" : "Main";
  /* HeaderAuthCta shows the demo link from xl up; below lg the drawer
     carries it. */
  const drawerItems = [
    ...items,
    { href: DEMO_BOOKING_URL, label: german ? "Demo buchen" : "Book a demo" },
  ];
  return (
    <>
      <nav
        aria-label={navLabel}
        className="hidden items-center gap-3.5 lg:flex xl:gap-4"
      >
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="text-ink-soft hover:text-ink -my-3 py-3 text-sm underline-offset-4 hover:underline"
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <MarketingMobileNav items={drawerItems} navLabel={navLabel} />
    </>
  );
};
