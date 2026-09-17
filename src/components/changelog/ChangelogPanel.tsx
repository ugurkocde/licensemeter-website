"use client";

import { Bell, ExternalLink, X } from "lucide-react";
import { type RefObject, useEffect, useRef, useSyncExternalStore } from "react";

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
    subtitle: "News and improvements from LicenseMeter.",
    close: "Close updates",
    loading: "Loading updates",
    empty: "No updates yet. New releases will appear here.",
    error: "Updates could not be loaded.",
    retry: "Retry",
    readUpdate: "Read update",
    archive: "View all LicenseMeter updates",
  },
  de: {
    heading: "Neuigkeiten",
    subtitle: "Neuigkeiten und Verbesserungen von LicenseMeter.",
    close: "Neuigkeiten schließen",
    loading: "Neuigkeiten werden geladen",
    empty: "Noch keine Neuigkeiten. Neue Versionen erscheinen hier.",
    error: "Neuigkeiten konnten nicht geladen werden.",
    retry: "Erneut versuchen",
    readUpdate: "Update lesen",
    archive: "Alle Neuigkeiten von LicenseMeter",
  },
} as const;

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Native modal dialog: showModal() gives top layer, inert page, focus
 * containment, and Escape via the cancel event. Below sm it fills the
 * screen with safe-area padding; from sm it is a full-height sheet docked
 * to the right edge. Body scroll is locked while open and focus returns
 * to the bell.
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
    /* showModal() makes the page inert but still lets Tab leave for the
       browser chrome; wrap within the sheet so keyboard users stay put. */
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
      if (dialog.open) dialog.close();
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, [triggerRef]);

  /* Read state flips only once the list is actually on screen. */
  useEffect(() => {
    if (status === "ready") markDisplayed(entries);
  }, [status, entries]);

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
      className="bg-card text-ink sm:border-line sm:shadow-hero sm:backdrop:bg-ink/25 fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overscroll-contain border-0 p-0 backdrop:bg-transparent sm:inset-y-3 sm:right-3 sm:left-auto sm:h-auto sm:w-[400px] sm:max-w-[calc(100vw-1.5rem)] sm:rounded-2xl sm:border"
    >
      <div className="flex h-full flex-col">
        <div className="border-line flex shrink-0 items-start justify-between gap-3 border-b px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-4 sm:px-5">
          <div className="flex min-w-0 items-start gap-3">
            <span
              aria-hidden="true"
              className="bg-brand-soft text-brand-text flex size-10 shrink-0 items-center justify-center rounded-full"
            >
              <Bell className="size-5" strokeWidth={1.75} />
            </span>
            <div className="min-w-0">
              <h2
                id="changelog-heading"
                className="font-display text-lg leading-tight tracking-tight"
              >
                {copy.heading}
              </h2>
              <p className="text-ink-soft mt-1 text-sm">{copy.subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            autoFocus
            onClick={onClose}
            aria-label={copy.close}
            className="text-ink-soft hover:text-ink -mt-2 -mr-2 flex size-11 shrink-0 cursor-pointer touch-manipulation items-center justify-center rounded-xl"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 sm:px-5">
          <PanelBody status={status} entries={entries} locale={locale} />
        </div>

        <div className="border-line bg-canvas shrink-0 border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:rounded-b-2xl sm:px-5">
          <a
            href={CHANGELOG_ARCHIVE_URL}
            target="_blank"
            rel="noreferrer"
            className={buttonClass("primary", "w-full")}
          >
            {copy.archive}
            <ExternalLink className="size-4" aria-hidden="true" />
          </a>
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
        <li key={entry.id} className="py-5">
          <time
            dateTime={entry.publishedOn}
            className="text-ink-faint text-xs font-medium"
          >
            {formatChangelogDate(entry.publishedOn, locale)}
          </time>
          <h3 className="mt-1.5 text-[15px] font-semibold tracking-tight">
            {entry.title}
          </h3>
          <p className="text-ink-soft mt-1.5 text-sm leading-relaxed whitespace-pre-line">
            {entry.summary}
          </p>
          <a
            href={entry.sourceUrl ?? changelogEntryUrl(entry.id)}
            target="_blank"
            rel="noreferrer"
            className="text-brand-text mt-3 inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
          >
            {copy.readUpdate}
            <ExternalLink className="size-3.5" aria-hidden="true" />
          </a>
        </li>
      ))}
    </ol>
  );
};
