import { describe, expect, it } from "vitest";

import {
  choiceOf,
  isSkuTermChoice,
  renewalAlertsApply,
  settingOf,
  SKU_TERM_CHOICES,
} from "./renewalTerm";

describe("renewalAlertsApply", () => {
  it("covers annual and multi-year terms by default", () => {
    expect(renewalAlertsApply(undefined)).toBe(true);
    expect(renewalAlertsApply({ term: "annual", monthlyAlerts: false })).toBe(
      true,
    );
  });

  it("leaves monthly NCE terms out unless opted in per SKU", () => {
    expect(renewalAlertsApply({ term: "monthly", monthlyAlerts: false })).toBe(
      false,
    );
    expect(renewalAlertsApply({ term: "monthly", monthlyAlerts: true })).toBe(
      true,
    );
  });
});

describe("term choices", () => {
  it("round-trips every choice through the stored setting", () => {
    for (const choice of SKU_TERM_CHOICES) {
      expect(choiceOf(settingOf(choice))).toBe(choice);
    }
    expect(choiceOf(undefined)).toBe("annual");
    // An opt-in left on an annual term has no effect on the choice.
    expect(choiceOf({ term: "annual", monthlyAlerts: true })).toBe("annual");
  });

  it("accepts only the known choices", () => {
    expect(isSkuTermChoice("monthly_alerts")).toBe(true);
    expect(isSkuTermChoice("quarterly")).toBe(false);
    expect(isSkuTermChoice(1)).toBe(false);
  });
});
