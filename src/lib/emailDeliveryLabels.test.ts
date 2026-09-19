import { describe, expect, it } from "vitest";

import { deliveryLabel } from "~/lib/emailDeliveryLabels";

describe("deliveryLabel", () => {
  it("falls back to our own send attempt without a provider report", () => {
    expect(deliveryLabel({ status: "sent", deliveryStatus: null })).toBe(
      "Sent",
    );
    expect(deliveryLabel({ status: "failed", deliveryStatus: null })).toBe(
      "Not sent",
    );
    expect(deliveryLabel({ status: "claimed", deliveryStatus: null })).toBe(
      "Sending",
    );
  });

  it("lets the provider's report win", () => {
    expect(deliveryLabel({ status: "sent", deliveryStatus: "bounced" })).toBe(
      "Bounced",
    );
    // A webhook can get here before the row is marked sent.
    expect(
      deliveryLabel({ status: "claimed", deliveryStatus: "delivered" }),
    ).toBe("Delivered");
  });
});
