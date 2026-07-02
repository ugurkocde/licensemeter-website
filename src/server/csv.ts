/** CSV writer for exports (RFC 4180 quoting + spreadsheet formula guarding). */

const escapeCell = (value: string): string => {
  // Neutralize formula injection when the CSV is opened in Excel/LibreOffice.
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(guarded)
    ? `"${guarded.replaceAll('"', '""')}"`
    : guarded;
};

export const toCsv = (rows: (string | number | null | undefined)[][]): string =>
  rows
    .map((row) => row.map((c) => escapeCell(String(c ?? ""))).join(","))
    .join("\r\n");

export const csvResponse = (filename: string, csv: string): Response =>
  new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });

export const centsToDecimal = (cents: number): string => (cents / 100).toFixed(2);
