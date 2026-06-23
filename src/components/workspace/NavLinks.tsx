"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavChild = { href: string; label: string };
type NavItem = {
  href: string;
  label: string;
  /** Extra routes that belong to this section, e.g. drill-downs. */
  also?: string[];
  /** Sub-pages shown while the section is active, one per connector. */
  children?: NavChild[];
};

const ITEMS: NavItem[] = [
  { href: "/app", label: "Overview" },
  { href: "/app/findings", label: "Findings", also: ["/app/users"] },
  { href: "/app/licenses", label: "Licenses & prices" },
  { href: "/app/ai-costs", label: "AI costs" },
  { href: "/app/billing", label: "Billing" },
  {
    href: "/app/settings",
    label: "Settings",
    children: [
      { href: "/app/settings/microsoft", label: "Microsoft 365" },
      { href: "/app/settings/adobe", label: "Adobe" },
      { href: "/app/settings/zoom", label: "Zoom" },
      { href: "/app/settings/atlassian", label: "Atlassian" },
      { href: "/app/settings/salesforce", label: "Salesforce" },
      { href: "/app/settings/openai", label: "OpenAI" },
      { href: "/app/settings/anthropic", label: "Anthropic" },
      { href: "/app/settings/chatgpt", label: "ChatGPT" },
      { href: "/app/settings/claude", label: "Claude" },
    ],
  },
];

const PORTFOLIO_ITEM: NavItem = { href: "/app/portfolio", label: "Portfolio" };
const MSP_ITEM: NavItem = { href: "/app/msp", label: "MSP" };

/** True for the route itself and its children, never for sibling prefixes. */
const inSection = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(href + "/");

export const NavLinks = ({
  onNavigate,
  showPortfolio = false,
  showMsp = false,
  navLabel = "Workspace navigation",
}: {
  onNavigate?: () => void;
  showPortfolio?: boolean;
  /** MSP portfolio link, gated on mspEnabled() from the layout. */
  showMsp?: boolean;
  /** Distinguishes the two render sites (desktop rail vs mobile drawer). */
  navLabel?: string;
}) => {
  const pathname = usePathname();
  const base = showMsp ? [...ITEMS, MSP_ITEM] : ITEMS;
  const items = showPortfolio
    ? [...base.slice(0, 1), PORTFOLIO_ITEM, ...base.slice(1)]
    : base;
  return (
    <nav aria-label={navLabel} className="flex flex-col gap-0.5">
      {items.map((item) => {
        const sectionActive =
          item.href === "/app"
            ? pathname === "/app"
            : inSection(pathname, item.href) ||
              (item.also ?? []).some((href) => inSection(pathname, href));
        // The parent is the current page only when no child is.
        const childCurrent = (item.children ?? []).find((c) =>
          inSection(pathname, c.href),
        );
        const parentCurrent = sectionActive && !childCurrent;
        return (
          <div key={item.href} className="flex flex-col gap-0.5">
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={parentCurrent ? "page" : undefined}
              className={`border-l-2 px-[18px] py-2.5 text-sm transition ${
                parentCurrent
                  ? "border-brand bg-sidebar-line/70 font-medium text-canvas"
                  : sectionActive
                    ? "border-transparent text-canvas"
                    : "border-transparent text-sidebar-soft hover:border-sidebar-soft hover:text-canvas"
              }`}
            >
              {item.label}
            </Link>
            {sectionActive &&
              item.children?.map((child) => {
                const current = inSection(pathname, child.href);
                return (
                  <Link
                    key={child.href}
                    href={child.href}
                    onClick={onNavigate}
                    aria-current={current ? "page" : undefined}
                    className={`border-l-2 py-2 pr-4 pl-[34px] text-[13px] transition ${
                      current
                        ? "border-brand bg-sidebar-line/70 font-medium text-canvas"
                        : "border-transparent text-sidebar-soft hover:border-sidebar-soft hover:text-canvas"
                    }`}
                  >
                    {child.label}
                  </Link>
                );
              })}
          </div>
        );
      })}
    </nav>
  );
};
