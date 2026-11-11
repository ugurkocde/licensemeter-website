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
 * The origins of the hosted service. security.txt names our security contact,
 * so it is published only there: previews, self-hosted instances and any
 * other origin get no file rather than one pointing reporters at us.
 */
export const HOSTED_ORIGINS: ReadonlySet<string> = new Set([
  "https://licensemeter.com",
  "https://www.licensemeter.com",
]);

/**
 * The RFC 9116 security.txt body for the site at `base`, or null when `base`
 * is not the hosted service. Canonical and Policy are built from the parsed
 * origin, so a trailing slash or a path in the configured URL cannot change
 * them.
 */
export const securityTxtFor = (base: string): string | null => {
  let origin: string;
  try {
    origin = new URL(base).origin;
  } catch {
    return null;
  }
  if (!HOSTED_ORIGINS.has(origin)) return null;
  return [
    `Contact: mailto:${SUPPORT_EMAIL}`,
    `Expires: ${SECURITY_TXT_EXPIRES}`,
    "Preferred-Languages: en, de",
    `Canonical: ${origin}/.well-known/security.txt`,
    `Policy: ${origin}${VULNERABILITY_POLICY_PATH}`,
    "",
  ].join("\n");
};
