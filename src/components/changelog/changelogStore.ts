import {
  CHANGELOG_API_URL,
  CHANGELOG_FEED_LIMIT,
  CHANGELOG_STORAGE_KEY,
  type ChangelogEntry,
  markSeen,
  parseChangelogFeed,
  parseSeenIds,
} from "~/lib/changelog";

/**
 * Module-level store shared by every bell on the page (the dashboard renders
 * one in the sidebar and one in the mobile top bar). One feed request per
 * page load, one seen-list, and a subscription API for useSyncExternalStore.
 * Cross-tab updates arrive through the `storage` event; when localStorage is
 * unavailable the seen-list lives in memory for the current page only.
 */

export type FeedStatus = "idle" | "loading" | "ready" | "error";

export type ChangelogSnapshot = {
  status: FeedStatus;
  entries: ChangelogEntry[];
  seen: string[];
};

const FETCH_TIMEOUT_MS = 8_000;

/** Stable snapshot for server rendering and the first client render. */
const INITIAL: ChangelogSnapshot = { status: "idle", entries: [], seen: [] };

let snapshot: ChangelogSnapshot = INITIAL;
let inflight: Promise<void> | null = null;
let seenLoaded = false;
const listeners = new Set<() => void>();

const emit = (patch: Partial<ChangelogSnapshot>) => {
  snapshot = { ...snapshot, ...patch };
  for (const listener of listeners) listener();
};

const readStorage = (): string | null => {
  try {
    return window.localStorage.getItem(CHANGELOG_STORAGE_KEY);
  } catch {
    return null;
  }
};

const writeStorage = (ids: string[]): void => {
  try {
    window.localStorage.setItem(CHANGELOG_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Private mode, quota, or disabled storage: keep the in-memory copy.
  }
};

const ensureSeenLoaded = () => {
  if (seenLoaded || typeof window === "undefined") return;
  seenLoaded = true;
  const seen = parseSeenIds(readStorage());
  if (seen.length > 0) emit({ seen });
  window.addEventListener("storage", (event) => {
    if (event.key !== null && event.key !== CHANGELOG_STORAGE_KEY) return;
    emit({ seen: parseSeenIds(event.newValue) });
  });
};

export const subscribe = (listener: () => void): (() => void) => {
  ensureSeenLoaded();
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getSnapshot = (): ChangelogSnapshot => snapshot;

export const getServerSnapshot = (): ChangelogSnapshot => INITIAL;

const fetchFeed = async (): Promise<ChangelogEntry[]> => {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(
      `${CHANGELOG_API_URL}?limit=${CHANGELOG_FEED_LIMIT}`,
      {
        headers: { Accept: "application/json" },
        signal: ctrl.signal,
      },
    );
    if (!res.ok) throw new Error(`Changelog feed returned ${res.status}`);
    return parseChangelogFeed(await res.json());
  } finally {
    window.clearTimeout(timer);
  }
};

/**
 * Loads the feed once; concurrent callers share the request. A completed
 * load is reused for the rest of the page's life unless `retry` is set,
 * which is how the panel's Retry button recovers from an error.
 */
export const loadFeed = (retry = false): Promise<void> => {
  if (inflight) return inflight;
  if (snapshot.status === "ready" && !retry) return Promise.resolve();
  emit({ status: "loading" });
  inflight = fetchFeed()
    .then((entries) => emit({ status: "ready", entries }))
    .catch(() => emit({ status: "error" }))
    .finally(() => {
      inflight = null;
    });
  return inflight;
};

/** Called by the panel once it has rendered the entries. */
export const markDisplayed = (entries: readonly ChangelogEntry[]): void => {
  ensureSeenLoaded();
  const next = markSeen(snapshot.seen, entries);
  if (next.length === snapshot.seen.length) return;
  writeStorage(next);
  emit({ seen: next });
};

/** Test hook: restores the pristine store between cases. */
export const resetChangelogStore = (): void => {
  snapshot = INITIAL;
  inflight = null;
  seenLoaded = false;
  listeners.clear();
};
