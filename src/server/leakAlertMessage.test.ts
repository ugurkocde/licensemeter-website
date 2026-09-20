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

  it("frames a requested summary without claiming a sync ran", () => {
    const asked = leakAlertMessage(tenant, rows, { requested: true });

    expect(asked.subject).toContain("12 potential license leaks open in");
    expect(asked.html).toContain("You asked for this summary of 12 open");
    expect(asked.html).not.toContain("The latest sync detected");
    expect(asked.html).not.toContain("Newly detected findings");
    expect(asked.html).toContain("These findings are open right now");
    expect(asked.html).toContain("No email setting was changed.");
    expect(asked.html).not.toContain("Turn these off in");
  });

  it("changes the framing and nothing else", () => {
    // Without the flag the message is the alert, byte for byte.
    expect(leakAlertMessage(tenant, rows, {})).toEqual({ subject, html });

    const asked = leakAlertMessage(tenant, rows, { requested: true });
    expect({
      subject: asked.subject.replace(" open in ", " detected in "),
      html: asked.html
        .replace(
          "You asked for this summary of 12 open findings involving",
          "The latest sync detected 12 findings involving",
        )
        .replace(
          "These findings are open right now and may have existed for months.",
          "Newly detected findings may reflect existing issues, especially on a first\nscan.",
        )
        .replace(
          "An admin of this workspace asked for this email in",
          "Immediate alert for new offboarding leaks. Turn these off in",
        )
        .replace(". No email setting was changed.", "."),
    }).toEqual({ subject, html });
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
