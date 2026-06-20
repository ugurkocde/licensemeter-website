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
  {
    href: "/app/settings",
    label: "Settings",
    children: [
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

/** True for the route itself and its children, never for sibling prefixes. */
const inSection = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(href + "/");

export const NavLinks = ({
  onNavigate,
  showPortfolio = false,
}: {
  onNavigate?: () => void;
  showPortfolio?: boolean;
}) => {
  const pathname = usePathname();
  const items = showPortfolio
    ? [...ITEMS.slice(0, 1), PORTFOLIO_ITEM, ...ITEMS.slice(1)]
    : ITEMS;
  return (
    <nav aria-label="Workspace" className="flex flex-col gap-0.5">
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
