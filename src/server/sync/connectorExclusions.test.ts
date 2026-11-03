import { describe, expect, it } from "vitest";

import { connectorSeatExclusion } from "./connectorExclusions";
import { directoryIdentitiesOf } from "./join";

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
  const excluded = connectorSeatExclusion(
    ["svc-*", "room_*"],
    directory,
    directoryIdentitiesOf(directory),
  );

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

  it("excludes nothing without patterns", () => {
    expect(
      connectorSeatExclusion(
        [],
        directory,
        directoryIdentitiesOf(directory),
      )({
        email: "svc-backup@contoso.com",
      }),
    ).toBe(false);
  });
});
