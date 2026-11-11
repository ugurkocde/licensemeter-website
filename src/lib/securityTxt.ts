import { SUPPORT_EMAIL } from "~/lib/support";

/**
 * Expiry of /.well-known/security.txt (RFC 9116, section 2.5.5): at most a
 * year ahead. Renew it before this date; securityTxt.test.ts fails once it is
 * less than 30 days away.
 */
export const SECURITY_TXT_EXPIRES = "2027-11-12T00:00:00.000Z";

/** The anchor on the Trust Center that security.txt names as its Policy. */
export const VULNERABILITY_POLICY_PATH =
  "/trust-center#vulnerability-management";

/**
 * Whether `base` may appear in security.txt: RFC 9116 requires https URLs for
 * Canonical and Policy, so a missing or localhost origin publishes nothing.
 */
export const isPublicHttpsOrigin = (base: string): boolean => {
  try {
    const url = new URL(base);
    return (
      url.protocol === "https:" &&
      url.hostname !== "localhost" &&
      !/^(127\.|0\.0\.0\.0$|\[::1\]$)/.test(url.hostname)
    );
  } catch {
    return false;
  }
};

/** The RFC 9116 security.txt body for the hosted site at `base`. */
export const securityTxt = (base: string): string =>
  [
    `Contact: mailto:${SUPPORT_EMAIL}`,
    `Expires: ${SECURITY_TXT_EXPIRES}`,
    "Preferred-Languages: en, de",
    `Canonical: ${base}/.well-known/security.txt`,
    `Policy: ${base}${VULNERABILITY_POLICY_PATH}`,
    "",
  ].join("\n");
