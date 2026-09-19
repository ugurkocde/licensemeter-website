import { describe, expect, it } from "vitest";

import {
  deliveryEvent,
  deliveryStatusForEvent,
  isPermanentFailure,
  shouldApplyDeliveryEvent,
} from "~/server/emailDeliveryPolicy";

const T1 = new Date("2026-09-14T06:00:00Z");
const T2 = new Date("2026-09-14T06:05:00Z");

describe("deliveryStatusForEvent", () => {
  it("maps the seven tracked Resend events", () => {
    expect(
      [
        "email.sent",
        "email.delivered",
        "email.delivery_delayed",
        "email.failed",
        "email.bounced",
        "email.suppressed",
        "email.complained",
      ].map(deliveryStatusForEvent),
    ).toEqual([
      "accepted",
      "delivered",
      "delayed",
      "failed",
      "bounced",
      "suppressed",
      "complained",
    ]);
  });

  it("returns null for events the ledger does not track", () => {
    expect(deliveryStatusForEvent("email.opened")).toBeNull();
    expect(deliveryStatusForEvent("email.clicked")).toBeNull();
    expect(deliveryStatusForEvent("contact.created")).toBeNull();
    // Not a lookup into Object.prototype.
    expect(deliveryStatusForEvent("constructor")).toBeNull();
    expect(deliveryStatusForEvent("")).toBeNull();
  });
});

describe("isPermanentFailure", () => {
  it("is true for bounced, suppressed and complained only", () => {
    expect(
      (
        [
          "accepted",
          "delivered",
          "delayed",
          "failed",
          "bounced",
          "suppressed",
          "complained",
        ] as const
      ).filter(isPermanentFailure),
    ).toEqual(["bounced", "suppressed", "complained"]);
  });
});

describe("shouldApplyDeliveryEvent", () => {
  it("applies the first event a row ever gets", () => {
    expect(shouldApplyDeliveryEvent(null, null, "accepted", T1)).toBe(true);
    expect(shouldApplyDeliveryEvent(null, null, "bounced", T1)).toBe(true);
  });

  it("moves forward with newer events", () => {
    expect(shouldApplyDeliveryEvent("accepted", T1, "delivered", T2)).toBe(
      true,
    );
    expect(shouldApplyDeliveryEvent("delayed", T1, "delivered", T2)).toBe(true);
    expect(shouldApplyDeliveryEvent("delivered", T1, "bounced", T2)).toBe(true);
  });

  it("changes nothing for a repeated event", () => {
    for (const status of ["accepted", "delivered", "bounced"] as const) {
      expect(shouldApplyDeliveryEvent(status, T1, status, T1)).toBe(false);
    }
  });

  it("ignores an older event of the same kind", () => {
    expect(shouldApplyDeliveryEvent("delivered", T2, "delayed", T1)).toBe(
      false,
    );
    expect(shouldApplyDeliveryEvent("complained", T2, "bounced", T1)).toBe(
      false,
    );
  });

  it("lets the status that is further along win at the same instant", () => {
    expect(shouldApplyDeliveryEvent("accepted", T1, "delivered", T1)).toBe(
      true,
    );
    expect(shouldApplyDeliveryEvent("delivered", T1, "accepted", T1)).toBe(
      false,
    );
  });

  it("never lets accepted replace a status that is further along", () => {
    expect(shouldApplyDeliveryEvent("delivered", T1, "accepted", T2)).toBe(
      false,
    );
    expect(shouldApplyDeliveryEvent("delayed", T1, "accepted", T2)).toBe(false);
  });

  it("never replaces a permanent failure with anything milder, however late", () => {
    for (const previous of ["bounced", "suppressed", "complained"] as const) {
      for (const next of [
        "accepted",
        "delivered",
        "delayed",
        "failed",
      ] as const) {
        expect(shouldApplyDeliveryEvent(previous, T1, next, T2)).toBe(false);
      }
    }
  });

  it("lets a permanent failure win even when its timestamp is older", () => {
    expect(shouldApplyDeliveryEvent("delivered", T2, "bounced", T1)).toBe(true);
  });
});

describe("deliveryEvent", () => {
  const valid = {
    type: "email.delivered",
    created_at: "2026-09-14T06:00:00.000Z",
    data: {
      email_id: "re_1",
      to: ["anna@contoso.test"],
      tags: { lm_delivery: "x" },
      subject: "extra fields are fine",
    },
  };

  it("accepts a Resend payload, with or without tags", () => {
    expect(deliveryEvent.safeParse(valid).success).toBe(true);
    const data = { ...valid.data, tags: undefined };
    expect(deliveryEvent.safeParse({ ...valid, data }).success).toBe(true);
  });

  it("rejects payloads the ledger cannot use", () => {
    for (const bad of [
      null,
      "text",
      {},
      { ...valid, created_at: "yesterday" },
      { ...valid, data: { ...valid.data, email_id: "" } },
      { ...valid, data: { ...valid.data, to: [] } },
      { ...valid, data: { ...valid.data, to: "anna@contoso.test" } },
    ]) {
      expect(deliveryEvent.safeParse(bad).success).toBe(false);
    }
  });
});
