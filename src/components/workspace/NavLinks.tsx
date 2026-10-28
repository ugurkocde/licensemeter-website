"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { PlanBadge } from "./FeatureLock";
import { NAV_TOUR_ANCHORS } from "./tourSteps";
import { upgradePath } from "~/lib/upgrade";
import type { Entitlement, Feature } from "~/server/entitlement";

type NavItem = {
  href: string;
  label: string;
  /** Extra routes that belong to this section, e.g. drill-downs. */
  also?: string[];
  /** Paid feature behind this item; a workspace without it sees it locked. */
  feature?: Feature;
  /** Pages shown under the item while its section is open. */
  children?: { href: string; label: string }[];
};

const ITEMS: NavItem[] = [
  { href: "/app", label: "Overview" },
  { href: "/app/findings", label: "Findings", also: ["/app/users"] },
  { href: "/app/licenses", label: "Licenses & prices" },
  { href: "/app/renewals", label: "Renewals" },
  { href: "/app/ai-costs", label: "AI costs" },
  {
    href: "/app/metering",
    label: "Software Metering",
    feature: "metering",
    children: [
      { href: "/app/metering", label: "Dashboard" },
      { href: "/app/metering/apps", label: "Apps" },
      { href: "/app/metering/setup", label: "Setup" },
    ],
  },
  { href: "/app/connectors", label: "Connectors" },
  { href: "/app/billing", label: "Plan and billing" },
  { href: "/app/agreement", label: "Agreement" },
  { href: "/app/mcp", label: "MCP server", feature: "mcp" },
  { href: "/app/branding", label: "Report branding", feature: "whiteLabel" },
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
  entitlement,
  pendingAccessRequests = 0,
}: {
  onNavigate?: () => void;
  showPortfolio?: boolean;
  /** Distinguishes the two render sites (desktop rail vs mobile drawer). */
  navLabel?: string;
  /** Decides which items with a feature render locked. */
  entitlement?: Entitlement;
  pendingAccessRequests?: number;
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
              ? NAV_TOUR_ANCHORS.findings
              : item.href === "/app/metering"
                ? NAV_TOUR_ANCHORS.metering
                : item.href === "/app/connectors"
                  ? NAV_TOUR_ANCHORS.connectors
                  : undefined
            : undefined;
        /* A locked item stays a real link: it leads to the upgrade page
           instead of a dead end. */
        const locked =
          item.feature !== undefined &&
          entitlement?.features[item.feature] === false
            ? item.feature
            : undefined;
        return (
          <div key={item.href} className="flex flex-col gap-0.5">
            <Link
              href={locked ? upgradePath(locked) : item.href}
              data-tour={tourAnchor}
              onClick={onNavigate}
              aria-current={
                sectionActive && !(item.children && !locked)
                  ? "page"
                  : undefined
              }
              className={`border-l-2 px-[18px] py-2.5 text-sm transition ${
                sectionActive
                  ? "border-brand bg-brand-soft text-ink font-medium"
                  : locked
                    ? "text-ink-faint hover:border-sidebar-soft hover:text-ink border-transparent"
                    : "text-sidebar-soft hover:border-sidebar-soft hover:text-ink border-transparent"
              }`}
            >
              {item.feature ? (
                <span className="flex items-center justify-between gap-2">
                  {item.label}
                  {/* Always shown: paid features stay visible as an upsell. */}
                  <PlanBadge feature={item.feature} locked={Boolean(locked)} />
                </span>
              ) : (
                <span className="flex items-center justify-between gap-2">
                  {item.label}
                  {item.href === "/app/settings" &&
                    pendingAccessRequests > 0 && (
                      <>
                        <span
                          aria-hidden="true"
                          className="bg-brand-strong rounded-full px-2 py-0.5 text-xs text-white tabular-nums"
                        >
                          {pendingAccessRequests}
                        </span>
                        <span className="sr-only">
                          , {pendingAccessRequests} pending access{" "}
                          {pendingAccessRequests === 1 ? "request" : "requests"}
                        </span>
                      </>
                    )}
                </span>
              )}
            </Link>
            {sectionActive && !locked && item.children && (
              <div className="flex flex-col gap-0.5 pb-1">
                {item.children.map((child) => {
                  const current =
                    child.href === item.href
                      ? pathname === child.href
                      : inSection(pathname, child.href);
                  return (
                    <Link
                      key={child.href}
                      href={child.href}
                      onClick={onNavigate}
                      aria-current={current ? "page" : undefined}
                      className={`py-1.5 pr-[18px] pl-9 text-sm transition ${
                        current
                          ? "text-brand-deep font-medium"
                          : "text-sidebar-soft hover:text-ink"
                      }`}
                    >
                      {child.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
};
