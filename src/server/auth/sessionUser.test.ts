import { SignJWT } from "jose";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The session user read back from the cookie. emailProven is the one field
 * that unlocks email-based linking, so it must survive a round trip exactly
 * and read as false for every cookie that does not carry the boolean true:
 * above all the sessions minted before the field existed, which stay valid.
 */

process.env.AUTH_SECRET ??= "test-secret-test-secret";

let cookieValue: string | undefined;
vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      get: () => (cookieValue ? { value: cookieValue } : undefined),
    }),
}));

const { auth, createSessionToken } = await import("~/server/auth/session");

const key = new TextEncoder().encode(process.env.AUTH_SECRET);
const sign = (payload: Record<string, unknown>): Promise<string> =>
  new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("600s")
    .sign(key);

const BASE = {
  oid: "22222222-2222-2222-2222-222222222222",
  tid: "11111111-1111-1111-1111-111111111111",
  upn: "ada@contoso.com",
  name: "Ada",
  email: "ada@contoso.com",
  isDemo: false,
};

beforeEach(() => {
  cookieValue = undefined;
});

describe("session user", () => {
  it("round-trips emailProven", async () => {
    cookieValue = await createSessionToken({ ...BASE, emailProven: true });
    expect((await auth())?.user).toEqual({ ...BASE, emailProven: true });

    cookieValue = await createSessionToken({ ...BASE, emailProven: false });
    expect((await auth())?.user.emailProven).toBe(false);
  });

  it("keeps a session from before the field existed and reads it as not proven", async () => {
    cookieValue = await sign(BASE);
    const session = await auth();
    expect(session?.user).toEqual({ ...BASE, emailProven: false });
  });

  it("reads a legacy emailVerified flag or a non-boolean as not proven", async () => {
    for (const extra of [
      { emailVerified: true },
      { emailProven: "true" },
      { emailProven: 1 },
    ]) {
      cookieValue = await sign({ ...BASE, ...extra });
      expect((await auth())?.user.emailProven).toBe(false);
    }
  });

  it("drops fields of the removed sign-in provider", async () => {
    cookieValue = await sign({
      ...BASE,
      workosUserId: "user_x",
      workosOrgId: "org_x",
    });
    const user = (await auth())?.user as Record<string, unknown>;
    expect(user.workosUserId).toBeUndefined();
    expect(user.workosOrgId).toBeUndefined();
  });

  it("rejects a cookie without an Entra identity", async () => {
    cookieValue = await sign({ ...BASE, oid: "", tid: "" });
    expect(await auth()).toBeNull();
    cookieValue = await sign({ upn: "x@y.z", workosUserId: "user_x" });
    expect(await auth()).toBeNull();
  });

  it("rejects a cookie signed with another key", async () => {
    cookieValue = await new SignJWT({ ...BASE, emailProven: true })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("600s")
      .sign(new TextEncoder().encode("another-secret-another-secret"));
    expect(await auth()).toBeNull();
  });
});
