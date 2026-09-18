import { describe, expect, it } from "vitest";

import { parseMembers } from "~/server/saas/parseMembers";

/** Narrows away the error branch for tests that expect a successful parse. */
const ok = (text: string) => {
  const result = parseMembers(text);
  if ("error" in result) throw new Error(result.error);
  return result;
};

describe("parseMembers", () => {
  it("parses a ChatGPT-shaped export, ignoring the role column", () => {
    const text =
      "name,email,status,role,last active\r\n" +
      "Jane Doe,Jane@Acme.com,active,owner,2026-05-01\r\n" +
      "Bob B,bob@acme.com,pending,member,never\r\n" +
      "Carol C,carol@acme.com,deactivated,member,";
    const { rows, invalid } = ok(text);
    expect(rows).toEqual([
      {
        email: "jane@acme.com",
        displayName: "Jane Doe",
        status: "active",
        products: null,
        lastActiveAt: new Date("2026-05-01T00:00:00.000Z"),
      },
      {
        email: "bob@acme.com",
        displayName: "Bob B",
        status: "invited",
        products: null,
        lastActiveAt: null,
      },
      {
        email: "carol@acme.com",
        displayName: "Carol C",
        status: "deactivated",
        products: null,
        lastActiveAt: null,
      },
    ]);
    expect(invalid).toEqual([]);
  });

  it("parses a Claude-shaped export with products from the seat type", () => {
    const { rows, invalid } = ok(
      "Email,Name,Seat type\n" +
        "jane@acme.com,Jane Doe,Pro\n" +
        "bob@acme.com,Bob B,Pro + Research",
    );
    expect(rows).toEqual([
      {
        email: "jane@acme.com",
        displayName: "Jane Doe",
        status: "active",
        products: ["Pro"],
        lastActiveAt: null,
      },
      {
        email: "bob@acme.com",
        displayName: "Bob B",
        status: "active",
        products: ["Pro", "Research"],
        lastActiveAt: null,
      },
    ]);
    expect(invalid).toEqual([]);
  });

  it("accepts a semicolon-delimited German Excel paste", () => {
    const { rows, invalid } = ok(
      "Name;E-Mail;Status\nJürgen Müller;Juergen@Firma.de;Aktiv",
    );
    expect(rows).toEqual([
      {
        email: "juergen@firma.de",
        displayName: "Jürgen Müller",
        status: "active",
        products: null,
        lastActiveAt: null,
      },
    ]);
    expect(invalid).toEqual([]);
  });

  it("accepts a tab-separated paste from a web table", () => {
    const { rows } = ok(
      "Name\tEmail\tStatus\tLast active\n" +
        "Jane Doe\tjane@acme.com\tSuspended\t2026-06-01",
    );
    expect(rows).toEqual([
      {
        email: "jane@acme.com",
        displayName: "Jane Doe",
        status: "deactivated",
        products: null,
        lastActiveAt: new Date("2026-06-01T00:00:00.000Z"),
      },
    ]);
  });

  it("preserves quoted commas in a plain-comma export", () => {
    const { rows } = ok('name,email\n"Doe, Jane",jane@acme.com');
    expect(rows.map((r) => r.displayName)).toEqual(["Doe, Jane"]);
  });

  it("joins first and last name when no name column exists", () => {
    const { rows } = ok(
      "First name,Last name,Email\nJane,Doe,jane@acme.com\nMadonna,,m@acme.com",
    );
    expect(rows.map((r) => r.displayName)).toEqual(["Jane Doe", "Madonna"]);
  });

  it("returns an error for empty input", () => {
    const expected = {
      error: "Paste the member table including its header row",
    };
    expect(parseMembers("")).toEqual(expected);
    expect(parseMembers("  \n \n")).toEqual(expected);
  });

  it("returns an error when no email column is found", () => {
    expect(parseMembers("name,status\nJane,active")).toEqual({
      error:
        "No email column found. Paste the member table including its header row",
    });
  });

  it("collects invalid email rows while parsing the rest", () => {
    const { rows, invalid } = ok(
      "email,name\n" +
        "not-an-email,Jane\n" +
        ",Empty\n" +
        "two words@acme.com,Sam\n" +
        "good@acme.com,Good",
    );
    expect(rows.map((r) => r.email)).toEqual(["good@acme.com"]);
    expect(invalid).toEqual(["not-an-email", ",Empty", "two words@acme.com"]);
  });

  it("dedupes by email, last occurrence wins", () => {
    const { rows } = ok("email,plan\ndup@acme.com,Pro\nDUP@acme.com,Max");
    expect(rows).toEqual([
      {
        email: "dup@acme.com",
        displayName: null,
        status: "active",
        products: ["Max"],
        lastActiveAt: null,
      },
    ]);
  });

  it("treats never, dashes, empties and garbage as no last-active date", () => {
    const { rows } = ok(
      "email,last active\n" +
        "a@acme.com,never\n" +
        "b@acme.com,\n" +
        "c@acme.com,n/a\n" +
        "d@acme.com,-\n" +
        "e@acme.com,\u2014\n" +
        "f@acme.com,2026-05-01",
    );
    expect(rows.map((r) => r.lastActiveAt)).toEqual([
      null,
      null,
      null,
      null,
      null,
      new Date("2026-05-01T00:00:00.000Z"),
    ]);
  });

  it("parses explicit date shapes as UTC and rejects ambiguous ones", () => {
    const { rows } = ok(
      "email,last active\n" +
        "a@acme.com,12.03.2026\n" +
        "b@acme.com,2026-03-12 14:30\n" +
        "c@acme.com,2026-03-12T14:30:00Z\n" +
        "d@acme.com,2026-03-12T14:30:00+02:00\n" +
        "e@acme.com,03/12/2026\n" +
        "f@acme.com,March 12 2026\n" +
        "g@acme.com,31.02.2026\n" +
        "h@acme.com,2026-13-01",
    );
    expect(rows.map((r) => r.lastActiveAt)).toEqual([
      new Date("2026-03-12T00:00:00.000Z"),
      new Date("2026-03-12T14:30:00.000Z"),
      new Date("2026-03-12T14:30:00.000Z"),
      new Date("2026-03-12T12:30:00.000Z"),
      null,
      null,
      null,
      null,
    ]);
  });

  it("defaults every row to active when the status column is absent", () => {
    const { rows } = ok("email\na@acme.com\nb@acme.com");
    expect(rows.map((r) => r.status)).toEqual(["active", "active"]);
  });

  it("caps product names at 120 characters", () => {
    const { rows } = ok(`email,seat type\na@acme.com,${"x".repeat(500)}`);
    expect(rows[0]!.products).toEqual(["x".repeat(120)]);
  });
});
