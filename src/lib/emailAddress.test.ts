import { describe, expect, it } from "vitest";

import { isValidEmailAddress } from "./emailAddress";

describe("isValidEmailAddress", () => {
  it("accepts ordinary real-world addresses", () => {
    for (const address of [
      "a@b.co",
      "first.last+tag@sub.example.com",
      "o'brien@example.co.uk",
      "user_name@example-host.example",
    ]) {
      expect(isValidEmailAddress(address), address).toBe(true);
    }
  });

  it("rejects markup and malformed addresses", () => {
    for (const address of [
      "<!channel>@example.com",
      "<https://evil.example|LicenseMeter>@example.com",
      "a<b@example.com",
      "a b@example.com",
      "a@@b.com",
      "a@b",
      "@b.com",
      "a@.com",
      "a@b..com",
      "",
    ]) {
      expect(isValidEmailAddress(address), address).toBe(false);
    }
  });

  it("rejects addresses longer than 254 characters", () => {
    expect(isValidEmailAddress(`${"a".repeat(250)}@example.com`)).toBe(false);
  });
});
