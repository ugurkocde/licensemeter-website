import { describe, expect, it } from "vitest";

import { buildIcs, escapeText, foldLine, icsFileName } from "./ics";

const NOW = new Date("2027-01-10T09:08:07.654Z");

const unfold = (ics: string) => ics.replace(/\r\n /g, "");

describe("buildIcs", () => {
  const ics = buildIcs({
    prodId: "-//LicenseMeter//Renewal savings plan//EN",
    name: "LicenseMeter renewals",
    now: NOW,
    events: [
      {
        uid: "t1.sku-a.notice@licensemeter",
        date: "2027-02-22",
        summary: "Decide Microsoft 365 E3 renewal: cut 8 seats",
        description: "Paid seats: 100\nSeats to cut: 8",
        url: "https://licensemeter.example/app/renewals",
      },
      {
        uid: "t1.sku-a.renewal@licensemeter",
        date: "2027-12-31",
        summary: "Renewal",
      },
    ],
  });

  it("is a valid VCALENDAR with CRLF line endings throughout", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
    expect(ics).toContain(
      "PRODID:-//LicenseMeter//Renewal savings plan//EN\r\n",
    );
    expect(ics).toContain("METHOD:PUBLISH\r\n");
    expect(ics).toContain("X-WR-CALNAME:LicenseMeter renewals\r\n");
  });

  it("writes all-day events with an exclusive end date, across a year end", () => {
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics.match(/END:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain(
      "DTSTART;VALUE=DATE:20270222\r\nDTEND;VALUE=DATE:20270223\r\n",
    );
    expect(ics).toContain(
      "DTSTART;VALUE=DATE:20271231\r\nDTEND;VALUE=DATE:20280101\r\n",
    );
    expect(ics).toContain("DTSTAMP:20270110T090807Z\r\n");
    expect(ics).toContain("UID:t1.sku-a.notice@licensemeter\r\n");
    expect(ics).toContain("TRANSP:TRANSPARENT\r\n");
  });

  it("escapes newlines in descriptions and omits optional properties", () => {
    expect(unfold(ics)).toContain(
      "DESCRIPTION:Paid seats: 100\\nSeats to cut: 8\r\n",
    );
    expect(ics.match(/DESCRIPTION:/g)).toHaveLength(1);
    expect(ics.match(/URL:/g)).toHaveLength(1);
  });

  it("keeps property values on one line even when they contain line breaks", () => {
    const out = buildIcs({
      prodId: "-//x\r\nBEGIN:VEVENT//EN",
      now: NOW,
      events: [
        {
          uid: "a\nb",
          date: "2027-01-01",
          summary: "s",
          url: "https://x\r\nEVIL:1",
        },
      ],
    });
    expect(out).not.toMatch(/\r\nBEGIN:VEVENT\/\/EN/);
    expect(out).not.toMatch(/\r\nEVIL:1/);
    expect(out).toContain("UID:a b\r\n");
  });

  it("rejects an invalid date instead of writing a broken calendar", () => {
    expect(() =>
      buildIcs({
        prodId: "x",
        now: NOW,
        events: [{ uid: "u", date: "2027-1-1", summary: "s" }],
      }),
    ).toThrow(/Invalid calendar date/);
  });
});

describe("escapeText", () => {
  it("escapes backslash, semicolon, comma and every newline style", () => {
    expect(escapeText("a\\b;c,d\ne\r\nf\rg")).toBe(
      "a\\\\b\\;c\\,d\\ne\\nf\\ng",
    );
  });
});

describe("foldLine", () => {
  const octets = (s: string) => new TextEncoder().encode(s).length;

  it("leaves short lines alone", () => {
    expect(foldLine("SUMMARY:short")).toBe("SUMMARY:short");
  });

  it("folds at 75 octets with a leading space on continuation lines", () => {
    const line = `DESCRIPTION:${"x".repeat(200)}`;
    const folded = foldLine(line);
    const parts = folded.split("\r\n");
    expect(parts.length).toBeGreaterThan(2);
    expect(octets(parts[0]!)).toBe(75);
    for (const part of parts.slice(1)) {
      expect(part.startsWith(" ")).toBe(true);
      expect(octets(part)).toBeLessThanOrEqual(75);
    }
    expect(folded.replace(/\r\n /g, "")).toBe(line);
  });

  it("never splits a multi-byte character", () => {
    const line = `SUMMARY:${"€ü😀".repeat(40)}`;
    const parts = foldLine(line).split("\r\n");
    for (const part of parts) {
      expect(octets(part)).toBeLessThanOrEqual(75);
      expect(part).not.toContain("�");
      // Every part decodes to whole characters.
      expect(
        new TextDecoder("utf-8", { fatal: true }).decode(
          new TextEncoder().encode(part),
        ),
      ).toBe(part);
    }
    expect(foldLine(line).replace(/\r\n /g, "")).toBe(line);
  });
});

describe("icsFileName", () => {
  it("makes a safe slug and falls back when nothing is left", () => {
    expect(icsFileName("Microsoft 365 E3 (no Teams)")).toBe(
      "microsoft-365-e3-no-teams.ics",
    );
    expect(icsFileName('"; rm -rf /')).toBe("rm-rf.ics");
    expect(icsFileName("€€€")).toBe("renewal.ics");
  });
});
