import { renderToBuffer } from "@react-pdf/renderer";
import { describe, expect, it } from "vitest";

import { WasteReport, type ReportData } from "~/server/report/WasteReport";

/**
 * Renders the real component to a PDF buffer. WasteReport is a .tsx file and
 * tsconfig keeps `jsx: "preserve"` for Next, so vitest.config.ts has to turn
 * the JSX transform on: `oxc: { jsx: { runtime: "automatic" } }`.
 */

/** A 1x1 transparent PNG. */
const PNG_LOGO =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const DATA: ReportData = {
  tenantName: "Contoso GmbH",
  generatedOn: "18 Sep 2026",
  monthlySpend: "EUR 12,400",
  monthlyWaste: "EUR 1,830/mo",
  annualWaste: "EUR 21,960",
  openFindings: 2,
  byRule: [{ label: "Inactive users", count: 2, impact: "EUR 1,830/mo" }],
  topFindings: [
    { title: "Inactive user with E5", impact: "EUR 1,200/mo" },
    { title: "Disabled user with E3", impact: "EUR 630/mo" },
  ],
};

const isPdf = (buffer: Buffer) =>
  buffer.subarray(0, 5).toString("latin1") === "%PDF-";

/** Info dictionary strings are written as literals or as UTF-16BE hex. */
const mentions = (buffer: Buffer, text: string) => {
  const raw = buffer.toString("latin1");
  const utf16Hex = Buffer.from(text, "utf16le").swap16().toString("hex");
  return raw.includes(text) || raw.toLowerCase().includes(utf16Hex);
};

describe("WasteReport", () => {
  it("renders the LicenseMeter report without branding", async () => {
    const buffer = await renderToBuffer(WasteReport({ data: DATA }));

    expect(buffer.length).toBeGreaterThan(1000);
    expect(isPdf(buffer)).toBe(true);
    expect(mentions(buffer, "LicenseMeter")).toBe(true);
  });

  it("renders a white-label report with a logo and a light brand colour", async () => {
    const buffer = await renderToBuffer(
      WasteReport({
        data: DATA,
        branding: { name: "Northwind IT", color: "#ffe600", logo: PNG_LOGO },
      }),
    );

    expect(buffer.length).toBeGreaterThan(1000);
    expect(isPdf(buffer)).toBe(true);
    // The brand takes over the PDF author.
    expect(mentions(buffer, "Northwind IT")).toBe(true);
  });

  it("renders a white-label report from a brand name alone", async () => {
    const buffer = await renderToBuffer(
      WasteReport({
        data: DATA,
        branding: { name: "Northwind IT", color: null, logo: null },
      }),
    );

    expect(isPdf(buffer)).toBe(true);
    expect(mentions(buffer, "Northwind IT")).toBe(true);
  });

  it("still renders when the stored logo is not a decodable image", async () => {
    // Valid PNG signature, nothing behind it: passes a magic number check.
    const broken = `data:image/png;base64,${Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
    ]).toString("base64")}`;
    const buffer = await renderToBuffer(
      WasteReport({
        data: DATA,
        branding: { name: "Northwind IT", color: "#123456", logo: broken },
      }),
    );

    expect(isPdf(buffer)).toBe(true);
  });
});
