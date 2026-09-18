/** CSV writer for exports (RFC 4180 quoting + spreadsheet formula guarding). */

export const escapeCell = (value: string): string => {
  // Neutralize formula injection when the CSV is opened in Excel/LibreOffice.
  // A leading minus is only guarded when it does not start a plain negative
  // number, so "-12.50" stays numeric.
  const guarded = /^[=+@\t\r]|^-(?![\d.])/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(guarded)
    ? `"${guarded.replaceAll('"', '""')}"`
    : guarded;
};

export const toCsv = (rows: (string | number | null | undefined)[][]): string =>
  rows
    .map((row) => row.map((c) => escapeCell(String(c ?? ""))).join(","))
    .join("\r\n");

/** Byte order mark so Excel decodes UTF-8 (accented names) instead of ANSI. */
export const CSV_BOM = "\uFEFF";

export const csvResponse = (filename: string, csv: string): Response =>
  new Response(`${CSV_BOM}${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });

export const centsToDecimal = (cents: number): string =>
  (cents / 100).toFixed(2);
