import { expect, it } from "vitest";
import { sameRenewalVendor } from "./renewalVendor";

it.each([" Microsoft ", "MICROSOFT 365", "Office 365", "m365", "O365"])(
  "matches Microsoft renewals labelled %s",
  (vendor) => expect(sameRenewalVendor("Microsoft", vendor)).toBe(true),
);

it("keeps other vendors distinct and compares them case-insensitively", () => {
  expect(sameRenewalVendor("Adobe", " aDObe ")).toBe(true);
  expect(sameRenewalVendor("Adobe", "Microsoft 365")).toBe(false);
});
