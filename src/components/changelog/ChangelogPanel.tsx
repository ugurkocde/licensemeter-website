"use client";

import { X } from "lucide-react";
import {
  type CSSProperties,
  type RefObject,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { buttonClass } from "~/components/ui";
import {
  CHANGELOG_ARCHIVE_URL,
  changelogEntryUrl,
  type ChangelogEntry,
  type ChangelogLocale,
  formatChangelogDate,
} from "~/lib/changelog";
import {
  getServerSnapshot,
  getSnapshot,
  loadFeed,
  markDisplayed,
  subscribe,
} from "./changelogStore";

const COPY = {
  en: {
    heading: "What's new",
    close: "Close updates",
    loading: "Loading updates",
    empty: "No updates yet. New releases will appear here.",
    error: "Updates could not be loaded.",
    retry: "Retry",
    readMore: "Read more",
    archive: "All updates",
  },
  de: {
    heading: "Neuigkeiten",
    close: "Neuigkeiten schließen",
    loading: "Neuigkeiten werden geladen",
    empty: "Noch keine Neuigkeiten. Neue Versionen erscheinen hier.",
    error: "Neuigkeiten konnten nicht geladen werden.",
    retry: "Erneut versuchen",
    readMore: "Mehr erfahren",
    archive: "Alle Neuigkeiten",
  },
} as const;

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Desktop panel geometry (the sm breakpoint switches to full screen below). */
const DESKTOP_MIN_WIDTH = 640;
const PANEL_WIDTH = 400;
const PANEL_GAP = 8;
const VIEWPORT_MARGIN = 16;

type Placement = { top: number; left: number | null; right: number | null };

/**
 * Anchors the panel under its bell. Right-aligns with the trigger when it
 * sits in a header on the right; left-aligns when it lives in the sidebar
 * so the panel opens into the page instead of off screen.
 */
const placeBelow = (trigger: HTMLElement | null): Placement | null => {
  if (!trigger || window.innerWidth < DESKTOP_MIN_WIDTH) return null;
  const rect = trigger.getBoundingClientRect();
  const top = Math.round(rect.bottom + PANEL_GAP);
  if (rect.right - PANEL_WIDTH >= VIEWPORT_MARGIN) {
    return {
      top,
      left: null,
      right: Math.round(window.innerWidth - rect.right),
    };
  }
  return {
    top,
    left: Math.round(Math.max(rect.left, VIEWPORT_MARGIN)),
    right: null,
  };
};

/**
 * Native modal dialog: showModal() gives top layer, inert page, focus
 * containment, and Escape via the cancel event. Below sm it fills the
 * screen with safe-area padding; from sm it is a 400px panel anchored to
 * the bell. Body scroll is locked while open and focus returns to the bell.
 */
export const ChangelogPanel = ({
  locale,
  triggerRef,
  onClose,
}: {
  locale: ChangelogLocale;
  triggerRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}) => {
  const copy = COPY[locale];
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const { status, entries } = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    const trigger = triggerRef.current;
    if (!dialog) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (!dialog.open) dialog.showModal();
    const reposition = () => setPlacement(placeBelow(trigger));
    reposition();
    window.addEventListener("resize", reposition);
    /* showModal() makes the page inert but still lets Tab leave for the
       browser chrome; wrap within the panel so keyboard users stay put. */
    const trapTab = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const focusables = Array.from(
        dialog.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => el.getClientRects().length > 0);
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!first || !last) return;
      const active = document.activeElement;
      if (event.shiftKey ? active === first : active === last) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    };
    dialog.addEventListener("keydown", trapTab);
    return () => {
      dialog.removeEventListener("keydown", trapTab);
      window.removeEventListener("resize", reposition);
      if (dialog.open) dialog.close();
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, [triggerRef]);

  /* Read state flips only once the list is actually on screen. */
  useEffect(() => {
    if (status === "ready") markDisplayed(entries);
  }, [status, entries]);

  const style = placement
    ? ({
        "--panel-top": `${placement.top}px`,
        "--panel-left":
          placement.left === null ? "auto" : `${placement.left}px`,
        "--panel-right":
          placement.right === null ? "auto" : `${placement.right}px`,
      } as CSSProperties)
    : undefined;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="changelog-heading"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      style={style}
      className="bg-card text-ink sm:border-line sm:shadow-float sm:backdrop:bg-ink/10 fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overscroll-contain border-0 p-0 backdrop:bg-transparent sm:inset-auto sm:top-(--panel-top) sm:right-(--panel-right) sm:left-(--panel-left) sm:h-auto sm:max-h-[calc(100dvh-var(--panel-top)-1rem)] sm:w-[400px] sm:max-w-[calc(100vw-2rem)] sm:rounded-2xl sm:border"
    >
      <div className="flex h-full flex-col sm:max-h-[calc(100dvh-var(--panel-top)-1rem)]">
        <div className="border-line flex shrink-0 items-center justify-between border-b px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 sm:px-5">
          <h2
            id="changelog-heading"
            className="font-display text-base tracking-tight"
          >
            {copy.heading}
          </h2>
          <button
            type="button"
            autoFocus
            onClick={onClose}
            aria-label={copy.close}
            className="text-ink-soft hover:text-ink -my-1 -mr-2 flex size-11 cursor-pointer touch-manipulation items-center justify-center rounded-xl"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 sm:px-5">
          <PanelBody status={status} entries={entries} locale={locale} />
        </div>

        <div className="border-line flex shrink-0 items-center justify-between border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
          <a
            href={CHANGELOG_ARCHIVE_URL}
            target="_blank"
            rel="noreferrer"
            className="text-brand-text text-sm font-medium underline-offset-4 hover:underline"
          >
            {copy.archive}
          </a>
          <button
            type="button"
            onClick={onClose}
            className={buttonClass("secondary", "min-h-10 px-4 py-2 sm:hidden")}
          >
            {copy.close}
          </button>
        </div>
      </div>
    </dialog>
  );
};

