import { describe, expect, it } from "vitest";

import {
  MSP_EXTRA_TENANT_PRICE,
  MSP_INCLUDED_TENANTS,
  PLAN_PRICES,
  extraTenantPriceLabel,
  formatPrice,
  isBillingInterval,
  mspPriceFor,
  planPriceLabel,
  yearlySaving,
} from "./pricing";

describe("pricing", () => {
  it("holds the decided prices", () => {
    expect(PLAN_PRICES).toEqual({
      pro: { month: 99, year: 990 },
      msp: { month: 299, year: 2990 },
    });
    expect(MSP_INCLUDED_TENANTS).toBe(10);
    expect(MSP_EXTRA_TENANT_PRICE).toEqual({ month: 25, year: 250 });
  });

  it("formats with the currency code and comma grouping", () => {
    expect(formatPrice(99)).toBe("EUR 99");
    expect(formatPrice(990)).toBe("EUR 990");
    expect(formatPrice(2990)).toBe("EUR 2,990");
    expect(formatPrice(1234567)).toBe("EUR 1,234,567");
  });

  it("labels a plan price with its interval", () => {
    expect(planPriceLabel("pro", "month")).toBe("EUR 99 per month");
    expect(planPriceLabel("msp", "year")).toBe("EUR 2,990 per year");
    expect(extraTenantPriceLabel("month")).toBe("EUR 25 per month");
    expect(extraTenantPriceLabel("year")).toBe("EUR 250 per year");
  });

  it("prices a year at ten months", () => {
    expect(yearlySaving("pro")).toBe(198);
    expect(yearlySaving("msp")).toBe(598);
  });

  it("charges extra tenants only beyond the included ones", () => {
    expect(mspPriceFor(0, "month")).toBe(299);
    expect(mspPriceFor(10, "month")).toBe(299);
    expect(mspPriceFor(11, "month")).toBe(324);
    expect(mspPriceFor(14, "year")).toBe(3990);
    expect(mspPriceFor(-3, "year")).toBe(2990);
  });

  it("accepts only the two intervals", () => {
    expect(isBillingInterval("month")).toBe(true);
    expect(isBillingInterval("year")).toBe(true);
    expect(isBillingInterval("week")).toBe(false);
    expect(isBillingInterval(undefined)).toBe(false);
  });
});
