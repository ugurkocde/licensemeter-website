import { describe, expect, it } from "vitest";

import { connectorSeatExclusion } from "./connectorExclusions";

const directory = [
  {
    graphId: "u-svc",
    upn: "svc-backup@contoso.com",
    displayName: "Backup",
    accountEnabled: false,
    mailAliases: ["backup@contoso.com"],
  },
  {
    graphId: "u-room",
    upn: "board@contoso.com",
    displayName: "Room_Board",
    accountEnabled: true,
    mailAliases: [],
  },
  {
    graphId: "u-alex",
    upn: "alex@contoso.com",
    displayName: "Alex",
    accountEnabled: false,
    mailAliases: [],
  },
];

describe("connectorSeatExclusion", () => {
  const excluded = connectorSeatExclusion(["svc-*", "room_*"], directory);

  it("excludes seats of excluded directory users, aliases included", () => {
    expect(excluded({ email: "SVC-backup@contoso.com" })).toBe(true);
    expect(excluded({ email: "backup@contoso.com" })).toBe(true);
    expect(excluded({ email: "board@contoso.com" })).toBe(true);
  });

  it("never matches the seat's own email or vendor name", () => {
    // No directory user behind these seats: they keep their findings even
    // though the names look like excluded service or room accounts.
    expect(excluded({ email: "svc-outside@fabrikam.com" })).toBe(false);
    expect(
      excluded({ email: "front@fabrikam.com", displayName: "Room_Front" } as {
        email: string;
      }),
    ).toBe(false);
    expect(excluded({ email: "alex@contoso.com" })).toBe(false);
  });

  it("excludes a shared address only when every claimant is excluded", () => {
    const shared = [
      {
        graphId: "u-a",
        upn: "svc-a@contoso.com",
        displayName: "Service A",
        accountEnabled: true,
        mailAliases: ["b@contoso.com", "team@contoso.com"],
      },
      {
        graphId: "u-b",
        upn: "b@contoso.com",
        displayName: "B",
        accountEnabled: false,
        mailAliases: [],
      },
      {
        graphId: "u-c",
        upn: "svc-c@contoso.com",
        displayName: "Service C",
        accountEnabled: true,
        mailAliases: ["team@contoso.com"],
      },
    ];
    for (const rows of [shared, [...shared].reverse()]) {
      const check = connectorSeatExclusion(["svc-*"], rows);
      expect(check({ email: "b@contoso.com" })).toBe(false);
      expect(check({ email: "team@contoso.com" })).toBe(true);
    }
  });

  it("excludes nothing without patterns", () => {
    expect(
      connectorSeatExclusion(
        [],
        directory,
      )({
        email: "svc-backup@contoso.com",
      }),
    ).toBe(false);
  });
});
