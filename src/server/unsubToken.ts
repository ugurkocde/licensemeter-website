import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

/**
 * Stateless unsubscribe tokens: HMAC over the normalized email with a key
 * derived from AUTH_SECRET (same HKDF pattern as crypto.ts, own context).
 * Nothing to store or expire: a link stays valid until AUTH_SECRET rotates.
 * The secret arrives as an argument so this module stays env-free for tests.
 */
const key = (secret: string): Buffer =>
  Buffer.from(hkdfSync("sha256", secret, "licensemeter-unsub", "token-v1", 32));

export const makeUnsubToken = (email: string, secret: string): string =>
  createHmac("sha256", key(secret))
    .update(email.trim().toLowerCase())
    .digest("base64url");

export const verifyUnsubToken = (
  email: string,
  token: string,
  secret: string,
): boolean => {
  const expected = Buffer.from(makeUnsubToken(email, secret));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
};

/** Scheduled email a membership can opt out of. */
export type UnsubJob = "digest" | "report";

export const isUnsubJob = (v: unknown): v is UnsubJob =>
  v === "digest" || v === "report";

/**
 * Membership-scoped token for the digest and report emails: HMAC over
 * "membership:<id>:<job>" with the same derived key. The prefix keeps the
 * message space disjoint from the email tokens above (an email always
 * contains "@", a membership id never does), so neither kind can stand in
 * for the other, and the job is signed so a digest link cannot switch off
 * the report.
 */
export const makeMembershipUnsubToken = (
  membershipId: string,
  job: UnsubJob,
  secret: string,
): string =>
  createHmac("sha256", key(secret))
    .update(`membership:${membershipId.trim().toLowerCase()}:${job}`)
    .digest("base64url");

export const verifyMembershipUnsubToken = (
  membershipId: string,
  job: UnsubJob,
  token: string,
  secret: string,
): boolean => {
  const expected = Buffer.from(
    makeMembershipUnsubToken(membershipId, job, secret),
  );
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
};
