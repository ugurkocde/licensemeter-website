import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ pathname: "/app" }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
}));

import { NAV_SHORTCUTS, NavLinks } from "./NavLinks";
import { entitlementOf, type Entitlement } from "~/server/entitlement";

const NOW = new Date("2026-09-18T12:00:00Z");
const FUTURE = new Date("2026-10-01T00:00:00Z");

const entitlement = (plan: "free" | "pro" | "msp"): Entitlement =>
  entitlementOf({
    tenant: { isDemo: false },
    record:
      plan === "free"
        ? null
        : {
            plan,
            source: "polar",
            status: "active",
            trialEnd: null,
            currentPeriodEnd: FUTURE,
            cancelAtPeriodEnd: false,
          },
    covered: true,
    billingEnabled: true,
    now: NOW,
  });

/** The opening tag of the anchor carrying this href, attributes included. */
const anchorOf = (html: string, href: string): string => {
  const at = html.indexOf(`href="${href}"`);
  expect(at).toBeGreaterThanOrEqual(0);
  return html.slice(html.lastIndexOf("<a", at), html.indexOf(">", at));
};

/** The markup of the Report branding sidebar item, link included. */
const brandingItem = (html: string): string => {
  const start = html.indexOf("/app/branding");
  const bare = html.indexOf('href="/app/billing?feature=whiteLabel"');
  const at = start >= 0 ? start : bare;
  expect(at).toBeGreaterThanOrEqual(0);
  return html.slice(Math.max(0, at - 6), at + 700);
};

describe("Report branding sidebar badge", () => {
  it("names Pro as the cheapest plan that includes it", () => {
    const html = renderToStaticMarkup(createElement(NavLinks));
    const item = brandingItem(html);
    expect(item).toContain("Report branding");
    expect(item).toContain("included in");
    expect(item).toContain(">Pro<");
    expect(item).not.toContain(">MSP<");
  });

  it("locks it for Free and opens it for Pro and MSP", () => {
    const free = brandingItem(
      renderToStaticMarkup(
        createElement(NavLinks, { entitlement: entitlement("free") }),
      ),
    );
    expect(free).toContain('href="/app/billing?feature=whiteLabel"');
    expect(free).toContain("requires");

    for (const plan of ["pro", "msp"] as const) {
      const item = brandingItem(
        renderToStaticMarkup(
          createElement(NavLinks, { entitlement: entitlement(plan) }),
        ),
      );
      expect(item).toContain('href="/app/branding"');
      expect(item).not.toContain("requires");
    }
  });
});

describe("Grouped sidebar navigation", () => {
  afterEach(() => {
    nav.pathname = "/app";
  });
  it("renders the section labels and all main destinations", () => {
    const html = renderToStaticMarkup(createElement(NavLinks));
    for (const text of ["Workspace", "Tools", "Manage"])
      expect(html).toContain(text);
    for (const href of [
      "/app/findings",
      "/app/licenses",
      "/app/connectors",
      "/app/settings",
    ])
      expect(html).toContain(`href="${href}"`);
  });

  it("filters by the search query and keeps matching child pages", () => {
    const html = renderToStaticMarkup(
      createElement(NavLinks, { query: "device" }),
    );
    expect(html).toContain("Software Metering");
    expect(html).toContain("Devices");
    expect(html).not.toContain("Plan and billing");

    const empty = renderToStaticMarkup(
      createElement(NavLinks, { query: "zzz" }),
    );
    expect(empty).toContain("No pages match");
  });

  it("keeps accessible names in the collapsed icon rail", () => {
    const html = renderToStaticMarkup(
      createElement(NavLinks, { collapsed: true }),
    );
    expect(html).toContain("Overview");
    expect(html).toContain("Connectors");
    /* Shortcut hints are visual only outside the expanded rail. */
    expect(html).not.toContain("⌘1");
  });

  it("marks the metering section current in the rail, its child page when expanded", () => {
    nav.pathname = "/app/metering/apps";
    const collapsed = renderToStaticMarkup(
      createElement(NavLinks, { collapsed: true }),
    );
    expect(anchorOf(collapsed, "/app/metering")).toContain(
      'aria-current="page"',
    );

    const expanded = renderToStaticMarkup(createElement(NavLinks));
    expect(anchorOf(expanded, "/app/metering")).not.toContain("aria-current");
    expect(anchorOf(expanded, "/app/metering/apps")).toContain(
      'aria-current="page"',
    );
  });

  it("opens docs in a new tab and keeps support inside the app", () => {
    nav.pathname = "/app/support";
    const html = renderToStaticMarkup(createElement(NavLinks));
    const docs = anchorOf(html, "https://docs.licensemeter.com/");
    expect(docs).toContain('target="_blank"');
    expect(docs).toContain('rel="noreferrer"');
    expect(html).toContain(", opens in a new tab");
    expect(anchorOf(html, "/app/support")).toContain('aria-current="page"');
    expect(html).not.toContain('href="/support"');
  });

  it("maps number shortcuts to the main pages", () => {
    expect(NAV_SHORTCUTS).toEqual({
      "1": "/app",
      "2": "/app/findings",
      "3": "/app/licenses",
      "4": "/app/renewals",
      "5": "/app/ai-costs",
    });
  });
});