const PanelBody = ({
  status,
  entries,
  locale,
}: {
  status: "idle" | "loading" | "ready" | "error";
  entries: ChangelogEntry[];
  locale: ChangelogLocale;
}) => {
  const copy = COPY[locale];
  if (status === "error") {
    return (
      <div role="alert" className="py-8 text-center">
        <p className="text-ink-soft text-sm">{copy.error}</p>
        <button
          type="button"
          onClick={() => void loadFeed(true)}
          className={buttonClass("secondary", "mt-4 min-h-10 px-4 py-2")}
        >
          {copy.retry}
        </button>
      </div>
    );
  }
  if (status !== "ready") {
    return (
      <p role="status" className="text-ink-soft py-8 text-center text-sm">
        {copy.loading}
      </p>
    );
  }
  if (entries.length === 0) {
    return (
      <p role="status" className="text-ink-soft py-8 text-center text-sm">
        {copy.empty}
      </p>
    );
  }
  return (
    <ol className="divide-line divide-y">
      {entries.map((entry) => (
        <li key={entry.id} className="py-4">
          <time
            dateTime={entry.publishedOn}
            className="text-ink-faint text-[11px] font-medium tracking-wider uppercase"
          >
            {formatChangelogDate(entry.publishedOn, locale)}
          </time>
          <h3 className="mt-1 text-sm font-medium">
            <a
              href={changelogEntryUrl(entry.id)}
              target="_blank"
              rel="noreferrer"
              className="underline-offset-4 hover:underline"
            >
              {entry.title}
            </a>
          </h3>
          <p className="text-ink-soft mt-1 text-sm leading-relaxed whitespace-pre-line">
            {entry.summary}
          </p>
          {entry.sourceUrl ? (
            <a
              href={entry.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="text-brand-text mt-2 inline-block text-sm font-medium underline-offset-4 hover:underline"
            >
              {copy.readMore}
            </a>
          ) : null}
        </li>
      ))}
    </ol>
  );
};
