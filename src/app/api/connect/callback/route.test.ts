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
const notifyOps = vi.fn<(text: string, opts?: unknown) => Promise<void>>();
const runSync = vi.fn();

const env = vi.hoisted(
  (): {
    NODE_ENV: string;
    CONNECTOR_CLIENT_ID: string;
    CONNECTOR_CLIENT_SECRET: string | undefined;
  } => ({
    NODE_ENV: "test",
    CONNECTOR_CLIENT_ID: "connector-client-id",
    CONNECTOR_CLIENT_SECRET: "connector-client-secret",
  }),
);
vi.mock("~/env", () => ({ env }));
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

const callbackWith = (query: string) =>
  ({
    nextUrl: new URL(`http://localhost/api/connect/callback?${query}`),
  }) as never;

const rejectionAlerts = () =>
  notifyOps.mock.calls.filter(([text]) =>
    text.startsWith("consent callback rejected"),
  );

const seedState = async (email = "admin@example.com") => {
  await currentDb
    .insert(schema.tenants)
    .values({ id: TENANT_ID, name: "Attacker Workspace" });
  await currentDb.insert(schema.consentStates).values({
    state: STATE,
    tenantId: TENANT_ID,
    oid: OID,
    tid: HOME_TID,
    email,
    name: "Admin",
  });
};

beforeEach(async () => {
  const client = new PGlite();
  for (const stmt of await schemaDdl()) await client.exec(stmt);
  currentDb = makeDb(client);
  vi.clearAllMocks();
  env.CONNECTOR_CLIENT_SECRET = "connector-client-secret";
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

    expect(verifyManagedConsent).toHaveBeenCalledWith(
      VICTIM_TID,
      expect.any(Number),
    );
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

  it("alerts nothing on the success path", async () => {
    await seedState();
    verifyManagedConsent.mockResolvedValue(true);

    await expect(GET(callback(VICTIM_TID))).rejects.toThrow(
      /redirect:.*status=syncing/,
    );

    expect(rejectionAlerts()).toHaveLength(0);
  });
});

