import { describe, expect, it } from "vitest";

import {
  SECURITY_TXT_EXPIRES,
  isPublicHttpsOrigin,
  VULNERABILITY_POLICY_PATH,
  securityTxt,
} from "~/lib/securityTxt";
import { TRUST_CONTENT } from "~/app/(marketing)/trust-center/content";

const DAY = 24 * 60 * 60 * 1000;

describe("security.txt", () => {
  const body = securityTxt("https://licensemeter.com");
  const fields = Object.fromEntries(
    body
      .trim()
      .split("\n")
      .map((line) => {
        const at = line.indexOf(": ");
        return [line.slice(0, at), line.slice(at + 2)];
      }),
  );

  it("has the RFC 9116 fields the hosted site publishes", () => {
    expect(fields).toEqual({
      Contact: "mailto:support@ugurlabs.com",
      Expires: SECURITY_TXT_EXPIRES,
      "Preferred-Languages": "en, de",
      Canonical: "https://licensemeter.com/.well-known/security.txt",
      Policy: "https://licensemeter.com/trust-center#vulnerability-management",
    });
  });

  it("is published only for a public https origin", () => {
    expect(isPublicHttpsOrigin("https://licensemeter.com")).toBe(true);
    expect(isPublicHttpsOrigin("http://licensemeter.com")).toBe(false);
    expect(isPublicHttpsOrigin("http://localhost:3000")).toBe(false);
    expect(isPublicHttpsOrigin("https://localhost")).toBe(false);
    expect(isPublicHttpsOrigin("https://127.0.0.1")).toBe(false);
    expect(isPublicHttpsOrigin("not a url")).toBe(false);
  });

  it("expires within a year and is renewed at least 30 days ahead", () => {
    const expires = Date.parse(SECURITY_TXT_EXPIRES);
    expect(Number.isNaN(expires)).toBe(false);
    expect(expires - Date.now()).toBeGreaterThan(30 * DAY);
    expect(expires - Date.now()).toBeLessThanOrEqual(366 * DAY);
  });

  it("points its Policy at a section that exists on the Trust Center", () => {
    const anchor = VULNERABILITY_POLICY_PATH.split("#")[1];
    expect(TRUST_CONTENT.en.vulnerability.id).toBe(anchor);
    expect(TRUST_CONTENT.de.vulnerability.id).toBe(anchor);
  });
});
