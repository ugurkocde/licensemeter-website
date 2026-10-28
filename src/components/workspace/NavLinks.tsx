"use client";

import {
  ArrowUpRight,
  BookOpen,
  CalendarClock,
  CreditCard,
  Gauge,
  KeyRound,
  Layers,
  LayoutDashboard,
  LifeBuoy,
  Palette,
  Plug,
  ScanSearch,
  ScrollText,
  Server,
  Settings,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { PlanBadge } from "./FeatureLock";
import { NAV_TOUR_ANCHORS } from "./tourSteps";
import { upgradePath } from "~/lib/upgrade";
import type { Entitlement, Feature } from "~/server/entitlement";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Extra routes that belong to this section, e.g. drill-downs. */
  also?: string[];
  /** Paid feature behind this item; a workspace without it sees it locked. */
  feature?: Feature;
  /** Pages shown under the item while its section is open. */
  children?: { href: string; label: string }[];
  /** Modifier+number shortcut (desktop rail only). */
  shortcut?: string;
  external?: boolean;
};

type NavGroup = { label?: string; items: NavItem[] };

const GROUPS: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      { href: "/app", label: "Overview", icon: LayoutDashboard, shortcut: "1" },
      {
        href: "/app/findings",
        label: "Findings",
        icon: ScanSearch,
        shortcut: "2",
        also: ["/app/users"],
      },
      {
        href: "/app/licenses",
        label: "Licenses & prices",
        icon: KeyRound,
        shortcut: "3",
      },
      {
        href: "/app/renewals",
        label: "Renewals",
        icon: CalendarClock,
        shortcut: "4",
      },
      {
        href: "/app/ai-costs",
        label: "AI costs",
        icon: Sparkles,
        shortcut: "5",
      },
    ],
  },
  {
    label: "Tools",
    items: [
      {
        href: "/app/metering",
        label: "Software Metering",
        icon: Gauge,
        feature: "metering",
        children: [
          { href: "/app/metering", label: "Dashboard" },
          { href: "/app/metering/apps", label: "Apps" },
          { href: "/app/metering/devices", label: "Devices" },
          { href: "/app/metering/setup", label: "Setup" },
        ],
      },
      { href: "/app/connectors", label: "Connectors", icon: Plug },
      { href: "/app/mcp", label: "MCP server", icon: Server, feature: "mcp" },
      {
        href: "/app/branding",
        label: "Report branding",
        icon: Palette,
        feature: "whiteLabel",
      },
    ],
  },
  {
    label: "Manage",
    items: [
      { href: "/app/billing", label: "Plan and billing", icon: CreditCard },
      { href: "/app/agreement", label: "Agreement", icon: ScrollText },
      { href: "/app/settings", label: "Settings", icon: Settings },
    ],
  },
  {
    items: [
      {
        href: "https://docs.licensemeter.com/",
        label: "Docs",
        icon: BookOpen,
        external: true,
      },
      { href: "/support", label: "Support", icon: LifeBuoy },
    ],
  },
];

const PORTFOLIO_ITEM: NavItem = {
  href: "/app/portfolio",
  label: "Portfolio",
  icon: Layers,
};

/** Modifier+number destinations, wired up by the desktop sidebar. */
export const NAV_SHORTCUTS: Record<string, string> = Object.fromEntries(
  GROUPS.flatMap((g) => g.items)
    .filter((item) => item.shortcut)
    .map((item) => [item.shortcut!, item.href]),
);

/** True for the route itself and its children, never for sibling prefixes. */
const inSection = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(href + "/");

type Tooltip = { label: string; x: number; y: number };

