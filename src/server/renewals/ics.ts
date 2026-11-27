/**
 * Minimal RFC 5545 calendar writer for all-day events. No dependencies: CRLF
 * line endings, TEXT escaping and 75-octet line folding that never splits a
 * UTF-8 character.
 */

export type IcsEvent = {
  /** Globally unique and stable, so a re-import updates instead of duplicating. */
  uid: string;
  /** yyyy-mm-dd, an all-day event. */
  date: string;
  summary: string;
  description?: string;
  url?: string;
};

export type IcsCalendar = {
  /** PRODID, for example "-//LicenseMeter//Renewal plan//EN". */
  prodId: string;
  name?: string;
  events: readonly IcsEvent[];
  /** DTSTAMP for every event. */
  now: Date;
};

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** RFC 5545 3.3.11: backslash, semicolon, comma and newlines are escaped. */
export const escapeText = (value: string): string =>
  value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");

const encoder = new TextEncoder();

/**
 * RFC 5545 3.1: lines longer than 75 octets continue on the next line after
 * CRLF and one space. Splits only between characters.
 */
export const foldLine = (line: string): string => {
  const parts: string[] = [];
  let current = "";
  let octets = 0;
  // The first line holds 75 octets; continuation lines start with a space.
  let limit = 75;
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (octets + size > limit) {
      parts.push(current);
      current = "";
      octets = 0;
      limit = 74;
    }
    current += char;
    octets += size;
  }
  parts.push(current);
  return parts.join("\r\n ");
};

const basicDate = (iso: string): string => {
  const match = ISO_DAY.exec(iso);
  if (!match) throw new Error(`Invalid calendar date: ${iso}`);
  return `${match[1]}${match[2]}${match[3]}`;
};

const nextDay = (iso: string): string =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + 86_400_000)
    .toISOString()
    .slice(0, 10);

const utcStamp = (date: Date): string =>
  date
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replace(/[-:]/g, "");

/** Property values like UID must not break the line structure either. */
const singleLine = (value: string) => value.replace(/[\r\n]+/g, " ");

export const buildIcs = (calendar: IcsCalendar): string => {
  const stamp = utcStamp(calendar.now);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${singleLine(calendar.prodId)}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...(calendar.name ? [`X-WR-CALNAME:${escapeText(calendar.name)}`] : []),
  ];
  for (const event of calendar.events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${singleLine(event.uid)}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${basicDate(event.date)}`,
      `DTEND;VALUE=DATE:${basicDate(nextDay(event.date))}`,
      `SUMMARY:${escapeText(event.summary)}`,
      ...(event.description
        ? [`DESCRIPTION:${escapeText(event.description)}`]
        : []),
      ...(event.url ? [`URL:${singleLine(event.url)}`] : []),
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
};

/** A safe attachment file name from free text. */
export const icsFileName = (label: string): string => {
  const slug = label
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "-")
    .slice(0, 60)
    .replace(/-+$/, "");
  return `${slug || "renewal"}.ics`;
};
