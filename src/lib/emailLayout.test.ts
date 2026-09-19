import { describe, expect, it } from "vitest";

import {
  emailAppLink,
  emailAppUrl,
  emailButton,
  emailRows,
  emailShell,
  emailStrong,
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
