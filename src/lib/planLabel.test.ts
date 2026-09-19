import { describe, expect, it } from "vitest";

import {
  FEATURES,
  PLAN_FEATURES,
  type Entitlement,
  type EntitlementState,
  type Plan,
} from "~/server/entitlement";
import { planBadge, planName } from "./planLabel";

// Midday UTC so the formatted day is the same in every timezone.
const END = new Date("2026-10-02T12:00:00Z");

const entitlement = (
  plan: Plan,
  state: EntitlementState,
  currentPeriodEnd: Date | null = null,
): Entitlement => ({
  plan,
  state,
  source: null,
  features: Object.fromEntries(
    FEATURES.map((f) => [f, PLAN_FEATURES[plan].includes(f)]),
  ) as Entitlement["features"],
  currentPeriodEnd,
});

describe("planName", () => {
  it("names every plan", () => {
    expect(planName("free")).toBe("Free");
    expect(planName("pro")).toBe("Pro");
    expect(planName("msp")).toBe("MSP");
  });
});

describe("planBadge", () => {
  it("shows nothing for self-hosted installs and the demo workspace", () => {
    expect(planBadge(entitlement("msp", "selfHosted"))).toBeNull();
    expect(planBadge(entitlement("msp", "demo"))).toBeNull();
  });

  it("shows the plan alone for free, active and comped", () => {
    expect(planBadge(entitlement("free", "free"))).toEqual({
      label: "Free",
      tone: "outline",
    });
    expect(planBadge(entitlement("pro", "active", END))).toEqual({
      label: "Pro",
      tone: "brand",
    });
    expect(planBadge(entitlement("msp", "comped"))).toEqual({
      label: "MSP",
      tone: "brand",
    });
  });

  it("marks a trial, with the end date when known", () => {
    expect(planBadge(entitlement("pro", "trialing", END))).toEqual({
      label: "Pro",
      detail: "Trial until 02 Oct 2026",
      tone: "brand",
    });
    expect(planBadge(entitlement("pro", "trialing"))?.detail).toBe("Trial");
  });

  it("says when a canceled plan ends", () => {
    expect(planBadge(entitlement("msp", "canceling", END))).toEqual({
      label: "MSP",
      detail: "Ends 02 Oct 2026",
      tone: "gold",
    });
    expect(planBadge(entitlement("msp", "canceling"))?.detail).toBe(
      "Ends with the current period",
    );
  });

  it("flags a payment that is due", () => {
    expect(planBadge(entitlement("pro", "pastDue", END))).toEqual({
      label: "Pro",
      detail: "Payment due",
      tone: "danger",
    });
  });

  it("explains a workspace beyond the MSP quantity", () => {
    expect(planBadge(entitlement("free", "overQuantity", END))).toEqual({
      label: "Free",
      detail: "Not covered by your MSP plan",
      tone: "gold",
    });
  });

  it("formats the date for an explicit locale", () => {
    expect(
      planBadge(entitlement("pro", "canceling", END), "de-DE")?.detail,
    ).toBe("Ends 02. Okt. 2026");
  });
});
