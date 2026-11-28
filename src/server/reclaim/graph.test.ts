import { describe, expect, it, vi } from "vitest";

import { reclaimRoles, RECLAIM_ROLE } from "~/lib/reclaim";

const env = vi.hoisted(() => ({
  CONNECTOR_CLIENT_ID: "99999999-8888-7777-6666-555555555555",
  AUTH_MICROSOFT_ENTRA_ID_ID: "77777777-8888-7777-6666-555555555555",
  METERING_CLIENT_ID: undefined as string | undefined,
  RECLAIM_CLIENT_ID: undefined as string | undefined,
  RECLAIM_CLIENT_SECRET: undefined as string | undefined,
}));
vi.mock("~/env", () => ({ env }));

const { checkReclaimToken, reclaimConfigured, ReclaimError } =
  await import("./graph");

const TID = "11111111-2222-3333-4444-555555555555";
const jwt = (claims: Record<string, unknown>) =>
  `x.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.y`;
const codeOf = (fn: () => void) => {
  try {
    fn();
    return "ok";
  } catch (err) {
    return err instanceof ReclaimError ? err.code : "other";
  }
};

describe("reclaimRoles", () => {
  it("accepts exactly the license write permission", () => {
    expect(reclaimRoles([RECLAIM_ROLE])).toEqual({ ok: true });
  });
  it("refuses a token without it", () => {
    expect(reclaimRoles([])).toEqual({ ok: false, code: "missing" });
    expect(reclaimRoles(undefined)).toEqual({ ok: false, code: "missing" });
    // The broader permissions are not accepted as a substitute.
    expect(reclaimRoles(["User.ReadWrite.All"])).toEqual({
      ok: false,
      code: "missing",
    });
  });
  it("names every extra permission", () => {
    expect(
      reclaimRoles([RECLAIM_ROLE, "User.ReadWrite.All", "User.ReadWrite.All"]),
    ).toEqual({ ok: false, code: "extra", extra: ["User.ReadWrite.All"] });
  });
});

describe("checkReclaimToken", () => {
  const good = { tid: TID, oid: "sp", roles: [RECLAIM_ROLE] };
  it("passes a token for this tenant with only the permission", () => {
    expect(codeOf(() => checkReclaimToken(jwt(good), TID.toUpperCase()))).toBe(
      "ok",
    );
  });
  it("refuses another tenant's token", () => {
    expect(
      codeOf(() =>
        checkReclaimToken(
          jwt({ ...good, tid: "00000000-0000-0000-0000-000000000000" }),
          TID,
        ),
      ),
    ).toBe("wrong_tenant");
  });
  it("treats a token without the service principal as pending consent", () => {
    expect(codeOf(() => checkReclaimToken(jwt({ ...good, oid: 1 }), TID))).toBe(
      "consent",
    );
    expect(
      codeOf(() => checkReclaimToken(jwt({ ...good, roles: [] }), TID)),
    ).toBe("consent");
  });
  it("refuses an app with more power than it needs", () => {
    expect(
      codeOf(() =>
        checkReclaimToken(
          jwt({ ...good, roles: [RECLAIM_ROLE, "Directory.ReadWrite.All"] }),
          TID,
        ),
      ),
    ).toBe("extra");
  });
  it("refuses a malformed token", () => {
    expect(codeOf(() => checkReclaimToken("garbage", TID))).toBe(
      "wrong_tenant",
    );
  });
});

describe("reclaimConfigured", () => {
  it("needs its own id and secret", () => {
    env.RECLAIM_CLIENT_ID = undefined;
    env.RECLAIM_CLIENT_SECRET = undefined;
    expect(reclaimConfigured()).toBe(false);
    env.RECLAIM_CLIENT_ID = "12121212-3434-5656-7878-909090909090";
    expect(reclaimConfigured()).toBe(false);
    env.RECLAIM_CLIENT_SECRET = "secret";
    expect(reclaimConfigured()).toBe(true);
  });
  it("is off when it reuses the connector, sign-in or metering app", () => {
    env.RECLAIM_CLIENT_SECRET = "secret";
    for (const reused of [
      env.CONNECTOR_CLIENT_ID,
      env.AUTH_MICROSOFT_ENTRA_ID_ID.toUpperCase(),
    ]) {
      env.RECLAIM_CLIENT_ID = reused;
      expect(reclaimConfigured()).toBe(false);
    }
    env.METERING_CLIENT_ID = "12121212-3434-5656-7878-909090909090";
    env.RECLAIM_CLIENT_ID = env.METERING_CLIENT_ID;
    expect(reclaimConfigured()).toBe(false);
  });
});
