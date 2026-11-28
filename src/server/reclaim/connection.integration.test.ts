import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AccessContext } from "~/server/access";
import { decryptSecret } from "~/server/crypto";
import * as schema from "~/server/db/schema";
import { entitlementOf } from "~/server/entitlement";
import { freshDb, seedTenant, type TestDb } from "~/server/mcp/testHarness";
import type * as GraphModule from "./graph";
import { ReclaimError, type ReclaimCredential } from "./graph";

/**
 * The reclaim connection against a real database: who may grant, change and
 * remove write access, and what the consent callback accepts. Only the access
 * layer and the Microsoft token check are fixtures.
 */

const TID = "11111111-2222-3333-4444-555555555555";
const APP = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const CONNECTOR_APP = "99999999-8888-7777-6666-555555555555";

let currentDb: TestDb;
let tenant: schema.TenantRow;
let member: {
  role: "viewer" | "admin" | "owner";
  isDemo: boolean;
  plan: "free" | "pro";
};

vi.mock("~/env", () => ({
  env: {
    NODE_ENV: "test",
    AUTH_SECRET: "test-secret-test-secret-test-secret",
    CONNECTOR_CLIENT_ID: "99999999-8888-7777-6666-555555555555",
    RECLAIM_CLIENT_ID: "12121212-3434-5656-7878-909090909090",
    RECLAIM_CLIENT_SECRET: "managed-secret",
  },
  byoConnectorEnabled: () => true,
  appBaseUrl: () => "https://licensemeter.test",
  siteUrl: () => "https://licensemeter.test",
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

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

vi.mock("~/server/rateLimit", () => ({
  rateLimitDurable: () => Promise.resolve(true),
}));

const verifyMock = vi.fn((_cred: ReclaimCredential, _waits?: number[]) =>
  Promise.resolve(),
);
vi.mock("./graph", async (original) => ({
  ...(await original<typeof GraphModule>()),
  verifyReclaimCredential: (cred: ReclaimCredential, waits?: number[]) =>
    verifyMock(cred, waits),
}));

const RANK = { viewer: 0, admin: 1, owner: 2 } as const;

const context = () =>
  ({
    user: {
      oid: "user_1",
      tid: TID,
      upn: "a@a.example",
      name: "A",
      isDemo: member.isDemo,
    },
    tenant: { ...tenant, isDemo: member.isDemo },
    membership: { id: "m1", role: member.role, email: "a@a.example" },
    workspaces: [],
    entitlement: entitlementOf({
      tenant: { isDemo: false },
      record:
        member.plan === "pro"
          ? {
              plan: "pro",
              source: "polar",
              status: "active",
              trialEnd: null,
              currentPeriodEnd: new Date(Date.now() + 86_400_000),
              cancelAtPeriodEnd: false,
            }
          : null,
      covered: true,
      billingEnabled: true,
      now: new Date(),
    }),
  }) as unknown as AccessContext;

vi.mock("~/server/access", () => ({
  apiAccess: async (minRole: keyof typeof RANK) =>
    RANK[member.role] >= RANK[minRole] ? context() : null,
  apiFeatureAccess: async (feature: "reclaim", minRole: keyof typeof RANK) => {
    if (RANK[member.role] < RANK[minRole])
      return { ctx: null, denied: "unauthorized" };
    const ctx = context();
    if (!ctx.entitlement.features[feature])
      return { ctx: null, denied: "featureRequired", feature, plan: "pro" };
    return { ctx, denied: null };
  },
}));

const {
  connectReclaimByo,
  disconnectReclaim,
  setReclaimApprovalMode,
  verifyReclaimConsent,
} = await import("~/app/app/(dash)/reclaim/actions");
const { GET: callback } =
  await import("~/app/api/connect/reclaim/callback/route");

const byoForm = (overrides: Record<string, string> = {}) => {
  const data = new FormData();
  data.set("appClientId", APP);
  data.set("credType", "secret");
  data.set("secret", "s3cret-value");
  for (const [k, v] of Object.entries(overrides)) data.set(k, v);
  return data;
};

const row = () =>
  currentDb.query.reclaimConnections.findFirst({
    where: eq(schema.reclaimConnections.tenantId, tenant.id),
  });

const audits = async () =>
  (await currentDb.query.auditLog.findMany()).map((a) => a.action);

beforeEach(async () => {
  currentDb = await freshDb();
  tenant = await seedTenant(currentDb, 1, { tid: TID });
  member = { role: "owner", isDemo: false, plan: "pro" };
  verifyMock.mockReset();
  verifyMock.mockResolvedValue(undefined);
});

describe("connectReclaimByo", () => {
  it("stores the encrypted secret only after the token check passes", async () => {
    expect(await connectReclaimByo(byoForm())).toEqual({ ok: true });
    const stored = await row();
    expect(stored).toMatchObject({
      mode: "byo",
      tid: TID,
      appClientId: APP,
      credType: "secret",
      approvalMode: "two_person",
    });
    expect(stored?.consentedAt).toBeInstanceOf(Date);
    expect(stored?.secretEnc).not.toContain("s3cret-value");
    expect(
      decryptSecret(stored!.secretEnc!, `${tenant.id}:reclaim:secretEnc`),
    ).toBe("s3cret-value");
    expect(verifyMock.mock.calls[0]?.[0]).toMatchObject({
      mode: "byo",
      tid: TID,
      clientId: APP,
    });
    expect(await audits()).toEqual(["reclaim_connected"]);
  });

  it("stores nothing when Microsoft refuses the app", async () => {
    verifyMock.mockRejectedValue(
      new ReclaimError("extra", ["User.ReadWrite.All"]),
    );
    const res = await connectReclaimByo(byoForm());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("User.ReadWrite.All");
    expect(await row()).toBeUndefined();
  });

  it("refuses the connector, sign-in or metering app", async () => {
    const res = await connectReclaimByo(
      byoForm({ appClientId: CONNECTOR_APP }),
    );
    expect(res.ok).toBe(false);
    await currentDb.insert(schema.msConnections).values({
      tenantId: tenant.id,
      mode: "byo",
      tid: TID,
      appClientId: APP,
      credType: "secret",
      secretEnc: "enc",
    });
    expect((await connectReclaimByo(byoForm())).ok).toBe(false);
    expect(verifyMock).not.toHaveBeenCalled();
    expect(await row()).toBeUndefined();
  });

  it("is for Owners on a plan with reclaim, outside the demo", async () => {
    member.role = "admin";
    expect((await connectReclaimByo(byoForm())).ok).toBe(false);
    member = { role: "owner", isDemo: false, plan: "free" };
    expect((await connectReclaimByo(byoForm())).ok).toBe(false);
    member = { role: "owner", isDemo: true, plan: "pro" };
    expect((await connectReclaimByo(byoForm())).ok).toBe(false);
    expect(verifyMock).not.toHaveBeenCalled();
    expect(await row()).toBeUndefined();
  });

  it("needs a connected Microsoft tenant", async () => {
    await currentDb
      .update(schema.tenants)
      .set({ tid: null })
      .where(eq(schema.tenants.id, tenant.id));
    tenant = { ...tenant, tid: null };
    expect((await connectReclaimByo(byoForm())).ok).toBe(false);
  });
});

describe("approval mode and disconnect", () => {
  beforeEach(async () => {
    await connectReclaimByo(byoForm());
  });

  it("lets only an Owner change the approval rule, with an audit entry", async () => {
    member.role = "admin";
    expect((await setReclaimApprovalMode("single_admin")).ok).toBe(false);
    member.role = "owner";
    expect(await setReclaimApprovalMode("single_admin")).toEqual({ ok: true });
    expect((await row())?.approvalMode).toBe("single_admin");
    expect((await setReclaimApprovalMode("anyone" as "two_person")).ok).toBe(
      false,
    );
    expect(await audits()).toContain("reclaim_approval_mode_changed");
  });

  it("lets an Admin remove write access, also after a downgrade", async () => {
    member = { role: "viewer", isDemo: false, plan: "pro" };
    expect((await disconnectReclaim()).ok).toBe(false);
    member = { role: "admin", isDemo: false, plan: "free" };
    expect(await disconnectReclaim()).toEqual({ ok: true });
    expect(await row()).toBeUndefined();
    expect(await audits()).toContain("reclaim_disconnected");
  });
});

describe("managed consent callback", () => {
  const seedManaged = async () => {
    const [connection] = await currentDb
      .insert(schema.reclaimConnections)
      .values({ tenantId: tenant.id, mode: "managed", tid: TID })
      .returning();
    const state = crypto.randomUUID();
    await currentDb.insert(schema.reclaimConsentStates).values({
      state,
      tenantId: tenant.id,
      connectionId: connection!.id,
      oid: "user_1",
      tid: TID,
    });
    return state;
  };
  const call = (params: Record<string, string>) =>
    callback({
      nextUrl: new URL(
        `https://licensemeter.test/api/connect/reclaim/callback?${new URLSearchParams(params)}`,
      ),
    } as never);

  it("connects once the token proves consent, and consumes the state", async () => {
    const state = await seedManaged();
    const res = await call({ state, tenant: TID, admin_consent: "True" });
    expect(res.headers.get("location")).toContain("connected=1");
    expect((await row())?.consentedAt).toBeInstanceOf(Date);
    expect(verifyMock.mock.calls[0]?.[0]).toEqual({
      mode: "managed",
      tid: TID,
    });
    expect(await currentDb.query.reclaimConsentStates.findMany()).toEqual([]);
    const again = await call({ state, tenant: TID, admin_consent: "True" });
    expect(again.headers.get("location")).toContain("error=invalid_state");
  });

  it("refuses another tenant without asking Microsoft", async () => {
    const state = await seedManaged();
    const res = await call({
      state,
      tenant: "00000000-0000-0000-0000-000000000000",
      admin_consent: "True",
    });
    expect(res.headers.get("location")).toContain("error=wrong_tenant");
    expect(verifyMock).not.toHaveBeenCalled();
    expect((await row())?.consentedAt).toBeNull();
  });

  it("keeps the connection unverified when the token lacks the permission", async () => {
    verifyMock.mockRejectedValue(new ReclaimError("consent"));
    const state = await seedManaged();
    const res = await call({ state, tenant: TID, admin_consent: "True" });
    expect(res.headers.get("location")).toContain("error=consent");
    expect(await row()).toMatchObject({
      consentedAt: null,
      lastVerifyError: "consent",
    });
  });

  it("is bound to the Owner who started it", async () => {
    const state = await seedManaged();
    member.role = "admin";
    const res = await call({ state, tenant: TID, admin_consent: "True" });
    expect(res.headers.get("location")).toContain("error=owner_required");
    expect(verifyMock).not.toHaveBeenCalled();
  });

  it("can be finished later with Verify consent", async () => {
    await seedManaged();
    expect(await verifyReclaimConsent()).toEqual({ ok: true });
    expect((await row())?.consentedAt).toBeInstanceOf(Date);
    expect(await audits()).toEqual(["reclaim_connected"]);
  });
});
