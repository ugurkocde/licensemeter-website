import { isIP } from "node:net";

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
 * Canonical and Policy, and they must name the public site. Only a domain name
 * with a public suffix qualifies; IP literals (private, loopback or not),
 * localhost and internal-only names publish nothing.
 */
export const isPublicHttpsOrigin = (base: string): boolean => {
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    return false;
  }
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return (
    url.protocol === "https:" &&
    isIP(host) === 0 &&
    host.includes(".") &&
    !/\.(localhost|local|internal|lan|home|corp|test|invalid|example)$/.test(
      host,
    )
  );
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
