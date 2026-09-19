import { describe, expect, it, vi } from "vitest";

vi.mock("~/env", () => ({
  env: {},
  siteUrl: () => "https://licensemeter.com",
}));

const { leakAlertMessage } = await import("~/server/leakAlertMessage");

const tenant = { name: "Contoso", tid: null, currency: "EUR" };

describe("leakAlertMessage", () => {
  const rows = Array.from({ length: 12 }, (_, index) => ({
    title: `Seat ${String(index).padStart(2, "0")}`,
    monthlyImpactCents: index === 0 ? 0 : index * 100,
  }));
  const { subject, html } = leakAlertMessage(tenant, rows);

  it("puts the same count and total in the subject and the body", () => {
    expect(subject).toContain("12 potential license leaks");
    expect(subject).toContain("Contoso");
    expect(html).toContain("detected 12 findings");
  });

  it("lists the ten most expensive findings, highest first", () => {
    expect(html).toContain("Seat 11");
    expect(html).toContain("Seat 02");
    // The two cheapest, one of them free, are summarized rather than listed.
    expect(html).not.toContain("Seat 00");
    expect(html).not.toContain("Seat 01");
    expect(html.indexOf("Seat 11")).toBeLessThan(html.indexOf("Seat 02"));
    expect(html).toContain("10 displayed findings");
    expect(html).toContain("2 additional findings");
  });

  it("explains a finding that adds nothing to the estimate", () => {
    expect(html).toContain("1 finding currently contributes zero");
    expect(html).toContain("Check the price book");
  });

  it("leaves the optional lines out when they do not apply", () => {
    const small = leakAlertMessage(tenant, [
      { title: "Only seat", monthlyImpactCents: 900 },
    ]);
    expect(small.subject).toContain("1 potential license leak detected");
    expect(small.html).toContain("detected 1 finding involving");
    expect(small.html).toContain("1 displayed finding:");
    expect(small.html).not.toContain("additional finding");
    expect(small.html).not.toContain("contribute");
  });
});
