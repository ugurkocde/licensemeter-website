"use client";

import { PanelLeftClose, PanelLeftOpen, Search, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { BrandMark } from "~/components/BrandMark";
import { ChangelogBell } from "~/components/changelog/ChangelogBell";
import { NAV_SHORTCUTS, NavLinks } from "./NavLinks";
import { PlanBadge } from "./PlanBadge";
import { UserMenu } from "./UserMenu";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { planBadge } from "~/lib/planLabel";
import type { WorkspaceSummary } from "~/server/access";
import type { Entitlement } from "~/server/entitlement";

const COLLAPSED_KEY = "licensemeter:sidebar-collapsed";

/**
 * Desktop sidebar: a floating card with the workspace switcher, page search
 * (⌘K), grouped navigation (⌘1 to ⌘5) and the user menu. Collapses to an
 * icon rail with tooltips; the choice is remembered per browser.
 */
export const AppSidebar = ({
  isDemo,
  userName,
  userDetail,
  accountEnabled = false,
  workspaces,
  activeId,
  entitlement,
  pendingAccessRequests = 0,
}: {
  isDemo: boolean;
  userName: string;
  userDetail?: string;
  accountEnabled?: boolean;
  workspaces: WorkspaceSummary[];
  activeId: string;
  entitlement: Entitlement;
  pendingAccessRequests?: number;
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const focusSearchOnExpand = useRef(false);
  const router = useRouter();

  useEffect(() => {
    try {
      if (window.localStorage.getItem(COLLAPSED_KEY) === "1")
        setCollapsed(true);
    } catch {
      /* Storage unavailable: stay expanded. */
    }
  }, []);

  useEffect(() => {
    if (!collapsed && focusSearchOnExpand.current) {
      focusSearchOnExpand.current = false;
      searchRef.current?.focus();
    }
  }, [collapsed]);

  /* ⌘K (or Ctrl+K) focuses the search; ⌘1 to ⌘5 jump between main pages. */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
      if (e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (collapsed) {
          focusSearchOnExpand.current = true;
          setCollapsed(false);
        } else {
          searchRef.current?.focus();
          searchRef.current?.select();
        }
        return;
      }
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]'))
        return;
      const href = NAV_SHORTCUTS[e.key];
      if (href) {
        e.preventDefault();
        router.push(href);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [collapsed, router]);

  const toggleCollapsed = () => {
    setCollapsed((v) => {
      try {
        window.localStorage.setItem(COLLAPSED_KEY, v ? "0" : "1");
      } catch {
        /* Storage unavailable: the choice lasts for this page only. */
      }
      return !v;
    });
    setQuery("");
  };

  const badge = planBadge(entitlement);
  const planSubtitle = isDemo
    ? "Demo workspace"
    : badge
      ? `${badge.label} plan`
      : "Workspace";

  return (
    <aside
      className={`sticky top-0 hidden h-screen shrink-0 p-3 transition-[width] duration-200 motion-reduce:transition-none lg:block ${
        collapsed ? "w-[92px]" : "w-[276px]"
      }`}
    >
      <div className="border-line bg-sidebar shadow-card flex h-full flex-col rounded-2xl border">
        <div className="p-3 pb-2">
          <div
            className={`flex items-center ${collapsed ? "flex-col gap-1" : "justify-between"}`}
          >
            <Link
              href="/app"
              aria-label={collapsed ? "LicenseMeter overview" : undefined}
              className="flex items-center gap-2 rounded-lg p-1"
            >
              <BrandMark size={20} tone="light" />
              {!collapsed && (
                <span className="font-display text-ink text-[17px] font-semibold tracking-tight">
                  License<span className="text-brand-text">Meter</span>
                </span>
              )}
            </Link>
            <div
              className={`flex items-center ${collapsed ? "flex-col gap-1" : ""}`}
            >
              <ChangelogBell />
              <button
                type="button"
                onClick={toggleCollapsed}
                aria-expanded={!collapsed}
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                className="text-ink-soft hover:bg-canvas hover:text-ink flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg transition-colors"
              >
                {collapsed ? (
                  <PanelLeftOpen
                    aria-hidden="true"
                    className="size-[18px]"
                    strokeWidth={1.75}
                  />
                ) : (
                  <PanelLeftClose
                    aria-hidden="true"
                    className="size-[18px]"
                    strokeWidth={1.75}
                  />
                )}
              </button>
            </div>
          </div>

          <div className="mt-2">
            <WorkspaceSwitcher
              workspaces={workspaces}
              activeId={activeId}
              subtitle={planSubtitle}
              collapsed={collapsed}
            />
          </div>

          {collapsed ? (
            <button
              type="button"
              aria-label="Search pages"
              onClick={() => {
                focusSearchOnExpand.current = true;
                setCollapsed(false);
              }}
              className="text-sidebar-soft hover:bg-canvas hover:text-ink mx-auto mt-1 flex size-10 cursor-pointer items-center justify-center rounded-[10px] transition-colors"
            >
              <Search
                aria-hidden="true"
                className="size-[18px]"
                strokeWidth={1.75}
              />
            </button>
          ) : (
            <div className="relative mt-2">
              <Search
                aria-hidden="true"
                className="text-sidebar-soft pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
              />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setQuery("");
                    e.currentTarget.blur();
                  }
                }}
                aria-label="Search pages"
                placeholder="Search pages"
                className="border-line bg-canvas text-ink placeholder:text-sidebar-soft focus:border-brand w-full rounded-[10px] border py-2 pr-11 pl-9 text-sm outline-none [&::-webkit-search-cancel-button]:hidden"
              />
              {query ? (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => {
                    setQuery("");
                    searchRef.current?.focus();
                  }}
                  className="text-sidebar-soft hover:text-ink absolute top-1/2 right-1.5 flex size-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md"
                >
                  <X aria-hidden="true" className="size-4" />
                </button>
              ) : (
                <kbd
                  aria-hidden="true"
                  className="border-line bg-card text-sidebar-soft pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 rounded-md border px-1.5 py-0.5 font-sans text-[10px] leading-none"
                >
                  ⌘K
                </kbd>
              )}
            </div>
          )}
        </div>

        <div className="sidebar-scroll min-h-0 flex-1 overflow-x-hidden overflow-y-auto py-2">
          <NavLinks
            showPortfolio={workspaces.length > 1}
            entitlement={entitlement}
            pendingAccessRequests={pendingAccessRequests}
            collapsed={collapsed}
            query={query}
            shortcuts
            onNavigate={() => setQuery("")}
          />
        </div>

        <div className="border-sidebar-line border-t p-3">
          {!collapsed && badge && (
            <div className="px-1.5 pb-2">
              <PlanBadge entitlement={entitlement} />
            </div>
          )}
          <UserMenu
            userName={userName}
            userDetail={userDetail}
            accountEnabled={accountEnabled}
            entitlement={entitlement}
            collapsed={collapsed}
          />
        </div>
      </div>
    </aside>
  );
};
