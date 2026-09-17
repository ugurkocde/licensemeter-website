"use client";

import { Bell } from "lucide-react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { badgeLabel, unreadCount } from "~/lib/changelog";
import {
  getServerSnapshot,
  getSnapshot,
  loadFeed,
  subscribe,
} from "./changelogStore";

/* The panel (dialog, list, states) only ships once a visitor opens it. */
const ChangelogPanel = dynamic(
  () => import("./ChangelogPanel").then((m) => m.ChangelogPanel),
  { ssr: false },
);

/** Idle delay before the badge fetch so it never competes with first paint. */
const BADGE_DELAY_MS = 1_500;

/**
 * Product-updates bell for persistent navigation. Reads the public Ugurlabs
 * changelog feed (no credentials), shows an unread badge, and opens the
 * panel. Read state is shared with every other bell on the page and across
 * tabs through the store.
 */
export const ChangelogBell = ({ className = "" }: { className?: string }) => {
  const german = usePathname().startsWith("/de/");
  const { status, entries, seen } = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadFeed(), BADGE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);

  const unread = status === "ready" ? unreadCount(entries, seen) : 0;
  const label = german ? "Produktneuigkeiten" : "Product updates";
  const unreadLabel =
    unread === 0 ? "" : german ? `, ${unread} ungelesen` : `, ${unread} unread`;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          void loadFeed();
          setOpen(true);
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${label}${unreadLabel}`}
        className={`text-ink-soft hover:text-ink relative -my-1 flex size-11 shrink-0 cursor-pointer touch-manipulation items-center justify-center rounded-xl transition-colors ${className}`}
      >
        <Bell className="size-5" strokeWidth={1.75} aria-hidden="true" />
        {unread > 0 ? (
          <span
            aria-hidden="true"
            className="bg-brand ring-card absolute top-1.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none font-semibold text-white ring-2"
          >
            {badgeLabel(unread)}
          </span>
        ) : null}
      </button>
      {open ? (
        <ChangelogPanel
          locale={german ? "de" : "en"}
          triggerRef={triggerRef}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
};