export const NavLinks = ({
  onNavigate,
  showPortfolio = false,
  navLabel = "Workspace navigation",
  entitlement,
  pendingAccessRequests = 0,
  collapsed = false,
  query = "",
  shortcuts = false,
}: {
  onNavigate?: () => void;
  showPortfolio?: boolean;
  /** Distinguishes the two render sites (desktop rail vs mobile drawer). */
  navLabel?: string;
  /** Decides which items with a feature render locked. */
  entitlement?: Entitlement;
  pendingAccessRequests?: number;
  /** Icon-only rail: labels move to tooltips and screen readers. */
  collapsed?: boolean;
  /** Search text from the sidebar search field; filters by label. */
  query?: string;
  /** Show the ⌘ number hints (desktop rail, where they are wired up). */
  shortcuts?: boolean;
}) => {
  const pathname = usePathname();
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);

  const groups: NavGroup[] = showPortfolio
    ? GROUPS.map((group, i) =>
        i === 0
          ? {
              ...group,
              items: [group.items[0]!, PORTFOLIO_ITEM, ...group.items.slice(1)],
            }
          : group,
      )
    : GROUPS;

  const needle = query.trim().toLowerCase();
  const visibleGroups = groups
    .map((group) => ({
      ...group,
      items: group.items
        .map((item) => {
          if (!needle) return item;
          const selfMatch = item.label.toLowerCase().includes(needle);
          const children = item.children?.filter((child) =>
            child.label.toLowerCase().includes(needle),
          );
          if (selfMatch) return item;
          if (children && children.length > 0) return { ...item, children };
          return null;
        })
        .filter((item): item is NavItem => item !== null),
    }))
    .filter((group) => group.items.length > 0);

  const showTooltip =
    (label: string) => (e: React.SyntheticEvent<HTMLElement>) => {
      if (!collapsed) return;
      const rect = e.currentTarget.getBoundingClientRect();
      setTooltip({ label, x: rect.right + 10, y: rect.top + rect.height / 2 });
    };

  return (
    <nav aria-label={navLabel} className={collapsed ? "px-2" : "px-3"}>
      {needle && visibleGroups.length === 0 && (
        <p className="text-sidebar-soft px-2 py-6 text-center text-sm">
          No pages match &ldquo;{query.trim()}&rdquo;.
        </p>
      )}
      {visibleGroups.map((group, groupIndex) => (
        <div key={group.label ?? `group-${groupIndex}`}>
          {collapsed ? (
            groupIndex > 0 && (
              <div
                aria-hidden="true"
                className="bg-sidebar-line mx-2 my-3 h-px"
              />
            )
          ) : group.label ? (
            <div
              className={`text-sidebar-soft px-2.5 pb-1.5 text-xs font-medium ${groupIndex === 0 ? "pt-1" : "pt-4"}`}
            >
              {group.label}
            </div>
          ) : (
            <div
              aria-hidden="true"
              className="bg-sidebar-line mx-2.5 mt-4 mb-2 h-px"
            />
          )}
          <div className="flex flex-col gap-0.5">
            {group.items.map((item) => {
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
              const Icon = item.icon;
              const showChildren =
                !collapsed &&
                !locked &&
                item.children &&
                (sectionActive || needle.length > 0);
              return (
                <div key={item.href} className="flex flex-col gap-0.5">
                  <Link
                    href={locked ? upgradePath(locked) : item.href}
                    data-tour={tourAnchor}
                    onClick={onNavigate}
                    onMouseEnter={showTooltip(item.label)}
                    onMouseLeave={() => setTooltip(null)}
                    onFocus={showTooltip(item.label)}
                    onBlur={() => setTooltip(null)}
                    aria-current={
                      sectionActive && !(item.children && !locked)
                        ? "page"
                        : undefined
                    }
                    className={`group relative flex items-center gap-2.5 rounded-[10px] px-2.5 py-2.5 text-sm transition-colors lg:py-[7px] ${
                      collapsed ? "justify-center px-0 py-2.5" : ""
                    } ${
                      sectionActive
                        ? "bg-brand-soft text-brand-deep font-medium"
                        : locked
                          ? "text-ink-faint hover:bg-canvas hover:text-ink"
                          : "text-ink-soft hover:bg-canvas hover:text-ink"
                    }`}
                  >
                    <span
                      className={
                        collapsed ? "sr-only" : "min-w-0 flex-1 truncate"
                      }
                    >
                      {item.label}
                    </span>
                    {item.feature ? (
                      collapsed ? (
                        <span className="sr-only">
                          <PlanBadge
                            feature={item.feature}
                            locked={Boolean(locked)}
                          />
                        </span>
                      ) : (
                        /* Always shown: paid features stay visible as an upsell. */
                        <PlanBadge
                          feature={item.feature}
                          locked={Boolean(locked)}
                        />
                      )
                    ) : item.href === "/app/settings" &&
                      pendingAccessRequests > 0 ? (
                      <>
                        <span
                          aria-hidden="true"
                          className={`bg-brand-strong flex items-center justify-center rounded-full text-white tabular-nums ${
                            collapsed
                              ? "ring-sidebar absolute top-1 right-1 h-4 min-w-4 px-1 text-[10px] font-semibold ring-2"
                              : "px-2 py-0.5 text-xs"
                          }`}
                        >
                          {pendingAccessRequests}
                        </span>
                        <span className="sr-only">
                          , {pendingAccessRequests} pending access{" "}
                          {pendingAccessRequests === 1 ? "request" : "requests"}
                        </span>
                      </>
                    ) : item.external && !collapsed ? (
                      <ArrowUpRight
                        aria-hidden="true"
                        className="text-sidebar-soft size-3.5 shrink-0"
                      />
                    ) : item.shortcut && shortcuts && !collapsed ? (
                      <kbd
                        aria-hidden="true"
                        className="border-line bg-canvas text-sidebar-soft group-hover:border-line-strong shrink-0 rounded-md border px-1.5 py-0.5 font-sans text-[10px] leading-none"
                      >
                        ⌘{item.shortcut}
                      </kbd>
                    ) : null}
                    <Icon
                      aria-hidden="true"
                      strokeWidth={1.75}
                      className={`order-first size-[18px] shrink-0 ${
                        sectionActive
                          ? "text-brand-text"
                          : "text-sidebar-soft group-hover:text-ink"
                      }`}
                    />
                  </Link>
                  {showChildren && (
                    <div className="border-sidebar-line mt-0.5 ml-[21px] flex flex-col gap-0.5 border-l pb-1 pl-2">
                      {item.children!.map((child) => {
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
                            className={`rounded-lg px-2.5 py-1.5 text-[13px] transition-colors ${
                              current
                                ? "bg-brand-soft text-brand-deep font-medium"
                                : "text-ink-soft hover:bg-canvas hover:text-ink"
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
          </div>
        </div>
      ))}
      {tooltip && (
        <span
          aria-hidden="true"
          className="sidebar-pop bg-ink pointer-events-none fixed z-50 -translate-y-1/2 rounded-md px-2 py-1 text-xs font-medium whitespace-nowrap text-white shadow-lg"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          {tooltip.label}
        </span>
      )}
    </nav>
  );
};
