/**
 * Central Ugurlabs product changelog: feed parsing, product identity, and the
 * local "seen" state behind the navigation bell. Pure logic only, so it runs
 * in unit tests without a DOM; the bell components own fetching and storage.
 * Mirrors .ugurlabs/changelog.json.
 */

export const CHANGELOG_PRODUCT_ID = "licensemeter";
export const CHANGELOG_API_URL = `https://changelog.ugurlabs.com/api/changelog/${CHANGELOG_PRODUCT_ID}`;
export const CHANGELOG_ARCHIVE_URL = `https://changelog.ugurlabs.com/?product=${CHANGELOG_PRODUCT_ID}`;
export const CHANGELOG_STORAGE_KEY = "licensemeter:changelog:seen";

/** Entries fetched per page load; the bell never needs the full archive. */
export const CHANGELOG_FEED_LIMIT = 20;
/** Seen ids kept locally; older ones fall out of the feed anyway. */
export const CHANGELOG_SEEN_LIMIT = 200;

export type ChangelogEntry = {
  id: string;
  title: string;
  summary: string;
  publishedOn: string;
  sourceUrl: string | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const publicHttpsUrl = (value: unknown): string | null => {
  if (typeof value !== "string" || value.length === 0 || value.length > 2000)
    return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
};

const entryFrom = (value: unknown): ChangelogEntry | null => {
  if (!isRecord(value)) return null;
  const { id, title, summary, publishedOn } = value;
  if (
    typeof id !== "string" ||
    id.trim().length === 0 ||
    typeof title !== "string" ||
    title.trim().length === 0 ||
    typeof summary !== "string" ||
    typeof publishedOn !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(publishedOn)
  ) {
    return null;
  }
  return {
    id: id.trim(),
    title: title.trim(),
    summary: summary.trim(),
    publishedOn,
    // Change type is deliberately dropped: the embedded UI shows no labels.
    sourceUrl: publicHttpsUrl(value.sourceUrl),
  };
};

/**
 * Validates a public GET response. Rejects a feed for any other product so a
 * misconfigured proxy or cache can never surface foreign announcements here.
 * Malformed entries are skipped rather than failing the whole feed.
 */
export const parseChangelogFeed = (
  payload: unknown,
  productId = CHANGELOG_PRODUCT_ID,
): ChangelogEntry[] => {
  if (!isRecord(payload) || !isRecord(payload.product)) {
    throw new Error("Changelog feed has an unexpected shape");
  }
  if (payload.product.id !== productId) {
    throw new Error("Changelog feed belongs to another product");
  }
  if (!Array.isArray(payload.entries)) {
    throw new Error("Changelog feed has no entries list");
  }
  const seen = new Set<string>();
  const entries: ChangelogEntry[] = [];
  for (const raw of payload.entries) {
    const entry = entryFrom(raw);
    if (!entry || seen.has(entry.id)) continue;
    seen.add(entry.id);
    entries.push(entry);
  }
  return entries;
};

/** Deep link into the public archive for one entry. */
export const changelogEntryUrl = (id: string): string =>
  `${CHANGELOG_ARCHIVE_URL}#change-${encodeURIComponent(id.toLowerCase())}`;

/** Parses the persisted seen-id list, tolerating garbage from older builds. */
export const parseSeenIds = (raw: string | null | undefined): string[] => {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
};

/**
 * Marks the displayed entries as seen. Newest ids go first and the list is
 * capped so storage cannot grow without bound. Returns the same array when
 * nothing changed so callers can skip a write.
 */
export const markSeen = (
  seen: readonly string[],
  displayed: readonly ChangelogEntry[],
): string[] => {
  const known = new Set(seen);
  const fresh = displayed.map((e) => e.id).filter((id) => !known.has(id));
  if (fresh.length === 0) return [...seen];
  return [...fresh, ...seen].slice(0, CHANGELOG_SEEN_LIMIT);
};

export const unreadCount = (
  entries: readonly ChangelogEntry[],
  seen: readonly string[],
): number => {
  const known = new Set(seen);
  return entries.reduce((n, e) => (known.has(e.id) ? n : n + 1), 0);
};

/** Badge text: exact up to nine, then "9+" so the bell never grows wide. */
export const badgeLabel = (count: number): string =>
  count > 9 ? "9+" : String(count);

const DATE_LOCALES = { en: "en-GB", de: "de-DE" } as const;

export type ChangelogLocale = keyof typeof DATE_LOCALES;

/** "12 Sep 2026" / "12. Sept. 2026"; falls back to ISO on invalid input. */
export const formatChangelogDate = (
  publishedOn: string,
  locale: ChangelogLocale,
): string => {
  const [y, m, d] = publishedOn.split("-").map(Number);
  if (!y || !m || !d) return publishedOn;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(date.getTime())) return publishedOn;
  return new Intl.DateTimeFormat(DATE_LOCALES[locale], {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
};
