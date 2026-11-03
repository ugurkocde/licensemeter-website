/** Formatting helpers. Locales are pinned per currency to avoid hydration drift. */

/**
 * Human label for a workspace. Prefers the org display name, falls back to the
 * Entra tenant id, then a generic word for workspaces with neither (a fresh
 * workspace before any Microsoft tenant is connected; tid is nullable).
 */
export const workspaceLabel = (t: {
  name: string | null;
  tid: string | null;
}): string => t.name ?? t.tid ?? "Workspace";

const CURRENCY_LOCALE: Record<string, string> = {
  EUR: "de-DE",
  USD: "en-US",
  GBP: "en-GB",
  CHF: "de-CH",
  CAD: "en-CA",
  AUD: "en-AU",
  DKK: "da-DK",
  NOK: "nb-NO",
  SEK: "sv-SE",
  PLN: "pl-PL",
  CZK: "cs-CZ",
};

export const fmtMoney = (cents: number, currency: string): string =>
  new Intl.NumberFormat(CURRENCY_LOCALE[currency] ?? "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);

/** Grouping follows the workspace currency so separators match the money columns. */
export const fmtNumber = (n: number, currency = "EUR"): string =>
  new Intl.NumberFormat(CURRENCY_LOCALE[currency] ?? "en-US").format(n);

export const fmtDate = (d: Date | string | null): string => {
  if (!d) return "-";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
};

/**
 * Calendar days from `now` to `date`, counted on the dates fmtDate shows (the
 * server's local timezone), not on elapsed hours: an evening `now` and a
 * same-day `date` are 0 apart, tomorrow evening is 1 away. Negative when past.
 */
export const calendarDaysUntil = (date: Date, now: Date): number => {
  const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((day(date) - day(now)) / 86_400_000);
};

/** "Today", "Tomorrow", "In 5 days", "Yesterday", "3 days ago". */
export const relativeDayLabel = (days: number): string =>
  days < -1
    ? `${-days} days ago`
    : days === -1
      ? "Yesterday"
      : days === 0
        ? "Today"
        : days === 1
          ? "Tomorrow"
          : `In ${days} days`;

/** fmtDate plus 24h time, for lists where same-day entries must stay apart. */
export const fmtDateTime = (d: Date | string | null): string => {
  if (!d) return "-";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
};

export const fmtAgo = (d: Date | null): string => {
  if (!d) return "never";
  // Clamp future timestamps (clock skew) to "just now" instead of a negative.
  const mins = Math.max(0, Math.floor((Date.now() - d.getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
};
