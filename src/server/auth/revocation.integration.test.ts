import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { SignJWT } from "jose";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "~/server/db/schema";

/**
 * Server-side session revocation. Signing out records the token's jti, and
 * auth() refuses a revoked session. Tokens minted before the table existed
 * carry no jti and stay valid, so deploying this does not sign anyone out.
 */

let currentDb: ReturnType<typeof makeDb>;
let sessionToken: string | undefined;

vi.mock("~/env", () => ({
  env: { NODE_ENV: "test", AUTH_SECRET: "test-secret-test-secret" },
  isDemoMode: () => false,
}));
vi.mock("~/server/db", () => ({
  db: new Proxy(
    {},
    {
      get: (_t, prop) =>
        (currentDb as unknown as Record<string | symbol, unknown>)[prop],
    },
  ),
  schema,
}));

let cachedDdl: string[] | null = null;
async function schemaDdl(): Promise<string[]> {
  cachedDdl ??= await generateMigration(
    generateDrizzleJson({}),
    generateDrizzleJson(schema),
  );
  return cachedDdl;
}
function makeDb(client: PGlite) {
  return drizzle(client, { schema });
}

vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) =>
        sessionToken && name === "lm_session"
          ? { value: sessionToken }
          : undefined,
    }),
}));

const { createSessionToken } = await import("~/server/auth/session");
const { auth, revokeCurrentSession } = await import("~/server/auth");

const USER = {
  oid: "00000000-0000-4000-8000-0000000000a1",
  tid: "tid-1",
  upn: "user@example.com",
  name: "User",
  email: "user@example.com",
  isDemo: false,
  emailProven: false,
};

const legacyToken = (payload: Record<string, unknown>): Promise<string> =>
  new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("600s")
    .sign(new TextEncoder().encode("test-secret-test-secret"));

beforeEach(async () => {
  const client = new PGlite();
  for (const stmt of await schemaDdl()) await client.exec(stmt);
  currentDb = makeDb(client);
  sessionToken = undefined;
});

describe("session revocation", () => {
  it("accepts a fresh session and refuses it after sign-out", async () => {
    sessionToken = await createSessionToken(USER);
    expect((await auth())?.user.oid).toBe(USER.oid);

    await revokeCurrentSession();

    expect(await auth()).toBeNull();
  });

  it("revokes only the signed-out token", async () => {
    const first = await createSessionToken(USER);
    const second = await createSessionToken(USER);

    sessionToken = first;
    await revokeCurrentSession();

    sessionToken = first;
    expect(await auth()).toBeNull();
    sessionToken = second;
    expect((await auth())?.user.oid).toBe(USER.oid);
  });

  it("keeps legacy tokens (no jti) valid, so deploy does not sign anyone out", async () => {
    sessionToken = await legacyToken(USER);
    expect((await auth())?.user.oid).toBe(USER.oid);
  });

  it("does nothing when there is no session", async () => {
    sessionToken = undefined;
    await expect(revokeCurrentSession()).resolves.toBeUndefined();
    expect(await auth()).toBeNull();
  });
});
