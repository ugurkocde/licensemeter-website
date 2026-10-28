import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/app",
}));

import { NavLinks } from "./NavLinks";
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
