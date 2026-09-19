import { describe, expect, it } from "vitest";

import { CONNECTOR_SCOPES } from "./scopes";
import {
  connectorPermissions,
  SCOPE_PLAIN_WHY,
  SIGN_IN_STEPS,
} from "./signInSteps";

const FORBIDDEN = /[–—]| - |priority support|\bSLA\b|service credits/i;

describe("sign-in page permissions", () => {
  it("explains every connector scope: a new scope needs a line in SCOPE_PLAIN_WHY", () => {
    const why: Record<string, string | undefined> = SCOPE_PLAIN_WHY;
    for (const { scope } of CONNECTOR_SCOPES) {
      expect(why[scope], `no plain-language why for ${scope}`).toBeTruthy();
      expect(why[scope]!.trim().length).toBeGreaterThan(20);
    }
  });

  it("explains nothing the connector does not ask for", () => {
    expect(Object.keys(SCOPE_PLAIN_WHY).sort()).toEqual(
      CONNECTOR_SCOPES.map((s) => s.scope).sort(),
    );
  });

  it("renders the list from scopes.ts, in its order", () => {
    expect(connectorPermissions().map((p) => p.scope)).toEqual(
      CONNECTOR_SCOPES.map((s) => s.scope),
    );
  });

  it("only ever describes read access", () => {
    for (const { scope } of CONNECTOR_SCOPES) {
      expect(scope).toMatch(/\.Read\./);
    }
  });
});

describe("sign-in steps", () => {
  it("has the four steps in order, each with a time estimate and two or three sentences", () => {
    expect(SIGN_IN_STEPS.map((s) => s.id)).toEqual([
      "signin",
      "workspace",
      "connect",
      "results",
    ]);
    for (const step of SIGN_IN_STEPS) {
      expect(step.title).toBeTruthy();
      expect(step.time).toBeTruthy();
      expect(step.sentences.length).toBeGreaterThanOrEqual(2);
      expect(step.sentences.length).toBeLessThanOrEqual(3);
    }
  });

  it("says only the admin step needs an admin", () => {
    expect(SIGN_IN_STEPS.filter((s) => s.needs).map((s) => s.id)).toEqual([
      "connect",
    ]);
  });

  it("names what sign-in shares beyond name and email", () => {
    const signin = SIGN_IN_STEPS.find((s) => s.id === "signin")!;
    const copy = signin.sentences.join(" ");
    expect(copy).toMatch(/IDs of your account and your organisation/);
    // Tenants with user consent switched off stop at this Microsoft screen.
    expect(copy).toMatch(/Need admin approval/);
  });

  it("says the connector consent is a second dialog for a separate app", () => {
    const connect = SIGN_IN_STEPS.find((s) => s.id === "connect")!;
    const copy = connect.sentences.join(" ");
    expect(copy).toMatch(/second Microsoft dialog/);
    expect(copy).toMatch(/LicenseMeter Connector/);
    expect(copy).toMatch(/Privileged Role Administrator/);
  });

  it("follows the writing rules", () => {
    const copy = [
      ...SIGN_IN_STEPS.flatMap((s) => [s.title, s.time, ...s.sentences]),
      ...Object.values(SCOPE_PLAIN_WHY),
    ];
    for (const text of copy) expect(text).not.toMatch(FORBIDDEN);
  });
});
