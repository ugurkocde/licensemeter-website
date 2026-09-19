import { describe, expect, it } from "vitest";

import { FEATURES, PLAN_FEATURES } from "~/server/entitlement";

import {
  billingHref,
  coverageSummary,
  isRunning,
  parseBillingParams,
  planCardLines,
  planDateLine,
} from "./billingView";

const END = new Date("2026-10-01T00:00:00Z");

describe("parseBillingParams", () => {
  it("defaults to monthly with nothing else set", () => {
    expect(parseBillingParams({})).toEqual({
      interval: "month",
      feature: null,
      notice: null,
    });
  });

  it("accepts every known feature and nothing else", () => {
    for (const feature of FEATURES) {
      expect(parseBillingParams({ feature }).feature).toBe(feature);
    }
    for (const feature of ["", "admin", "__proto__", "<script>", "MCP"]) {
      expect(parseBillingParams({ feature }).feature).toBeNull();
    }
  });

  it("falls back to monthly for an unknown interval", () => {
    expect(parseBillingParams({ interval: "year" }).interval).toBe("year");
    expect(parseBillingParams({ interval: "decade" }).interval).toBe("month");
    expect(parseBillingParams({ interval: ["year", "month"] }).interval).toBe(
      "year",
    );
  });

  it("only confirms on the exact return values", () => {
    expect(parseBillingParams({ checkout: "success" }).notice).toBe("checkout");
    expect(parseBillingParams({ marketplace: "activated" }).notice).toBe(
      "marketplace",
    );
    expect(parseBillingParams({ checkout: "failed" }).notice).toBeNull();
    expect(parseBillingParams({ marketplace: "1" }).notice).toBeNull();
  });
});

describe("billingHref", () => {
  it("keeps the feature and leaves the default interval out", () => {
    expect(billingHref("month", null)).toBe("/app/billing");
    expect(billingHref("year", null)).toBe("/app/billing?interval=year");
    expect(billingHref("month", "mcp")).toBe("/app/billing?feature=mcp");
    expect(billingHref("year", "mcp")).toBe(
      "/app/billing?interval=year&feature=mcp",
    );
  });
});

describe("planDateLine", () => {
  it("says what the date means for each state", () => {
    const line = (state: Parameters<typeof planDateLine>[0]["state"]) =>
      planDateLine({ state, currentPeriodEnd: END });
    expect(line("trialing")).toBe("Trial ends 01 Oct 2026");
    expect(line("active")).toBe("Renews 01 Oct 2026");
    expect(line("canceling")).toBe("Ends 01 Oct 2026");
    expect(line("comped")).toBe("Until 01 Oct 2026");
    expect(line("free")).toBeNull();
    expect(line("overQuantity")).toBeNull();
  });

  it("copes with a provider that reported no date", () => {
    const line = (state: Parameters<typeof planDateLine>[0]["state"]) =>
      planDateLine({ state, currentPeriodEnd: null });
    expect(line("trialing")).toBe("In trial");
    expect(line("active")).toBeNull();
    expect(line("canceling")).toBe("Ends with the current period");
    expect(line("comped")).toBeNull();
  });
});

describe("isRunning", () => {
  it("is true only while a provider subscription exists", () => {
    expect(
      (["trialing", "active", "pastDue", "canceling"] as const).every(
        isRunning,
      ),
    ).toBe(true);
    expect(
      (["free", "demo", "selfHosted", "comped", "overQuantity"] as const).some(
        isRunning,
      ),
    ).toBe(false);
  });
});

describe("planCardLines", () => {
  it("lists every Pro feature on the Pro card", () => {
    const lines = planCardLines("pro", "month");
    expect(lines.filter((l) => l.comingSoon)).toEqual([]);
    expect(lines.length).toBe(3 + PLAN_FEATURES.pro.length);
    expect(lines.map((l) => l.text)).toContain("Support by email");
  });

  it("marks the unbuilt MSP features as coming soon", () => {
    const lines = planCardLines("msp", "month");
    expect(lines.filter((l) => l.comingSoon).map((l) => l.text)).toEqual([
      "Portfolio alerts",
      "MSP team",
    ]);
    expect(lines.map((l) => l.text)).toContain("White-label reports");
  });

  it("prices further tenants in the chosen interval", () => {
    const text = (interval: "month" | "year") =>
      planCardLines("msp", interval)
        .map((l) => l.text)
        .join("\n");
    expect(text("month")).toContain(
      "10 client tenants included, each further tenant EUR 25 per month",
    );
    expect(text("year")).toContain("each further tenant EUR 250 per year");
  });

  it("never uses wording the plans do not promise", () => {
    const all = (["pro", "msp"] as const)
      .flatMap((p) => planCardLines(p, "month"))
      .map((l) => l.text)
      .join("\n");
    expect(all).not.toMatch(/priority support|SLA|service credits|Azure/i);
  });
});

describe("coverageSummary", () => {
  it("reads N of M covered", () => {
    expect(coverageSummary(3, 10)).toBe("3 of 10 covered");
  });
});
