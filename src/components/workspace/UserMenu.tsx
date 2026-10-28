"use client";

import {
  BookOpen,
  ChevronsUpDown,
  CircleUserRound,
  CreditCard,
  LifeBuoy,
  LogOut,
  Star,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { InitialsAvatar } from "./InitialsAvatar";
import { planBadge } from "~/lib/planLabel";
import { UPGRADE_PATH } from "~/lib/upgrade";
import type { Entitlement } from "~/server/entitlement";
import { signOutAction } from "~/app/auth/actions";

const itemClass =
  "text-ink-soft hover:bg-canvas hover:text-ink flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-sm transition-colors";

/**
 * Bottom-of-sidebar user card. Opens a menu with account, billing and help
 * links plus sign out; in the collapsed rail it is the avatar alone. Opening
 * the menu moves focus to its first item; arrows, Home and End move within
 * it, Escape closes it and returns focus to the trigger.
 */
export const UserMenu = ({
  userName,
  userDetail,
  accountEnabled = false,
  entitlement,
  collapsed = false,
}: {
  userName: string;
  /** UPN or email shown under the name. */
  userDetail?: string;
  accountEnabled?: boolean;
  entitlement?: Entitlement;
  collapsed?: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node))
        setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const menuItems = () =>
    Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    );

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    /* The menu renders after this state change; focus its first item so
       keyboard users land inside instead of tabbing past it. */
    requestAnimationFrame(() => menuItems()[0]?.focus());
  };

  const badge = entitlement ? planBadge(entitlement) : null;
  const showUpgrade = badge !== null && entitlement?.plan === "free";

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${userName}`}
        onClick={toggle}
        className={`hover:bg-canvas flex w-full cursor-pointer items-center gap-2.5 rounded-xl p-1.5 transition-colors ${
          collapsed ? "justify-center" : ""
        }`}
      >
        <InitialsAvatar name={userName} />
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1 text-left">
              <span className="text-ink block truncate text-sm font-semibold">
                {userName}
              </span>
              {userDetail && (
                <span className="text-sidebar-soft block truncate text-xs">
                  {userDetail}
                </span>
              )}
            </span>
            <ChevronsUpDown
              aria-hidden="true"
              className="text-sidebar-soft size-4 shrink-0"
            />
          </>
        )}
      </button>

      {open && (
        <div
          className={`sidebar-pop border-line bg-card shadow-float z-50 w-72 max-w-[calc(100vw-2rem)] rounded-xl border p-1.5 ${
            collapsed
              ? "absolute bottom-0 left-full ml-3"
              : "absolute right-0 bottom-full left-0 mb-2 w-auto"
          }`}
        >
          <div className="border-sidebar-line flex items-center gap-2.5 border-b px-2.5 pt-2 pb-3">
            <InitialsAvatar name={userName} />
            <span className="min-w-0">
              <span className="text-ink block truncate text-sm font-semibold">
                {userName}
              </span>
              {userDetail && (
                <span className="text-sidebar-soft block truncate text-xs">
                  {userDetail}
                </span>
              )}
            </span>
          </div>
          <div
            ref={menuRef}
            className="flex flex-col gap-0.5 pt-1.5"
            role="menu"
            aria-label="Account menu"
            onKeyDown={(e) => {
              const items = menuItems();
              if (items.length === 0) return;
              const index = Math.max(
                0,
                items.indexOf(document.activeElement as HTMLElement),
              );
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                items[
                  (index + (e.key === "ArrowDown" ? 1 : -1) + items.length) %
                    items.length
                ]?.focus();
              } else if (e.key === "Home") {
                e.preventDefault();
                items[0]?.focus();
              } else if (e.key === "End") {
                e.preventDefault();
                items.at(-1)?.focus();
              }
            }}
          >
            {accountEnabled && (
              <Link
                href="/app/account"
                role="menuitem"
                onClick={() => setOpen(false)}
                className={itemClass}
              >
                <CircleUserRound
                  aria-hidden="true"
                  className="text-sidebar-soft size-[18px] shrink-0"
                  strokeWidth={1.75}
                />
                Account settings
              </Link>
            )}
            <Link
              href="/app/billing"
              role="menuitem"
              onClick={() => setOpen(false)}
              className={itemClass}
            >
              <CreditCard
                aria-hidden="true"
                className="text-sidebar-soft size-[18px] shrink-0"
                strokeWidth={1.75}
              />
              Plan and billing
              {badge && (
                <span className="text-sidebar-soft ml-auto text-xs">
                  {badge.label} plan
                </span>
              )}
            </Link>
            {showUpgrade && (
              <Link
                href={UPGRADE_PATH}
                role="menuitem"
                onClick={() => setOpen(false)}
                className={itemClass}
              >
                <Star
                  aria-hidden="true"
                  className="text-waste-text size-[18px] shrink-0"
                  strokeWidth={1.75}
                />
                Upgrade to Pro
              </Link>
            )}
            <Link
              href="https://docs.licensemeter.com/"
              target="_blank"
              rel="noreferrer"
              role="menuitem"
              onClick={() => setOpen(false)}
              className={itemClass}
            >
              <BookOpen
                aria-hidden="true"
                className="text-sidebar-soft size-[18px] shrink-0"
                strokeWidth={1.75}
              />
              Documentation
              <span className="sr-only">, opens in a new tab</span>
            </Link>
            <Link
              href="/app/support"
              role="menuitem"
              onClick={() => setOpen(false)}
              className={itemClass}
            >
              <LifeBuoy
                aria-hidden="true"
                className="text-sidebar-soft size-[18px] shrink-0"
                strokeWidth={1.75}
              />
              Support
            </Link>
            <div className="border-sidebar-line mt-1.5 border-t pt-1.5">
              <form action={signOutAction}>
                <button
                  type="submit"
                  role="menuitem"
                  className={`${itemClass} cursor-pointer`}
                >
                  <LogOut
                    aria-hidden="true"
                    className="text-sidebar-soft size-[18px] shrink-0"
                    strokeWidth={1.75}
                  />
                  Sign out
                </button>
              </form>
            </div>
          </div>
          <div className="text-sidebar-soft px-2.5 pt-2 pb-1.5 text-xs">
            <Link
              href="/terms"
              onClick={() => setOpen(false)}
              className="underline-offset-4 hover:underline"
            >
              Terms &amp; Conditions
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};
