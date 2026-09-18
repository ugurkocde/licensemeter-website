"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Burger menu for the marketing header below sm. The inline nav links move
 * into a canvas drawer so the header keeps only brand + CTA; mirrors the app
 * drawer mechanics (focus moves into the drawer, Tab cycles within the
 * header, document-level Escape, body scroll lock, focus returns to the
 * burger, drawer stays mounted so aria-controls always resolves - Tailwind
 * preflight gives [hidden] display:none !important).
 */
export const MarketingMobileNav = ({
  items,
  navLabel = "Main",
}: {
  items: { href: string; label: string }[];
  navLabel?: string;
}) => {
  const [open, setOpen] = useState(false);
  const burgerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const burger = burgerRef.current;
    const container = burger?.closest("header") ?? drawerRef.current;
    drawerRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key !== "Tab" || !container) return;
      const focusables = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE),
      );
      if (focusables.length === 0) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      const active = document.activeElement;
      const inside =
        active instanceof HTMLElement && container.contains(active);
      if (
        e.shiftKey ? active === first || !inside : active === last || !inside
      ) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = prevOverflow;
      burger?.focus();
    };
  }, [open]);

  return (
    <>
      <button
        ref={burgerRef}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="marketing-nav-drawer"
        aria-label={open ? "Close menu" : "Open menu"}
        className="text-ink -my-1 -mr-2 flex size-11 cursor-pointer touch-manipulation items-center justify-center lg:hidden"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
          {open ? (
            <path
              d="M5 5l10 10M15 5L5 15"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          ) : (
            <path
              d="M3 6h14M3 10h14M3 14h14"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          )}
        </svg>
      </button>
      <div
        id="marketing-nav-drawer"
        ref={drawerRef}
        tabIndex={-1}
        hidden={!open}
        inert={!open}
        className="border-line bg-canvas focus-visible:ring-brand absolute inset-x-0 top-full z-40 border-y focus-visible:ring-2 focus-visible:ring-inset lg:hidden"
      >
        <nav aria-label={navLabel} className="py-2">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="text-ink-soft hover:text-ink block px-6 py-3 text-sm font-medium"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </>
  );
};
