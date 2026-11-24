import { PGlite } from "@electric-sql/pglite";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

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
const HANDOFF = "handoff.55555555-5555-4555-8555-00000000000e";
const STATE = "55555555-5555-5555-5555-00000000000e";

const client = new PGlite();
const currentDb = drizzle(client, { schema });
const apiAccess = vi.fn();
const auth = vi.fn();
const verifyManagedConsent = vi.fn();
const notifyOps = vi.fn<(text: string, opts?: unknown) => Promise<void>>();
const runSync = vi.fn();
const setCookie = vi.fn();
const readHandoffProof = vi.fn();
const after = vi.fn<(task: () => Promise<void>) => void>();

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
vi.mock("~/server/db", () => ({ db: currentDb, schema }));
vi.mock("~/server/access", () => ({
  apiAccess,
  WORKSPACE_COOKIE: "lm_ws",
  workspaceCookieOptions: () => ({}),
}));
vi.mock("~/server/auth/consentHandoff", () => ({
  handoffFailurePath: (code: string) => `/connect/approve/error?error=${code}`,
  readHandoffProof,
}));
vi.mock("~/server/auth", () => ({ auth }));
vi.mock("~/server/graph/msGraph", () => ({ verifyManagedConsent }));
vi.mock("~/server/ops", () => ({ notifyOps }));
vi.mock("~/server/sync/runSync", () => ({ runSync }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: setCookie }),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));
vi.mock("next/server", () => ({ after }));

const { GET } = await import("./route");

