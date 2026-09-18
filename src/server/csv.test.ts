import { describe, expect, it } from "vitest";

import { CSV_BOM, csvResponse, escapeCell, toCsv } from "./csv";

describe("escapeCell", () => {
  it("keeps negative numbers numeric", () => {
    expect(escapeCell("-12.50")).toBe("-12.50");
    expect(escapeCell("-.5")).toBe("-.5");
    expect(escapeCell("-7")).toBe("-7");
  });

  it("guards formula-like prefixes including a non-numeric minus", () => {
    expect(escapeCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(escapeCell("+1+1")).toBe("'+1+1");
    expect(escapeCell("@cmd")).toBe("'@cmd");
    expect(escapeCell("-cmd")).toBe("'-cmd");
    expect(escapeCell("--1")).toBe("'--1");
    expect(escapeCell("\tx")).toBe("'\tx");
  });

  it("quotes cells with separators, quotes or line breaks", () => {
    expect(escapeCell('say "hi", now')).toBe('"say ""hi"", now"');
    expect(escapeCell("a\nb")).toBe('"a\nb"');
    expect(escapeCell("plain")).toBe("plain");
  });
});

describe("toCsv / csvResponse", () => {
  it("joins rows with CRLF and renders null as empty", () => {
    expect(
      toCsv([
        ["a", null, 3],
        ["-1.5", undefined, "x"],
      ]),
    ).toBe("a,,3\r\n-1.5,,x");
  });

  it("prefixes the body with a UTF-8 byte order mark for Excel", async () => {
    const res = csvResponse("export.csv", "name\r\nZoë");
    // Response.text() strips the BOM per spec; check the raw bytes instead.
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes)).toBe("name\r\nZoë");
    expect(CSV_BOM).toBe("\uFEFF");
    expect(res.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
  });
});
