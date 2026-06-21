import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

/**
 * Stateless unsubscribe tokens for billing-reminder emails. Same HMAC pattern
 * as unsubToken.ts but a DISTINCT HKDF context, so a marketing-unsubscribe
 * token can never be replayed against a workspace's billing reminders (and vice
 * versa). The signed value is the tenant id (the reminder opt-out is
 * workspace-scoped: owners/admins share one trialReminders flag).
 */
const key = (secret: string): Buffer =>
  Buffer.from(
    hkdfSync("sha256", secret, "licensemeter-billing-unsub", "token-v1", 32),
  );

export const makeBillingUnsubToken = (
  tenantId: string,
  secret: string,
): string =>
  createHmac("sha256", key(secret)).update(tenantId).digest("base64url");

export const verifyBillingUnsubToken = (
  tenantId: string,
  token: string,
  secret: string,
): boolean => {
  const expected = Buffer.from(makeBillingUnsubToken(tenantId, secret));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
};
