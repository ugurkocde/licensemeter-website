import { parseCsv } from "~/server/graph/reportCsv";

/** One member row parsed from a pasted admin-panel export. */
export type ParsedMember = {
  /** Lowercased. */
  email: string;
  displayName: string | null;
  /** "active" | "invited" | "deactivated". */
  status: string;
  /** From a plan/seat-type column; null when the export has none. */
  products: string[] | null;
  lastActiveAt: Date | null;
};

export type ParsedMembers =
  | { rows: ParsedMember[]; invalid: string[] }
  | { error: string };

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Placeholders admin panels print instead of a last-active date (\u2014 is the em dash some tables render). */
const NO_DATE = new Set(["", "never", "-", "\u2014"]);

/**
 * Web tables paste as TSV and German Excel exports as semicolon CSV; both
 * convert to commas. Detection looks at the header line only, so quoted
 * commas in plain-comma exports are never corrupted.
 */
const normalizeDelimiters = (text: string): string => {
  const header = text.split(/\r?\n/)[0] ?? "";
  if (header.includes("\t")) return text.replace(/\t/g, ",");
  if (header.includes(";") && !header.includes(","))
    return text.replace(/;/g, ",");
  return text;
};

const findColumn = (headers: string[], pattern: RegExp): number =>
  headers.findIndex((h) => pattern.test(h));

const cellAt = (cells: string[], index: number): string =>
  index >= 0 ? (cells[index] ?? "").trim() : "";

/** Presence on a member export means a seat, so unknown maps to "active". */
const mapStatus = (raw: string): string => {
  const value = raw.toLowerCase();
  if (value === "invited" || value === "pending") return "invited";
  if (["deactivated", "disabled", "suspended", "removed"].includes(value))
    return "deactivated";
  return "active";
};

/**
 * "Pro + Research" or "Pro/Max" to one product per part; empty → null.
 * Product names flow into price book keys and finding dedupe keys, so each
 * part gets the same 120-char cap as AI spend categories.
 */
const splitProducts = (raw: string): string[] | null => {
  const parts = raw
    .split(/[+/]/)
    .map((p) => p.trim().slice(0, 120))
    .filter((p) => p !== "");
  return parts.length > 0 ? parts : null;
};

const ISO_DATE =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const DOTTED_DATE = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;

const utcDate = (y: number, m: number, d: number): Date | null => {
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
    ? date
    : null;
};

/**
 * Explicit shapes only, all pinned to UTC for day math: yyyy-mm-dd (optional
 * time, ISO datetimes with an offset go through Date.parse), dd.mm.yyyy as
 * used by German exports. Anything else is no date: Date.parse would read
 * "12.03.2026" as December in some runtimes and apply the local timezone.
 */
const parseLastActive = (raw: string): Date | null => {
  if (NO_DATE.has(raw.toLowerCase())) return null;
  const iso = ISO_DATE.exec(raw);
  if (iso) {
    if (iso[7]) {
      const ms = Date.parse(raw.replace(" ", "T"));
      return Number.isNaN(ms) ? null : new Date(ms);
    }
    const day = utcDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    if (!day || !iso[4]) return day;
    day.setUTCHours(Number(iso[4]), Number(iso[5]), Number(iso[6] ?? 0));
    return day;
  }
  const dotted = DOTTED_DATE.exec(raw);
  if (dotted) {
    return utcDate(Number(dotted[3]), Number(dotted[2]), Number(dotted[1]));
  }
  return null;
};

/**
 * Parses a member table pasted from a SaaS admin panel (ChatGPT, Claude,
 * spreadsheet re-exports) into seat rows.
 *
 * The first row must be a header with an email column; display-name (or
 * first/last name), status, plan/seat-type and last-active columns are picked
 * up when present. ChatGPT's role column (owner/admin/member) is deliberately
 * not read as a plan. Rows whose email cell is not email-shaped land in
 * `invalid`; duplicate emails keep the last occurrence.
 */
export const parseMembers = (text: string): ParsedMembers => {
  const input = text.trim();
  if (input === "")
    return { error: "Paste the member table including its header row" };

  const [headerCells = [], ...dataRows] = parseCsv(normalizeDelimiters(input));
  const headers = headerCells.map((h) => h.trim().toLowerCase());
  const emailCol = findColumn(headers, /e-?mail/);
  if (emailCol < 0)
    return {
      error:
        "No email column found. Paste the member table including its header row",
    };
  const nameCol = findColumn(headers, /^(display\s*)?name$/);
  const firstNameCol = findColumn(headers, /^first\s*name$/);
  const lastNameCol = findColumn(headers, /^last\s*name$/);
  const statusCol = findColumn(headers, /status|state/);
  const lastActiveCol = findColumn(
    headers,
    /last\s*(active|activity|used|login)/,
  );
  const productsCol = findColumn(headers, /plan|seat\s*type|license|product/);

  const byEmail = new Map<string, ParsedMember>();
  const invalid: string[] = [];
  for (const cells of dataRows) {
    const rawEmail = cellAt(cells, emailCol);
    const email = rawEmail.toLowerCase();
    if (!EMAIL_SHAPE.test(email)) {
      invalid.push(rawEmail !== "" ? rawEmail : cells.join(",").trim());
      continue;
    }
    const name =
      nameCol >= 0
        ? cellAt(cells, nameCol)
        : [cellAt(cells, firstNameCol), cellAt(cells, lastNameCol)]
            .filter((p) => p !== "")
            .join(" ");
    byEmail.set(email, {
      email,
      displayName: name === "" ? null : name,
      status: mapStatus(cellAt(cells, statusCol)),
      products: splitProducts(cellAt(cells, productsCol)),
      lastActiveAt: parseLastActive(cellAt(cells, lastActiveCol)),
    });
  }
  return { rows: [...byEmail.values()], invalid };
};
