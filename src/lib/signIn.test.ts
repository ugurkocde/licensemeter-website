import { describe, expect, it } from "vitest";

import { validateReturnTo } from "~/server/auth/session";

import {
  passThroughReturnTo,
  SIGN_IN_ERROR_TEXT,
  signInErrorText,
  signInStartHref,
  signupSourceFromReferer,
  validateSignupSource,
} from "./signIn";

describe("passThroughReturnTo", () => {
  it("passes app paths and the Marketplace landing path through unchanged", () => {
    for (const value of [
      "/app",
      "/app/connect/csv",
      "/app/upgrade?interval=year",
      "/marketplace/landing",
      "/marketplace/landing?token=abc%2Bdef%3D",
    ]) {
      expect(passThroughReturnTo(value)).toBe(value);
    }
  });

  it("drops everything else", () => {
    for (const value of [
      undefined,
      null,
      "",
      "/",
      "/pricing",
      "/marketplace/landing-page",
      "/marketplace",
      "//evil.example/app",
      "https://evil.example/app",
      "/app?next=https://evil.example",
      "/app\\evil",
      "/app\r\nSet-Cookie: x=1",
      "app",
      ["/app", "/app/settings"],
    ]) {
      expect(passThroughReturnTo(value)).toBeNull();
    }
  });

  it("never lets through a value the sign-in route would refuse", () => {
    for (const value of [
      "/app",
      "/app/connect/csv",
      "/apple",
      "/marketplace/landing?token=a",
      "/app//x",
      "/app/../pricing",
    ]) {
      const passed = passThroughReturnTo(value);
      if (passed !== null) expect(validateReturnTo(passed)).toBe(passed);
    }
  });
});

describe("signInStartHref", () => {
  it("starts the Microsoft flow, with the destination encoded once", () => {
    expect(signInStartHref()).toBe("/api/auth/signin");
    expect(signInStartHref(null)).toBe("/api/auth/signin");
    const href = signInStartHref("/marketplace/landing?token=a%2Bb&x=1");
    expect(href).toBe(
      "/api/auth/signin?returnTo=%2Fmarketplace%2Flanding%3Ftoken%3Da%252Bb%26x%3D1",
    );
    expect(
      new URL(href, "https://x.invalid").searchParams.get("returnTo"),
    ).toBe("/marketplace/landing?token=a%2Bb&x=1");
  });

  it("carries a valid source page and drops an invalid one", () => {
    expect(signInStartHref(null, "/compare/powershell-audit")).toBe(
      "/api/auth/signin?from=%2Fcompare%2Fpowershell-audit",
    );
    expect(signInStartHref("/app", "/pricing")).toBe(
      "/api/auth/signin?returnTo=%2Fapp&from=%2Fpricing",
    );
    expect(signInStartHref(null, "/app/findings")).toBe("/api/auth/signin");
  });
});

describe("validateSignupSource", () => {
  it("keeps plain public page paths", () => {
    for (const value of [
      "/",
      "/pricing",
      "/compare/m365-admin-center",
      "/de/pricing",
    ]) {
      expect(validateSignupSource(value)).toBe(value);
    }
  });

  it("drops queries, app and auth paths, and anything unusual", () => {
    for (const value of [
      undefined,
      null,
      "",
      ["/pricing"],
      "pricing",
      "//evil.example",
      "/pricing?utm_source=x",
      "/pricing#faq",
      "/Pricing",
      "/app",
      "/app/findings",
      "/api/auth/signin",
      "/sign-in",
      "/auth/x",
      "/marketplace/landing",
      `/${"a".repeat(120)}`,
    ]) {
      expect(validateSignupSource(value)).toBeNull();
    }
  });
});

describe("signupSourceFromReferer", () => {
  it("reads the path of a same-origin referer only", () => {
    expect(
      signupSourceFromReferer(
        "https://www.licensemeter.com/compare/powershell-audit?x=1",
        "www.licensemeter.com",
      ),
    ).toBe("/compare/powershell-audit");
    expect(
      signupSourceFromReferer(
        "https://news.example/post",
        "www.licensemeter.com",
      ),
    ).toBeNull();
    expect(
      signupSourceFromReferer("not a url", "www.licensemeter.com"),
    ).toBeNull();
    expect(signupSourceFromReferer(null, "www.licensemeter.com")).toBeNull();
    expect(signupSourceFromReferer("https://a.example/", null)).toBeNull();
  });
});

describe("notices", () => {
  it("maps known codes and never echoes an unknown one", () => {
    expect(signInErrorText(undefined)).toBeNull();
    expect(signInErrorText("")).toBeNull();
    expect(signInErrorText("declined")).toBe(SIGN_IN_ERROR_TEXT.declined);
    const unknown = signInErrorText("<script>alert(1)</script>");
    expect(unknown).toBe(SIGN_IN_ERROR_TEXT.failed);
    expect(signInErrorText(["a", "b"])).toBeNull();
  });
});
