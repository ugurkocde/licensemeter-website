import { describe, expect, it } from "vitest";

import { connectorSeatExclusion } from "./connectorExclusions";

const directory = [
  { graphId: "u-svc", upn: "svc-backup@contoso.com", displayName: "Backup" },
  { graphId: "u-room", upn: "board@contoso.com", displayName: "Room_Board" },
  { graphId: "u-alex", upn: "alex@contoso.com", displayName: "Alex" },
];
const identities = [
  ...directory.map((u) => ({ ...u, accountEnabled: false })),
  // Mail alias of the service account.
  {
    graphId: "u-svc",
    upn: "backup@contoso.com",
    displayName: "Backup",
    accountEnabled: false,
  },
];

describe("connectorSeatExclusion", () => {
  const excluded = connectorSeatExclusion(
    ["svc-*", "room_*"],
    directory,
    identities,
  );

  it("excludes seats of excluded directory users, aliases included", () => {
    expect(excluded({ email: "SVC-backup@contoso.com" })).toBe(true);
    expect(excluded({ email: "backup@contoso.com" })).toBe(true);
    expect(excluded({ email: "board@contoso.com" })).toBe(true);
  });

  it("matches the seat's own email or display name", () => {
    expect(excluded({ email: "svc-outside@fabrikam.com" })).toBe(true);
    expect(
      excluded({ email: "front@fabrikam.com", displayName: "Room_Front" }),
    ).toBe(true);
  });

  it("keeps everyone else", () => {
    expect(excluded({ email: "alex@contoso.com", displayName: "Alex" })).toBe(
      false,
    );
    expect(
      connectorSeatExclusion(
        [],
        directory,
        identities,
      )({ email: "svc-1@contoso.com" }),
    ).toBe(false);
  });
});
