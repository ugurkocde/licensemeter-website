import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * The Monthly / Yearly switch hides one purchase button and shows the other.
 * That only works while the button class itself carries no `hidden`: the button
 * class sets `inline-flex`, and Tailwind emits `.inline-flex` after `.hidden`,
 * so a `hidden` on the anchor loses and both buttons stay visible. The toggle
 * therefore lives on a wrapper span, and these assertions pin that down.
 */

vi.mock("~/env", () => ({
  marketplaceOfferUrl: () => null,
  polarEnabled: () => true,
  signInEnabled: () => true,
  signInPath: () => "/sign-in",
}));

vi.mock("next/link", async () => {
  const { createElement: h } = await import("react");
  return {
    default: ({ href, children }: { href: string; children?: unknown }) =>
      h("a", { href }, children as never),
  };
});

vi.mock("~/lib/planLabel", () => ({
  planName: (plan: string) =>
    ({ free: "Free", pro: "Pro", msp: "MSP" })[plan] ?? plan,
}));

const { PricingView } = await import("./PricingView");

const html = renderToStaticMarkup(createElement(PricingView, { lang: "en" }));

const cardButtons = [
  ...html.matchAll(
    /<span class="([^"]*)"><a\b[^>]*href="([^"]*)"[^>]*>Pay by card with Polar<\/a><\/span>/g,
  ),
].map(([, wrapper = "", href = ""]) => ({ wrapper, href }));

describe("pricing purchase buttons", () => {
  it("offers one card button per interval, each buying that interval", () => {
    expect(cardButtons).toHaveLength(4);
    expect(cardButtons.filter((b) => b.href.endsWith("month"))).toHaveLength(2);
    expect(cardButtons.filter((b) => b.href.endsWith("year"))).toHaveLength(2);
  });

  it("hides the yearly button by default on the wrapper, never on the anchor", () => {
    const anchors = html.match(/<a[^>]*>Pay by card with Polar<\/a>/g) ?? [];
    expect(anchors).toHaveLength(4);
    for (const anchor of anchors) expect(anchor).not.toContain("hidden");

    for (const { href, wrapper } of cardButtons) {
      expect(wrapper).not.toContain("inline-flex");
      if (href.endsWith("year")) {
        expect(wrapper.split(" ")).toContain("hidden");
        expect(wrapper).toContain("group-has-[#bill-y:checked]/pricing:block");
      } else {
        expect(wrapper.split(" ")).not.toContain("hidden");
        expect(wrapper).toContain("group-has-[#bill-y:checked]/pricing:hidden");
      }
    }
  });
});
