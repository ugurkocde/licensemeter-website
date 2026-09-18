import { describe, expect, it } from "vitest";

import { DEMO_FIGURES, demoEuros } from "~/lib/demoFigures";
import { CONNECTOR_SCOPES } from "~/lib/scopes";
import {
  welcomeDomain,
  welcomeHtml,
  welcomeSubject,
} from "~/server/welcomeEmail";

const ARGS = {
  email: "anna@contoso.com",
  baseUrl: "https://licensemeter.com",
  unsubscribeUrl: "https://licensemeter.com/api/unsubscribe?e=abc&t=def",
};

describe("welcomeDomain", () => {
  it("returns the business domain", () => {
    expect(welcomeDomain("anna@contoso.com")).toBe("contoso.com");
  });

  it("returns null for freemail and unparseable addresses", () => {
    expect(welcomeDomain("a@gmail.com")).toBeNull();
    expect(welcomeDomain("a@googlemail.com")).toBeNull();
    expect(welcomeDomain("a@web.de")).toBeNull();
    expect(welcomeDomain("a@gmx.de")).toBeNull();
    expect(welcomeDomain("nodomain")).toBeNull();
  });
});

describe("welcomeSubject", () => {
  it("personalizes business domains and stays neutral for freemail", () => {
    expect(welcomeSubject("anna@contoso.com")).toContain("for contoso.com");
    expect(welcomeSubject("a@gmail.com")).toBe(
      "Your first waste scan, plus the one-pager for your Global Admin",
    );
  });
});

describe("welcomeHtml", () => {
  const html = welcomeHtml(ARGS);

  it("renders every connector scope from the shared constant", () => {
    for (const s of CONNECTOR_SCOPES) {
      expect(html).toContain(s.scope);
      expect(html).toContain(s.why);
    }
  });

  it("links connect, security and home with the campaign tag, and unsubscribe", () => {
    expect(html).toContain("/app/connect?utm_source=welcome_email");
    expect(html).toContain("/security?utm_source=welcome_email");
    expect(html).toContain("/dpa?utm_source=welcome_email");
    expect(html).toContain("pre-signed AVV (DPA)");
    expect(html).not.toContain("available on request");
    expect(html).not.toContain("Sign in with Microsoft");
    expect(html).toContain("Sign in: any work account");
    expect(html).toContain("/?utm_source=welcome_email");
    // URLs land in href attributes entity-escaped.
    expect(html).toContain("utm_source=welcome_email&amp;utm_medium=email");
    expect(html).toContain("/api/unsubscribe?e=abc&amp;t=def");
  });

  it("personalizes the heading for business domains only", () => {
    expect(html).toContain("Your first waste scan for contoso.com");
    const freemail = welcomeHtml({ ...ARGS, email: "anna@gmail.com" });
    expect(freemail).toContain("Your first waste scan");
    expect(freemail).not.toContain("Your first waste scan for");
  });

  it("escapes hostile input in domain and email", () => {
    const hostile = welcomeHtml({ ...ARGS, email: 'x@evil"<img>.com' });
    expect(hostile).not.toContain("<img>");
    expect(hostile).toContain("&lt;img&gt;");
  });

  it("renders the brand mark from the canonical origin", () => {
    expect(html).toContain('src="https://licensemeter.com/brand-mark.png"');
  });

  it("quotes the demo figure and the read-only promise", () => {
    expect(html).toContain(`€ ${demoEuros(DEMO_FIGURES.monthlyWasteCents)}`);
    expect(html).toContain(`${DEMO_FIGURES.users}-person tenant`);
    expect(html).toContain("No write access, ever.");
  });

  it("names the accurate consent role and links the CSV import", () => {
    expect(html).toContain("Privileged Role Administrator");
    expect(html).toContain("/app/connect/csv");
  });

  it("offers the instant scan to Application Administrators via the chooser page", () => {
    expect(html).toContain("instant scan");
    expect(html).toContain("runs with your own permissions");
    // The scan sentence links the connect chooser, never /api/scan/start
    // directly: a scan must start from a signed-in browser session.
    expect(html).not.toContain("/api/scan/start");
    const connectLinks = html.match(
      /href="https:\/\/licensemeter\.com\/app\/connect\?utm_source=welcome_email/g,
    );
    expect(connectLinks).toHaveLength(2);
  });
});
