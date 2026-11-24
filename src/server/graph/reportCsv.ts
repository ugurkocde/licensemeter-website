import type { ActiveUserDetailReport } from "./types";

/**
 * Minimal CSV parser for Microsoft Graph usage report downloads.
 * Handles quoted fields, escaped quotes, embedded commas/newlines, CRLF, BOM.
 */

export const parseCsv = (text: string): string[][] => {
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
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Drop fully empty trailing rows.
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
};

/** First row becomes the header; remaining rows become header-keyed records. */
const recordsFromRows = ([header, ...rows]: string[][]): Record<
  string,
  string
>[] => {
  if (!header) return [];
  return rows.map((cells) => {
    const record: Record<string, string> = {};
    header.forEach((name, i) => {
      record[name] = cells[i] ?? "";
    });
    return record;
  });
};

export const csvToRecords = (text: string): Record<string, string>[] =>
  recordsFromRows(parseCsv(text));

/** Empty strings in report date columns mean "never"; normalize to null. */
export const reportDate = (value: string | undefined): string | null => {
  const v = value?.trim();
  if (!v) return null;
  return v;
};

/** Read the report once and keep only non-identifying metadata for diagnostics. */
export const parseActiveUserDetail = (
  body: ArrayBuffer,
): ActiveUserDetailReport => {
  const csv = parseCsv(new TextDecoder().decode(body));
  const hasHeader = csv[0]?.includes("User Principal Name") ?? false;
  const records = hasHeader ? recordsFromRows(csv) : [];
  const reportRefreshDate =
    records
      .map((r) => r["Report Refresh Date"]?.trim())
      .find((date) => date && /^\d{4}-\d{2}-\d{2}$/.test(date)) ?? null;
  return {
    hasHeader,
    dataRowCount: records.length,
    reportRefreshDate,
    bodyBytes: body.byteLength,
    rows: records
      .filter((r) => r["User Principal Name"]?.trim())
      .map((r) => ({
        userPrincipalName: r["User Principal Name"]!.trim(),
        exchangeLastActivityDate: reportDate(r["Exchange Last Activity Date"]),
        oneDriveLastActivityDate: reportDate(r["OneDrive Last Activity Date"]),
        sharePointLastActivityDate: reportDate(
          r["SharePoint Last Activity Date"],
        ),
        teamsLastActivityDate: reportDate(r["Teams Last Activity Date"]),
      })),
  };
};
