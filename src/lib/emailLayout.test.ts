import { describe, expect, it } from "vitest";

import {
  emailAddressText,
  emailAmount,
  emailAppLink,
  emailAppUrl,
  emailButton,
  emailRows,
  emailShell,
  emailStrong,
  emailWaste,
} from "~/lib/emailLayout";
import { validateReturnTo } from "~/server/auth/session";

const BASE = "https://licensemeter.com";

describe("emailAppUrl", () => {
  it("routes an app path through sign-in with the path as return target", () => {
    expect(emailAppUrl(BASE, "/app/findings")).toBe(
      "https://licensemeter.com/sign-in?returnTo=%2Fapp%2Ffindings",
    );
    expect(emailAppUrl(BASE, "/app", "utm_source=x&utm_medium=email")).toBe(
      "https://licensemeter.com/sign-in?returnTo=%2Fapp&utm_source=x&utm_medium=email",
    );
  });

  it("produces a return target the sign-in route accepts", () => {
    for (const path of ["/app", "/app/findings", "/app/settings"]) {
      const url = new URL(emailAppUrl(BASE, path));
      expect(validateReturnTo(url.searchParams.get("returnTo"))).toBe(path);
    }
  });

  it("escapes the link variant for an href", () => {
    expect(emailAppLink(BASE, "/app", "a=1&b=2")).toContain("&amp;b=2");
  });
});

describe("blocks", () => {
  it("escape the plain text they take", () => {
    expect(emailStrong("<b>x</b>")).not.toContain("<b>");
    expect(emailButton("https://x.test", "Go <now>")).not.toContain("<now>");
    const rows = emailRows([{ label: "<i>seat</i>", value: "<s>5</s>" }]);
    expect(rows).not.toContain("<i>");
    expect(rows).not.toContain("<s>");
  });

  it("render no table for an empty row list", () => {
    expect(emailRows([])).toBe("");
  });

  it("give Outlook a button of its own", () => {
    const button = emailButton("https://x.test/a", "Open the findings");
    expect(button).toContain("v:roundrect");
    // w:anchorlock only works with its namespace bound on the shape.
    expect(button).toContain('xmlns:w="urn:schemas-microsoft-com:office:word"');
    expect(button.match(/href="https:\/\/x\.test\/a"/g)).toHaveLength(2);
  });
});

describe("emailShell", () => {
  const html = emailShell({
    baseUrl: BASE,
    title: "A <title>",
    preheader: "Preview <line>",
    body: "<p>BODY</p>",
    footer: "FOOTER",
  });

  it("is a complete document with the brand mark from the canonical origin", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain('src="https://licensemeter.com/brand-mark.png"');
    expect(html).toContain("<p>BODY</p>");
    expect(html).toContain("FOOTER");
  });

  it("escapes the title and the preview line", () => {
    expect(html).not.toContain("<title>A <title>");
    expect(html).toContain("A &lt;title&gt;");
    expect(html).toContain("Preview &lt;line&gt;");
  });

  it("omits the preview block when there is no preview line", () => {
    const bare = emailShell({
      baseUrl: BASE,
      title: "t",
      body: "",
      footer: "",
    });
    expect(bare).not.toContain("mso-hide:all");
  });
});

describe("emailAddressText", () => {
  it("gives an address an anchor of our own, in the surrounding type", () => {
    const html = emailAddressText("Disabled account: jan.meier@contoso.com");
    expect(html).toContain('href="mailto:jan.meier@contoso.com"');
    expect(html).toContain("color:inherit");
    expect(html).toContain("text-decoration:none");
    expect(html).toContain("Disabled account: ");
  });

  it("leaves text without an address alone", () => {
    expect(emailAddressText("Copilot seat unused: Anna Schmidt")).toBe(
      "Copilot seat unused: Anna Schmidt",
    );
  });

  it("wraps every address in the text", () => {
    const html = emailAddressText("a@x.com and b@y.co.uk");
    expect(html.match(/href="mailto:/g)).toHaveLength(2);
    expect(html).toContain('href="mailto:b@y.co.uk"');
  });

  it("keeps an apostrophe in the local part inside the link", () => {
    const html = emailAddressText("Disabled: o'connor@contoso.com");
    expect(html).toContain("mailto:o&#39;connor@contoso.com");
    expect(html).toContain(">o&#39;connor@contoso.com</a>");
    // Escaping first would have linked only what follows the entity.
    expect(html).not.toContain("mailto:connor@contoso.com");
  });

  it("escapes the text before linking, so markup cannot get in", () => {
    const html = emailAddressText('<img src=x> evil"@contoso.com');
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
});

describe("emailRows", () => {
  it("leaves the last row without a rule, so a following rule is not doubled", () => {
    const rows = emailRows([
      { label: "First", value: "1" },
      { label: "Last", value: "2" },
    ]);
    expect(rows.match(/border-bottom/g)).toHaveLength(2);
    expect(rows.slice(rows.indexOf("Last"))).not.toContain("border-bottom");
  });

  it("links an address in a row label", () => {
    expect(emailRows([{ label: "Seat: a@b.com", value: "1" }])).toContain(
      'href="mailto:a@b.com"',
    );
  });
});

describe("client hints", () => {
  const html = emailShell({ baseUrl: BASE, title: "t", body: "", footer: "" });

  it("asks clients not to detect addresses, and neutralises Apple's", () => {
    expect(html).toContain('name="format-detection"');
    expect(html).toContain("a[x-apple-data-detectors]");
  });
});

describe("emailAmount", () => {
  it("keeps a figure and the unit after it on one line", () => {
    // fmtMoney already binds the number to the symbol; the "/mo" a template
    // appends is the part a client would otherwise break.
    expect(emailAmount("97,80 €/mo")).toContain("white-space:nowrap");
  });

  it("escapes the text it is given", () => {
    expect(emailAmount("<b>1</b>/mo")).not.toContain("<b>");
  });
});

describe("emailWaste", () => {
  it("does not let a money figure break across lines", () => {
    expect(emailWaste("97,80 €/mo")).toContain("white-space:nowrap");
  });
});
