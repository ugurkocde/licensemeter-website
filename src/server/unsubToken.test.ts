import { describe, expect, it } from "vitest";

import {
  isUnsubJob,
  makeMembershipUnsubToken,
  makeUnsubToken,
  verifyMembershipUnsubToken,
  verifyUnsubToken,
} from "~/server/unsubToken";

const SECRET = "test-secret-at-least-32-characters-long";

describe("unsubscribe tokens", () => {
  it("round-trips for the same email and secret", () => {
    const token = makeUnsubToken("user@example.com", SECRET);
    expect(verifyUnsubToken("user@example.com", token, SECRET)).toBe(true);
  });

  it("normalizes case and whitespace like the capture action", () => {
    const token = makeUnsubToken("  User@Example.COM ", SECRET);
    expect(verifyUnsubToken("user@example.com", token, SECRET)).toBe(true);
  });

  it("rejects a tampered token", () => {
    const token = makeUnsubToken("user@example.com", SECRET);
    const flipped = (token.startsWith("A") ? "B" : "A") + token.slice(1);
    expect(verifyUnsubToken("user@example.com", flipped, SECRET)).toBe(false);
    expect(verifyUnsubToken("user@example.com", "", SECRET)).toBe(false);
  });

  it("does not transfer between emails or secrets", () => {
    const token = makeUnsubToken("user@example.com", SECRET);
    expect(verifyUnsubToken("other@example.com", token, SECRET)).toBe(false);
    expect(
      verifyUnsubToken(
        "user@example.com",
        token,
        "another-secret-32-characters-long!",
      ),
    ).toBe(false);
  });
});

describe("membership unsubscribe tokens", () => {
  const MEMBERSHIP = "3f0c1a52-6f0e-4a57-9d46-0e1f2a3b4c5d";
  const OTHER = "7a1b2c3d-0000-4000-8000-000000000001";

  it("round-trips for the same membership, job and secret", () => {
    const token = makeMembershipUnsubToken(MEMBERSHIP, "digest", SECRET);
    expect(
      verifyMembershipUnsubToken(MEMBERSHIP, "digest", token, SECRET),
    ).toBe(true);
  });

  it("rejects a tampered or empty token", () => {
    const token = makeMembershipUnsubToken(MEMBERSHIP, "report", SECRET);
    const flipped = (token.startsWith("A") ? "B" : "A") + token.slice(1);
    expect(
      verifyMembershipUnsubToken(MEMBERSHIP, "report", flipped, SECRET),
    ).toBe(false);
    expect(verifyMembershipUnsubToken(MEMBERSHIP, "report", "", SECRET)).toBe(
      false,
    );
  });

  it("does not transfer to the other job", () => {
    const token = makeMembershipUnsubToken(MEMBERSHIP, "digest", SECRET);
    expect(
      verifyMembershipUnsubToken(MEMBERSHIP, "report", token, SECRET),
    ).toBe(false);
  });

  it("does not transfer between memberships or secrets", () => {
    const token = makeMembershipUnsubToken(MEMBERSHIP, "digest", SECRET);
    expect(verifyMembershipUnsubToken(OTHER, "digest", token, SECRET)).toBe(
      false,
    );
    expect(
      verifyMembershipUnsubToken(
        MEMBERSHIP,
        "digest",
        token,
        "another-secret-32-characters-long!",
      ),
    ).toBe(false);
  });

  it("is a different token kind than the email token", () => {
    const emailToken = makeUnsubToken(MEMBERSHIP, SECRET);
    expect(
      verifyMembershipUnsubToken(MEMBERSHIP, "digest", emailToken, SECRET),
    ).toBe(false);
    const memberToken = makeMembershipUnsubToken(MEMBERSHIP, "digest", SECRET);
    expect(verifyUnsubToken(MEMBERSHIP, memberToken, SECRET)).toBe(false);
  });

  it("keeps legacy email tokens byte-identical", () => {
    // Pinned value: links in already delivered welcome emails must keep working.
    const pinned = "6tPsKcVtuXllkx42Jy-5oh5xnbGT7GMRPsspq5UuzI8";
    expect(makeUnsubToken("user@example.com", SECRET)).toBe(pinned);
    expect(verifyUnsubToken(" USER@example.com", pinned, SECRET)).toBe(true);
  });

  it("recognizes only the two jobs", () => {
    expect(isUnsubJob("digest")).toBe(true);
    expect(isUnsubJob("report")).toBe(true);
    expect(isUnsubJob("welcome")).toBe(false);
    expect(isUnsubJob(null)).toBe(false);
  });
});
