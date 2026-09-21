import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "~/server/db/schema";

/**
 * The admin-consent callback must not bind a Microsoft tenant just because the
 * query string says so. `admin_consent` and `tenant` are attacker-controlled,
 * so the callback proves consent with the managed connector app before writing
 * the binding; this suite drives the forged and legitimate paths against a real
 * PGlite database with the connector probe stubbed.
 */

const TENANT_ID = "11111111-1111-1111-1111-00000000000a";
const HOME_TID = "22222222-2222-2222-2222-00000000000b";
const VICTIM_TID = "33333333-3333-3333-3333-00000000000c";
const OID = "44444444-4444-4444-4444-00000000000d";
const STATE = "55555555-5555-5555-5555-00000000000e";

let currentDb: ReturnType<typeof makeDb>;
const apiAccess = vi.fn();
const auth = vi.fn();
const verifyManagedConsent = vi.fn();
const notifyOps = vi.fn();
const runSync = vi.fn();

vi.mock("~/env", () => ({
  env: {
    NODE_ENV: "test",
    CONNECTOR_CLIENT_ID: "connector-client-id",
    CONNECTOR_CLIENT_SECRET: "connector-client-secret",
  },
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
vi.mock("~/server/access", () => ({
  apiAccess,
  WORKSPACE_COOKIE: "lm_ws",
  workspaceCookieOptions: () => ({}),
}));
vi.mock("~/server/auth", () => ({ auth }));
vi.mock("~/server/graph/msGraph", () => ({ verifyManagedConsent }));
vi.mock("~/server/ops", () => ({ notifyOps }));
vi.mock("~/server/sync/runSync", () => ({ runSync }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: () => undefined }),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));
vi.mock("next/server", () => ({ after: () => undefined }));

const { GET } = await import("./route");

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

const callback = (tid: string) =>
  ({
    nextUrl: new URL(
      `http://localhost/api/connect/callback?state=${STATE}&tenant=${tid}&admin_consent=True`,
    ),
  }) as never;

const seedState = async () => {
  await currentDb
    .insert(schema.tenants)
    .values({ id: TENANT_ID, name: "Attacker Workspace" });
  await currentDb.insert(schema.consentStates).values({
    state: STATE,
    tenantId: TENANT_ID,
    oid: OID,
    tid: HOME_TID,
    email: "admin@example.com",
    name: "Admin",
  });
};

beforeEach(async () => {
  const client = new PGlite();
  for (const stmt of await schemaDdl()) await client.exec(stmt);
  currentDb = makeDb(client);
  vi.clearAllMocks();
  auth.mockResolvedValue({ user: { oid: OID, tid: HOME_TID, isDemo: false } });
  apiAccess.mockResolvedValue({
    user: { oid: OID, isDemo: false },
    tenant: { id: TENANT_ID, tid: null, isDemo: false },
    membership: { oid: OID, tenantId: TENANT_ID },
  });
});

describe("admin-consent callback tenant binding", () => {
  it("refuses a forged tenant the connector app has no consent in", async () => {
    await seedState();
    verifyManagedConsent.mockResolvedValue(false);

    await expect(GET(callback(VICTIM_TID))).rejects.toThrow(
      /redirect:.*consent_not_granted/,
    );

    const [tenant] = await currentDb
      .select()
      .from(schema.tenants)
      .where(eq(schema.tenants.id, TENANT_ID));
    expect(tenant?.tid ?? null).toBeNull();
    const conns = await currentDb.select().from(schema.msConnections);
    expect(conns).toHaveLength(0);
    const [state] = await currentDb
      .select()
      .from(schema.consentStates)
      .where(eq(schema.consentStates.state, STATE));
    expect(state?.usedAt ?? null).toBeNull();
  });

  it("binds the tenant once the connector app confirms consent", async () => {
    await seedState();
    verifyManagedConsent.mockResolvedValue(true);

    await expect(GET(callback(VICTIM_TID))).rejects.toThrow(
      /redirect:.*status=syncing/,
    );

    expect(verifyManagedConsent).toHaveBeenCalledWith(VICTIM_TID);
    const [tenant] = await currentDb
      .select()
      .from(schema.tenants)
      .where(eq(schema.tenants.id, TENANT_ID));
    expect(tenant?.tid).toBe(VICTIM_TID);
    const conns = await currentDb
      .select()
      .from(schema.msConnections)
      .where(eq(schema.msConnections.tenantId, TENANT_ID));
    expect(conns).toHaveLength(1);
    expect(conns[0]?.mode).toBe("managed");
  });
});
