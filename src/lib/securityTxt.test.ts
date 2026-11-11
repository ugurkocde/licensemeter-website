import { describe, expect, it } from "vitest";

import {
  SECURITY_TXT_EXPIRES,
  VULNERABILITY_POLICY_PATH,
  securityTxtFor,
} from "~/lib/securityTxt";
import { TRUST_CONTENT } from "~/app/(marketing)/trust-center/content";

const DAY = 24 * 60 * 60 * 1000;

const fieldsOf = (body: string) =>
  Object.fromEntries(
    body
      .trim()
      .split("\n")
      .map((line) => {
        const at = line.indexOf(": ");
        return [line.slice(0, at), line.slice(at + 2)];
      }),
  );

describe("security.txt", () => {
  it("has the RFC 9116 fields the hosted site publishes", () => {
    expect(fieldsOf(securityTxtFor("https://licensemeter.com") ?? "")).toEqual({
      Contact: "mailto:support@ugurlabs.com",
      Expires: SECURITY_TXT_EXPIRES,
      "Preferred-Languages": "en, de",
      Canonical: "https://licensemeter.com/.well-known/security.txt",
      Policy: "https://licensemeter.com/trust-center#vulnerability-management",
    });
  });

  it("builds its URLs from the origin alone", () => {
    for (const base of [
      "https://licensemeter.com/",
      "https://licensemeter.com/some/path?x=1#y",
    ]) {
      expect(fieldsOf(securityTxtFor(base) ?? "").Canonical).toBe(
        "https://licensemeter.com/.well-known/security.txt",
      );
    }
    expect(
      fieldsOf(securityTxtFor("https://www.licensemeter.com") ?? "").Policy,
    ).toBe(
      "https://www.licensemeter.com/trust-center#vulnerability-management",
    );
  });

  it("is published only for the hosted service", () => {
    for (const base of [
      "http://licensemeter.com",
      "https://licensemeter.com:8443",
      "http://localhost:3000",
      "https://10.0.0.1",
      "https://app.localdomain",
      "https://app.corp.internal.",
      "https://licensemeter.example.org",
      "https://licensemeter-git-branch.vercel.app",
      "not a url",
    ]) {
      expect(securityTxtFor(base), base).toBeNull();
    }
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
