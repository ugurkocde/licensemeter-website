import { describe, expect, it } from "vitest";

import {
  makeBillingUnsubToken,
  verifyBillingUnsubToken,
} from "~/server/billingUnsubToken";
import { makeUnsubToken } from "~/server/unsubToken";

const SECRET = "test-secret-at-least-32-characters-long";
const TENANT = "b51b28ff-02a9-4643-a0b2-a1d6669c2d8c";

describe("billing unsubscribe tokens", () => {
  it("round-trips for the same tenant and secret", () => {
    const token = makeBillingUnsubToken(TENANT, SECRET);
    expect(verifyBillingUnsubToken(TENANT, token, SECRET)).toBe(true);
  });

  it("rejects a tampered or empty token", () => {
    const token = makeBillingUnsubToken(TENANT, SECRET);
    const flipped = (token.startsWith("A") ? "B" : "A") + token.slice(1);
    expect(verifyBillingUnsubToken(TENANT, flipped, SECRET)).toBe(false);
    expect(verifyBillingUnsubToken(TENANT, "", SECRET)).toBe(false);
  });

  it("does not transfer between tenants or secrets", () => {
    const token = makeBillingUnsubToken(TENANT, SECRET);
    expect(verifyBillingUnsubToken("other-tenant", token, SECRET)).toBe(false);
    expect(
      verifyBillingUnsubToken(TENANT, token, "another-secret-32-characters-long!"),
    ).toBe(false);
  });

  it("is domain-separated from the marketing unsubscribe token", () => {
    // A marketing token for the same string must not validate as a billing
    // token (different HKDF context).
    const marketing = makeUnsubToken(TENANT, SECRET);
    expect(verifyBillingUnsubToken(TENANT, marketing, SECRET)).toBe(false);
  });
});
