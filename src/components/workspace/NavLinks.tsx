"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
  /** Extra routes that belong to this section, e.g. drill-downs. */
  also?: string[];
};

const ITEMS: NavItem[] = [
  { href: "/app", label: "Overview" },
  { href: "/app/findings", label: "Findings", also: ["/app/users"] },
  { href: "/app/licenses", label: "Licenses & prices" },
  { href: "/app/renewals", label: "Renewals" },
  { href: "/app/ai-costs", label: "AI costs" },
  { href: "/app/connectors", label: "Connectors" },
  { href: "/app/settings", label: "Settings" },
  { href: "https://docs.licensemeter.com/", label: "Docs" },
  { href: "/support", label: "Support" },
];

const PORTFOLIO_ITEM: NavItem = { href: "/app/portfolio", label: "Portfolio" };

/** True for the route itself and its children, never for sibling prefixes. */
const inSection = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(href + "/");

export const NavLinks = ({
  onNavigate,
  showPortfolio = false,
  navLabel = "Workspace navigation",
}: {
  onNavigate?: () => void;
  showPortfolio?: boolean;
  /** Distinguishes the two render sites (desktop rail vs mobile drawer). */
  navLabel?: string;
}) => {
  const pathname = usePathname();

  const items = showPortfolio
    ? [...ITEMS.slice(0, 1), PORTFOLIO_ITEM, ...ITEMS.slice(1)]
    : ITEMS;
  return (
    <nav aria-label={navLabel} className="flex flex-col gap-0.5">
      {items.map((item) => {
        const sectionActive =
          item.href === "/app"
            ? pathname === "/app"
            : inSection(pathname, item.href) ||
              (item.also ?? []).some((href) => inSection(pathname, href));
        const tourAnchor =
          navLabel === "Workspace navigation"
            ? item.href === "/app/findings"
              ? "nav-findings"
              : item.href === "/app/connectors"
                ? "nav-connectors"
                : undefined
            : undefined;
        return (
          <div key={item.href} className="flex flex-col gap-0.5">
            <Link
              href={item.href}
              data-tour={tourAnchor}
              onClick={onNavigate}
              aria-current={sectionActive ? "page" : undefined}
              className={`border-l-2 px-[18px] py-2.5 text-sm transition ${
                sectionActive
                  ? "border-brand bg-brand-soft text-ink font-medium"
                  : "text-sidebar-soft hover:border-sidebar-soft hover:text-ink border-transparent"
              }`}
            >
              {item.label}
            </Link>
          </div>
        );
      })}
    </nav>
  );
};
