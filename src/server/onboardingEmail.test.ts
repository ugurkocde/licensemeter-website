import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ONBOARDING_DOC_PATHS,
  ONBOARDING_SUBJECT,
  greetingName,
  onboardingHtml,
} from "~/server/onboardingEmail";

const ARGS = {
  email: "anna@contoso.com",
  name: "Anna Schmidt",
  baseUrl: "https://licensemeter.com",
};

describe("greetingName", () => {
  it("takes the first word of a plain personal name", () => {
    expect(greetingName("Anna Schmidt")).toBe("Anna");
    expect(greetingName("  Uğur Koç ")).toBe("Uğur");
    expect(greetingName("Anne-Marie O'Neill")).toBe("Anne-Marie");
  });

  it("refuses names that do not safely yield a first name", () => {
    expect(greetingName(null)).toBeNull();
    expect(greetingName("")).toBeNull();
    expect(greetingName("Schmidt, Anna")).toBeNull();
    expect(greetingName("Anna Schmidt (Admin)")).toBeNull();
    expect(greetingName("anna@contoso.com")).toBeNull();
    expect(greetingName("Helpdesk")).toBeNull();
    expect(greetingName("IT Helpdesk")).toBeNull();
    expect(greetingName("anna schmidt")).toBeNull();
    expect(greetingName("A Schmidt")).toBeNull();
  });

  it("refuses shared, role and service accounts", () => {
    expect(greetingName("Sales Team")).toBeNull();
    expect(greetingName("Front Desk")).toBeNull();
    expect(greetingName("System Administrator")).toBeNull();
    expect(greetingName("Contoso Support")).toBeNull();
    expect(greetingName("Anna Admin")).toBeNull();
  });
});

describe("onboardingHtml", () => {
  it("greets by first name and falls back to a neutral opening", () => {
    expect(onboardingHtml(ARGS)).toContain("Hi Anna, the three steps");
    const neutral = onboardingHtml({ ...ARGS, name: "Schmidt, Anna" });
    expect(neutral).not.toContain("Hi ");
    expect(neutral).toContain("The three steps below");
  });

  it("opens the workspace through sign-in on the canonical origin", () => {
    const html = onboardingHtml(ARGS);
    expect(html).toContain(
      'href="https://licensemeter.com/sign-in?returnTo=%2Fapp&amp;utm_source=',
    );
    expect(html).toContain('src="https://licensemeter.com/brand-mark.png"');
  });

  it("links every documentation article", () => {
    const html = onboardingHtml(ARGS);
    for (const path of ONBOARDING_DOC_PATHS) {
      expect(html).toContain(`href="https://docs.licensemeter.com/${path}"`);
    }
  });

  it("escapes the recipient address and the name", () => {
    const html = onboardingHtml({
      ...ARGS,
      email: 'a"><script>@contoso.com',
      name: "Ann<b> Schmidt",
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("Ann<b>");
  });

  it("promises nothing about price and stays read-only in tone", () => {
    const html = onboardingHtml(ARGS);
    expect(html).not.toMatch(/free to use|no paid tiers/i);
    expect(html).toContain("Read-only, always");
  });

  it("uses no em or en dashes", () => {
    const dashes = [0x2013, 0x2014].map((c) => String.fromCharCode(c));
    const text = onboardingHtml(ARGS) + ONBOARDING_SUBJECT;
    for (const dash of dashes) expect(text).not.toContain(dash);
  });
});

describe("documentation links", () => {
  // The docs site is published from docs/gitbook, so a path the email links
  // must exist there as a page or a section README.
  it("all point at a page in docs/gitbook", () => {
    const root = join(process.cwd(), "docs", "gitbook");
    for (const path of ONBOARDING_DOC_PATHS) {
      const found =
        existsSync(join(root, `${path}.md`)) ||
        existsSync(join(root, path, "README.md"));
      expect(found, `docs/gitbook has no page for ${path}`).toBe(true);
    }
  });
});
