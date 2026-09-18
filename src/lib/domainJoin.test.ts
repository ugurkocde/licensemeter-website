import { describe, expect, it } from "vitest";

import { corporateDomainOf, decideDomainJoin } from "~/lib/domainJoin";

const base = {
  requestStatus: null,
  emailVerified: true,
  consumerDomain: false,
} as const;

describe("decideDomainJoin", () => {
  it("files a request in approval mode when none exists", () => {
    expect(decideDomainJoin({ ...base, mode: "approval" })).toBe("request");
  });

  it("stays quiet in approval mode while a request is pending", () => {
    expect(
      decideDomainJoin({ ...base, mode: "approval", requestStatus: "pending" }),
    ).toBe("none");
  });

  it("joins in auto mode, also when an older request is still pending", () => {
    expect(decideDomainJoin({ ...base, mode: "auto" })).toBe("join");
    expect(
      decideDomainJoin({ ...base, mode: "auto", requestStatus: "pending" }),
    ).toBe("join");
  });

  it("does nothing when domain join is off", () => {
    expect(decideDomainJoin({ ...base, mode: "off" })).toBe("none");
    expect(
      decideDomainJoin({ ...base, mode: "off", requestStatus: "pending" }),
    ).toBe("none");
  });

  it("treats a decided request as final in every mode", () => {
    for (const mode of ["approval", "auto", "off"] as const) {
      for (const requestStatus of ["declined", "approved"] as const) {
        expect(decideDomainJoin({ ...base, mode, requestStatus })).toBe("none");
      }
    }
  });

  it("never admits unverified or consumer addresses", () => {
    for (const mode of ["approval", "auto"] as const) {
      expect(decideDomainJoin({ ...base, mode, emailVerified: false })).toBe(
        "none",
      );
      expect(decideDomainJoin({ ...base, mode, consumerDomain: true })).toBe(
        "none",
      );
    }
  });
});

describe("corporateDomainOf", () => {
  it("returns the lowercased domain of a verified company address", () => {
    expect(corporateDomainOf("Ada@Acme.COM", true)).toBe("acme.com");
  });

  it("rejects unverified, consumer and malformed addresses", () => {
    expect(corporateDomainOf("ada@acme.com", false)).toBeNull();
    expect(corporateDomainOf("ada@gmail.com", true)).toBeNull();
    expect(corporateDomainOf("ada@localhost", true)).toBeNull();
    expect(corporateDomainOf("ada", true)).toBeNull();
  });
});
