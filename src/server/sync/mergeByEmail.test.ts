import { describe, expect, it } from "vitest";

import { mergeAdobeUsers, mergeSaasSeats } from "~/server/sync/mergeByEmail";
import { mapSalesforceRecords } from "~/server/saas/salesforce";

describe("mergeSaasSeats", () => {
  it("folds Salesforce users sharing an email into one seat row", () => {
    const seats = mergeSaasSeats(
      mapSalesforceRecords([
        {
          Email: "Anna.Admin@example.com",
          Name: "Anna Admin",
          LastLoginDate: "2026-01-10T08:00:00.000Z",
          Profile: { UserLicense: { Name: "Salesforce" } },
        },
        {
          Email: "anna.admin@example.com",
          Name: "Anna (integration)",
          LastLoginDate: "2026-03-02T08:00:00.000Z",
          Profile: { UserLicense: { Name: "Salesforce Platform" } },
        },
        {
          Email: "bob@example.com",
          Name: "Bob",
          LastLoginDate: null,
          Profile: { UserLicense: { Name: "Salesforce" } },
        },
      ]),
    );
    expect(seats).toHaveLength(2);
    expect(seats[0]).toEqual({
      email: "anna.admin@example.com",
      displayName: "Anna Admin",
      status: "active",
      products: ["Salesforce", "Salesforce Platform"],
      lastActiveAt: new Date("2026-03-02T08:00:00.000Z"),
    });
    expect(seats[1]!.email).toBe("bob@example.com");
  });

  it("keeps one product entry per account so seat counts stay intact", () => {
    const seats = mergeSaasSeats([
      {
        email: "a@example.com",
        displayName: null,
        status: "suspended",
        products: ["Pro"],
        lastActiveAt: null,
      },
      {
        email: "A@example.com",
        displayName: "A",
        status: "active",
        products: ["Pro"],
        lastActiveAt: null,
      },
    ]);
    expect(seats).toEqual([
      {
        email: "a@example.com",
        displayName: "A",
        status: "active",
        products: ["Pro", "Pro"],
        lastActiveAt: null,
      },
    ]);
  });
});

describe("mergeAdobeUsers", () => {
  it("unions product profiles for case-variant emails", () => {
    expect(
      mergeAdobeUsers([
        { email: "C@example.com", status: "active", products: ["CC"] },
        { email: "c@example.com", status: "active", products: ["CC", "PS"] },
      ]),
    ).toEqual([
      { email: "c@example.com", status: "active", products: ["CC", "PS"] },
    ]);
  });
});