const callback = (tid: string, state = STATE) =>
  ({
    nextUrl: new URL(
      `http://localhost/api/connect/callback?state=${state}&tenant=${tid}&admin_consent=True`,
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

beforeAll(async () => {
  const ddl = await generateMigration(
    generateDrizzleJson({}),
    generateDrizzleJson(schema),
  );
  for (const stmt of ddl) await client.exec(stmt);
});

beforeEach(async () => {
  await currentDb.delete(schema.tenants);
  await currentDb.delete(schema.consentStates);
  vi.clearAllMocks();
  readHandoffProof.mockResolvedValue({
    phase: "grant",
    token: HANDOFF,
    tid: VICTIM_TID,
  });
  env.CONNECTOR_CLIENT_SECRET = "connector-client-secret";
  auth.mockResolvedValue({ user: { oid: OID, tid: HOME_TID, isDemo: false } });
  apiAccess.mockResolvedValue({
    user: { oid: OID, isDemo: false },
    tenant: { id: TENANT_ID, tid: null, isDemo: false },
    membership: { oid: OID, tenantId: TENANT_ID },
  });
});

afterAll(async () => client.close());

describe("admin consent handoff", () => {
  const seedHandoff = async (
    values: Partial<typeof schema.consentStates.$inferInsert> = {},
  ) => {
    await currentDb
      .insert(schema.tenants)
      .values({ id: TENANT_ID, name: "Contoso Test" });
    await currentDb.insert(schema.consentStates).values({
      state: HANDOFF,
      tenantId: TENANT_ID,
      oid: OID,
      tid: HOME_TID,
      kind: "handoff",
      email: "alex@example.com",
      name: "Alex Rivera",
      createdAt: new Date(Date.now() - 6 * 86_400_000),
      ...values,
    });
    verifyManagedConsent.mockResolvedValue(true);
  };

  it("binds once, redirects publicly, and schedules first sync without an app session or cookie", async () => {
    await seedHandoff();
    await expect(GET(callback(VICTIM_TID, HANDOFF))).rejects.toThrow(
      "redirect:/connect/approve/complete",
    );
    expect(auth).not.toHaveBeenCalled();
    expect(apiAccess).not.toHaveBeenCalled();
    expect(setCookie).not.toHaveBeenCalled();
    expect(verifyManagedConsent).toHaveBeenCalledWith(
      VICTIM_TID,
      expect.any(Number),
    );
    expect(await currentDb.query.tenants.findFirst()).toMatchObject({
      id: TENANT_ID,
      tid: VICTIM_TID,
    });
    expect(await currentDb.query.msConnections.findFirst()).toMatchObject({
      tenantId: TENANT_ID,
      mode: "managed",
      tid: VICTIM_TID,
    });
    expect(
      (await currentDb.query.consentStates.findFirst())?.usedAt,
    ).toBeInstanceOf(Date);
    expect(notifyOps).toHaveBeenCalledWith(
      expect.stringContaining(`workspace ${TENANT_ID} completed`),
      { logLevel: "info" },
    );

    await expect(GET(callback(VICTIM_TID, HANDOFF))).rejects.toThrow(
      "redirect:/connect/approve/error?error=invalid_state",
    );
    expect(after).toHaveBeenCalledTimes(1);
    await after.mock.calls[0]![0]();
    expect(runSync).toHaveBeenCalledWith(TENANT_ID, {
      deadline: expect.any(Number) as number,
    });
  });

  it.each([
    ["expired_state", { createdAt: new Date(Date.now() - 8 * 86_400_000) }],
    ["invalid_state", { usedAt: new Date() }],
    ["invalid_state", { kind: "self" as const }],
  ])("rejects %s before checking Microsoft", async (code, values) => {
    await seedHandoff(values);
    await expect(GET(callback(VICTIM_TID, HANDOFF))).rejects.toThrow(
      `redirect:/connect/approve/error?error=${code}`,
    );
    expect(verifyManagedConsent).not.toHaveBeenCalled();
  });

  it("refuses a handoff when the managed app is unavailable", async () => {
    await seedHandoff();
    env.CONNECTOR_CLIENT_SECRET = undefined;
    await expect(GET(callback(HOME_TID, HANDOFF))).rejects.toThrow(
      "redirect:/connect/approve/error?error=not_configured",
    );
    expect(verifyManagedConsent).not.toHaveBeenCalled();
  });

  it.each([
    null,
    { phase: "grant", token: HANDOFF, tid: HOME_TID },
    { phase: "grant", token: STATE, tid: VICTIM_TID },
  ])(
    "refuses an absent or mismatched tenant admin proof (%j)",
    async (proof) => {
      await seedHandoff();
      readHandoffProof.mockResolvedValue(proof);
      await expect(GET(callback(VICTIM_TID, HANDOFF))).rejects.toThrow(
        "redirect:/connect/approve/error?error=approval_identity",
      );
      expect(verifyManagedConsent).not.toHaveBeenCalled();
    },
  );

  it("requires app-only consent proof even after tenant admin verification", async () => {
    await seedHandoff();
    verifyManagedConsent.mockResolvedValue(false);
    await expect(GET(callback(VICTIM_TID, HANDOFF))).rejects.toThrow(
      "redirect:/connect/approve/error?error=consent_not_granted",
    );
    expect(await currentDb.query.consentStates.findFirst()).toMatchObject({
      usedAt: null,
    });
  });

  it("leaves a declined handoff unused and returns a public failure", async () => {
    await seedHandoff();
    await expect(
      GET(callbackWith(`state=${HANDOFF}&error=access_denied`)),
    ).rejects.toThrow("redirect:/connect/approve/error?error=consent_declined");
    expect(await currentDb.query.consentStates.findFirst()).toMatchObject({
      usedAt: null,
    });
  });

  it("refuses to take a tenant from another workspace", async () => {
    await seedHandoff();
    await currentDb
      .insert(schema.tenants)
      .values({ tid: VICTIM_TID, name: "Other Test" });
    await expect(GET(callback(VICTIM_TID, HANDOFF))).rejects.toThrow(
      "redirect:/connect/approve/error?error=tenant_taken",
    );
    expect(await currentDb.query.consentStates.findFirst()).toMatchObject({
      usedAt: null,
    });
  });

  it.each(["tid", "connection"])(
    "refuses to replace an existing %s",
    async (binding) => {
      await seedHandoff();
      if (binding === "tid") {
        await currentDb.update(schema.tenants).set({ tid: VICTIM_TID });
      } else {
        await currentDb
          .insert(schema.msConnections)
          .values({ tenantId: TENANT_ID, tid: HOME_TID, mode: "managed" });
      }
      await expect(GET(callback(VICTIM_TID, HANDOFF))).rejects.toThrow(
        "redirect:/connect/approve/error?error=already_connected",
      );
      expect(await currentDb.query.consentStates.findFirst()).toMatchObject({
        usedAt: null,
      });
    },
  );

  it("runs first sync once when two handoff callbacks arrive together", async () => {
    await seedHandoff();
    const responses = await Promise.allSettled([
      GET(callback(VICTIM_TID, HANDOFF)),
      GET(callback(VICTIM_TID, HANDOFF)),
    ]);
    const redirects = responses.map((result) =>
      result.status === "rejected" ? String(result.reason) : "",
    );
    expect(
      redirects.filter((url) => url.endsWith("/connect/approve/complete")),
    ).toHaveLength(1);
    expect(
      redirects.filter((url) =>
        /error=(invalid_state|already_connected)$/.test(url),
      ),
    ).toHaveLength(1);
    expect(after).toHaveBeenCalledTimes(1);
  });

  it("keeps the legacy self callback live when the kind column is absent", async () => {
    await seedState();
    await currentDb.execute(sql`alter table consent_states drop column kind`);
    try {
      verifyManagedConsent.mockResolvedValue(true);
      await expect(GET(callback(VICTIM_TID))).rejects.toThrow(
        "redirect:/app/connectors/microsoft?status=syncing",
      );
      expect(await currentDb.query.tenants.findFirst()).toMatchObject({
        tid: VICTIM_TID,
      });
    } finally {
      await currentDb.execute(
        sql`alter table consent_states add column kind text not null default 'self'`,
      );
    }
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

  it("alerts the code, workspace and granted tenant without naming the initiator", async () => {
    await seedState();
    verifyManagedConsent.mockResolvedValue(false);

    await expect(GET(callback(VICTIM_TID))).rejects.toThrow(
      /redirect:.*consent_not_granted/,
    );

    expect(rejectionAlerts()).toHaveLength(1);
    const [text, opts] = rejectionAlerts()[0]!;
    expect(text).toBe(
      `consent callback rejected: consent_not_granted for workspace ${TENANT_ID} (no app-only token for the granted tenant; granted ${VICTIM_TID})`,
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
      `consent callback rejected: consent_declined for workspace ${TENANT_ID} (Microsoft: access_denied AADSTS65004)`,
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

  it("reports a code-like error outside the known codes as unrecognized", async () => {
    await seedState();

    await expect(
      GET(callbackWith(`state=${STATE}&error=alex_example`)),
    ).rejects.toThrow(/redirect:.*consent_declined/);

    const [text] = rejectionAlerts()[0]!;
    expect(text).toContain("(Microsoft: unrecognized error)");
    expect(JSON.stringify(rejectionAlerts())).not.toContain("alex");
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
    "jane_contoso.com#EXT#@fabrikam.onmicrosoft.com",
  ])("never names the initiator, even as %j", async (email) => {
    await seedState(email);

    await expect(
      GET(callbackWith(`state=${STATE}&error=access_denied`)),
    ).rejects.toThrow(/redirect:.*consent_declined/);

    const [text, opts] = rejectionAlerts()[0]!;
    expect(text).not.toContain(email);
    expect(text).not.toContain(OID);
    expect(text).not.toContain(" by ");
    expect(JSON.stringify(opts)).not.toContain(email);
    expect(text).not.toMatch(/[\r\n<>[\]`]/);
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
    expect(text).toContain("for workspace unknown (");
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
    expect(text).toBe(
      `consent callback rejected: not_allowed for workspace ${TENANT_ID} (${why})`,
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
      `consent callback rejected: expired_state for workspace ${TENANT_ID}`,
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
