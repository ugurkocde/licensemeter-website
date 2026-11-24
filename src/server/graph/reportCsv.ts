/**
 * Minimal CSV parser for Microsoft Graph usage report downloads.
 * Handles quoted fields, escaped quotes, embedded commas/newlines, CRLF, BOM.
 */

export const parseCsv = (
  text: string,
  onUnclosedQuote?: () => void,
): string[][] => {
  const input = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (inQuotes) onUnclosedQuote?.();
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Drop fully empty trailing rows.
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
};

/** First row becomes the header; remaining rows become header-keyed records. */
export const csvToRecords = (text: string): Record<string, string>[] => {
  const rows = parseCsv(text);
  const header = rows[0];
  if (!header) return [];
  return rows.slice(1).map((cells) => {
    const record: Record<string, string> = {};
    header.forEach((name, i) => {
      record[name] = cells[i] ?? "";
    });
    return record;
  });
};

/** Empty strings in report date columns mean "never"; normalize to null. */
export const reportDate = (value: string | undefined): string | null => {
  const v = value?.trim();
  if (!v) return null;
  return v;
};