describe("admin-consent callback rejection alerts", () => {
  const OTHER_OID = "66666666-6666-6666-6666-00000000000f";
  const OTHER_TENANT_ID = "77777777-7777-7777-7777-000000000010";
  const OTHER_TID = "88888888-8888-8888-8888-000000000011";

  const stateUsed = async () => {
    const [row] = await currentDb
      .select()
      .from(schema.consentStates)
      .where(eq(schema.consentStates.state, STATE));
    return row?.usedAt != null;
  };

  it("alerts the code, workspace, initiator and granted tenant", async () => {
    await seedState();
    verifyManagedConsent.mockResolvedValue(false);

    await expect(GET(callback(VICTIM_TID))).rejects.toThrow(
      /redirect:.*consent_not_granted/,
    );

    expect(rejectionAlerts()).toHaveLength(1);
    const [text, opts] = rejectionAlerts()[0]!;
    expect(text).toBe(
      `consent callback rejected: consent_not_granted for workspace ${TENANT_ID} by \`admin@example.com\`, oid ${OID} (no app-only token for the granted tenant; granted ${VICTIM_TID})`,
    );
    expect(opts).toEqual({
      key: `consent-callback:${TENANT_ID}:consent_not_granted:no app-only token for the granted tenant`,
      cooldownMs: 15 * 60 * 1000,
    });
    expect(await stateUsed()).toBe(false);
  });

  it("keys a replayed rejection identically so the cooldown holds", async () => {
    await seedState();
    verifyManagedConsent.mockResolvedValue(false);

    await expect(GET(callback(VICTIM_TID))).rejects.toThrow(/redirect:/);
    await expect(GET(callback(OTHER_TID))).rejects.toThrow(/redirect:/);

    const keys = rejectionAlerts().map(([, opts]) => opts);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toEqual(keys[1]);
  });

  it("reduces Microsoft's error fields to their codes", async () => {
    await seedState();
    const query = new URLSearchParams({
      state: STATE,
      error: "access_denied",
      error_description:
        "AADSTS65004: User declined to consent.\r\n<!channel> <https://evil.example|Reconnect> [x](https://evil.example)",
    });

    await expect(GET(callbackWith(query.toString()))).rejects.toThrow(
      /redirect:.*consent_declined/,
    );

    expect(rejectionAlerts()).toHaveLength(1);
    const [text] = rejectionAlerts()[0]!;
    expect(text).toBe(
      `consent callback rejected: consent_declined for workspace ${TENANT_ID} by \`admin@example.com\`, oid ${OID} (Microsoft: access_denied AADSTS65004)`,
    );
    expect(await stateUsed()).toBe(false);
  });

  it("does not echo an error value that is not an OAuth code", async () => {
    await seedState();
    const query = new URLSearchParams({
      state: STATE,
      error: `x\n[ops] forged line <!channel> ${"y".repeat(5000)}`,
    });

    await expect(GET(callbackWith(query.toString()))).rejects.toThrow(
      /redirect:.*consent_declined/,
    );

    const [text] = rejectionAlerts()[0]!;
    expect(text).toContain("(Microsoft: unrecognized error)");
    expect(text).not.toMatch(/[\r\n<>[\]]/);
    expect(text).not.toContain("forged");
  });

  it("keeps an AADSTS code when Microsoft sends no error code", async () => {
    await seedState();

    await expect(
      GET(
        callbackWith(
          `state=${STATE}&error_description=${encodeURIComponent("AADSTS90094: Admin approval required.")}`,
        ),
      ),
    ).rejects.toThrow(/redirect:.*consent_incomplete/);

    expect(rejectionAlerts()[0]![0]).toContain("(Microsoft: AADSTS90094)");
  });

  it.each([
    "_ops_ <!channel>@example.com",
    "x`@evil.example",
    "a\nb@example.com",
    `${"a".repeat(65)}@example.com`,
    "[click](https://evil.example)",
  ])("does not echo an initiator address like %j", async (email) => {
    await seedState(email);

    await expect(
      GET(callbackWith(`state=${STATE}&error=access_denied`)),
    ).rejects.toThrow(/redirect:.*consent_declined/);

    const [text] = rejectionAlerts()[0]!;
    expect(text).toContain(`by unrecognized address, oid ${OID}`);
    expect(text).not.toMatch(/[\r\n<>[\]`]/);
  });

  it("shows a guest UPN as inline code", async () => {
    const guest = "jane_contoso.com#EXT#@fabrikam.onmicrosoft.com";
    await seedState(guest);

    await expect(
      GET(callbackWith(`state=${STATE}&error=access_denied`)),
    ).rejects.toThrow(/redirect:.*consent_declined/);

    expect(rejectionAlerts()[0]![0]).toContain(`by \`${guest}\`, oid ${OID}`);
  });

  it("alerts a state without a workspace under a literal key", async () => {
    await seedState();
    await currentDb
      .update(schema.consentStates)
      .set({ tenantId: null })
      .where(eq(schema.consentStates.state, STATE));

    await expect(GET(callback(VICTIM_TID))).rejects.toThrow(
      /redirect:.*error=not_allowed/,
    );

    const [text, opts] = rejectionAlerts()[0]!;
    expect(text).toContain("for workspace unknown by");
    expect(opts).toEqual({
      key: "consent-callback:unknown:not_allowed:state predates Entra sign-in",
      cooldownMs: 15 * 60 * 1000,
    });
    expect(JSON.stringify(rejectionAlerts())).not.toContain(STATE);
  });

  it("alerts an incomplete consent and a malformed tenant", async () => {
    await seedState();

    await expect(
      GET(callbackWith(`state=${STATE}&tenant=${VICTIM_TID}`)),
    ).rejects.toThrow(/redirect:.*consent_incomplete/);
    await expect(GET(callback("not-a-guid"))).rejects.toThrow(
      /redirect:.*consent_incomplete/,
    );

    const texts = rejectionAlerts().map(([text]) => text);
    expect(texts).toHaveLength(2);
    expect(texts[0]).toMatch(/consent_incomplete for workspace [^(]*$/);
    expect(texts[1]).toContain("(granted tenant is not a GUID)");
    expect(await stateUsed()).toBe(false);
  });

  // Each not_allowed check gets its own reason and dedup key. The first three
  // run before the nonce is consumed and must leave it reusable.
  it.each([
    {
      why: "state predates Entra sign-in",
      consumes: false,
      setup: async () => {
        await currentDb
          .update(schema.consentStates)
          .set({ oid: null })
          .where(eq(schema.consentStates.state, STATE));
      },
    },
    {
      why: "browser session is not the user who started the flow",
      consumes: false,
      setup: async () => {
        auth.mockResolvedValue({ user: { oid: OTHER_OID, isDemo: false } });
      },
    },
    {
      why: "granted tenant is not the initiator's home tenant",
      consumes: false,
      setup: async () => {
        env.CONNECTOR_CLIENT_SECRET = undefined;
      },
    },
    {
      why: "not an admin of the active workspace",
      consumes: true,
      setup: async () => {
        apiAccess.mockResolvedValue(null);
      },
    },
    {
      why: "membership is not the user who started the flow",
      consumes: true,
      setup: async () => {
        apiAccess.mockResolvedValue({
          user: { oid: OID, isDemo: false },
          tenant: { id: TENANT_ID, tid: null, isDemo: false },
          membership: { oid: OTHER_OID, tenantId: TENANT_ID },
        });
      },
    },
    {
      why: "active workspace is not the one the flow started from",
      consumes: true,
      setup: async () => {
        apiAccess.mockResolvedValue({
          user: { oid: OID, isDemo: false },
          tenant: { id: OTHER_TENANT_ID, tid: null, isDemo: false },
          membership: { oid: OID, tenantId: OTHER_TENANT_ID },
        });
      },
    },
  ])("alerts not_allowed: $why", async ({ why, consumes, setup }) => {
    await seedState();
    verifyManagedConsent.mockResolvedValue(true);
    await setup();

    await expect(GET(callback(VICTIM_TID))).rejects.toThrow(
      /redirect:.*error=not_allowed/,
    );

    expect(rejectionAlerts()).toHaveLength(1);
    const [text, opts] = rejectionAlerts()[0]!;
    const oid = why === "state predates Entra sign-in" ? "none" : OID;
    expect(text).toBe(
      `consent callback rejected: not_allowed for workspace ${TENANT_ID} by \`admin@example.com\`, oid ${oid} (${why})`,
    );
    expect(opts).toEqual({
      key: `consent-callback:${TENANT_ID}:not_allowed:${why}`,
      cooldownMs: 15 * 60 * 1000,
    });
    expect(await stateUsed()).toBe(consumes);
    expect(runSync).not.toHaveBeenCalled();
  });

  it("alerts a tenant already bound to another workspace", async () => {
    await seedState();
    await currentDb
      .insert(schema.tenants)
      .values({ id: OTHER_TENANT_ID, name: "Other", tid: VICTIM_TID });
    verifyManagedConsent.mockResolvedValue(true);

    await expect(GET(callback(VICTIM_TID))).rejects.toThrow(
      /redirect:.*tenant_taken/,
    );

    const [text] = rejectionAlerts()[0]!;
    expect(text).toContain(
      `(granted tenant belongs to another workspace; granted ${VICTIM_TID}, owner ${OTHER_TENANT_ID})`,
    );
  });

  it("alerts a workspace already bound to a different tenant", async () => {
    await seedState();
    verifyManagedConsent.mockResolvedValue(true);
    apiAccess.mockResolvedValue({
      user: { oid: OID, isDemo: false },
      tenant: { id: TENANT_ID, tid: OTHER_TID, isDemo: false },
      membership: { oid: OID, tenantId: TENANT_ID },
    });

    await expect(GET(callback(VICTIM_TID))).rejects.toThrow(
      /redirect:.*already_connected/,
    );

    const [text] = rejectionAlerts()[0]!;
    expect(text).toContain(
      `(workspace is bound to a different tenant; bound ${OTHER_TID}, granted ${VICTIM_TID})`,
    );
  });

  it("alerts an expired state", async () => {
    await seedState();
    await currentDb
      .update(schema.consentStates)
      .set({ createdAt: new Date(Date.now() - 16 * 60 * 1000) })
      .where(eq(schema.consentStates.state, STATE));

    await expect(GET(callback(VICTIM_TID))).rejects.toThrow(
      /redirect:.*expired_state/,
    );

    expect(rejectionAlerts()).toHaveLength(1);
    const [text, opts] = rejectionAlerts()[0]!;
    expect(text).toBe(
      `consent callback rejected: expired_state for workspace ${TENANT_ID} by \`admin@example.com\`, oid ${OID}`,
    );
    expect(opts).toEqual({
      key: `consent-callback:${TENANT_ID}:expired_state:`,
      cooldownMs: 15 * 60 * 1000,
    });
    expect(await stateUsed()).toBe(false);
  });

  it("stays silent for a missing or unknown state", async () => {
    await seedState();

    await expect(GET(callbackWith("tenant=x"))).rejects.toThrow(
      /redirect:.*missing_state/,
    );
    await expect(
      GET(callbackWith(`state=${crypto.randomUUID()}&admin_consent=True`)),
    ).rejects.toThrow(/redirect:.*invalid_state/);

    expect(notifyOps).not.toHaveBeenCalled();
  });

  it("stays silent when a consumed state is replayed", async () => {
    await seedState();
    verifyManagedConsent.mockResolvedValue(true);

    await expect(GET(callback(VICTIM_TID))).rejects.toThrow(
      /redirect:.*status=syncing/,
    );
    await expect(GET(callback(VICTIM_TID))).rejects.toThrow(
      /redirect:.*invalid_state/,
    );

    expect(rejectionAlerts()).toHaveLength(0);
  });

  it("stays silent for the loser of a concurrent duplicate callback", async () => {
    await seedState();
    // Both callbacks pass every pre-consume check before either consumes.
    verifyManagedConsent.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(true), 20)),
    );

    const results = await Promise.allSettled([
      GET(callback(VICTIM_TID)),
      GET(callback(VICTIM_TID)),
    ]);

    const redirects = results
      .map((r) => (r.status === "rejected" ? String(r.reason) : ""))
      .sort();
    expect(redirects).toEqual([
      expect.stringMatching(/error=invalid_state/),
      expect.stringMatching(/status=syncing/),
    ]);
    expect(verifyManagedConsent).toHaveBeenCalledTimes(2);
    expect(rejectionAlerts()).toHaveLength(0);
  });
});
