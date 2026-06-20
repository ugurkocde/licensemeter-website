"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * Burger menu for the marketing header below sm. The inline nav links move
 * into a canvas drawer so the header keeps only brand + CTA; mirrors the app
 * drawer mechanics (document-level Escape, drawer stays mounted so
 * aria-controls always resolves - Tailwind preflight gives [hidden]
 * display:none !important).
 */
export const MarketingMobileNav = ({
  items,
}: {
  items: { href: string; label: string }[];
}) => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="marketing-nav-drawer"
        aria-label={open ? "Close menu" : "Open menu"}
        className="-my-1 -mr-2 flex size-11 cursor-pointer touch-manipulation items-center justify-center text-ink sm:hidden"
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
        hidden={!open}
        className="absolute inset-x-0 top-full z-40 border-y border-line bg-canvas sm:hidden"
      >
        <nav aria-label="Main" className="py-2">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="block px-6 py-3 text-sm font-medium text-ink-soft hover:text-ink"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </>
  );
};
