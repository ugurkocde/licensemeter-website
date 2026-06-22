/** Formatting helpers. Locales are pinned per currency to avoid hydration drift. */

/**
 * Human label for a workspace. Prefers the org display name, falls back to the
 * Entra tenant id, then a generic word for workspaces with neither (a fresh
 * WorkOS workspace before any Microsoft tenant is connected — tid is nullable).
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
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
};
