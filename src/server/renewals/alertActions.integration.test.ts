import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AccessContext } from "~/server/access";
import * as schema from "~/server/db/schema";
import { entitlementOf, type Plan } from "~/server/entitlement";
import { freshDb, seedTenant, type TestDb } from "~/server/mcp/testHarness";

/**
 * Who may switch renewal reminders on and off: the workspace switch, the
 * personal switch and the shared address switch. The real guards of
 * ~/server/actions run against a real database; only access is a fixture.
 */

let currentDb: TestDb;
let tenant: schema.TenantRow;
let member: {
  id: string;
  role: "viewer" | "admin" | "owner";
  plan: Plan;
  isDemo: boolean;
};

vi.mock("~/env", () => ({
  env: { NODE_ENV: "test", AUTH_SECRET: "test-secret-test-secret-test-secret" },
  byoConnectorEnabled: () => true,
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
vi.mock("~/server/exchangeRates", () => ({
  fetchEcbReferenceRates: vi.fn(() =>
    Promise.resolve({ asOf: "2026-07-09", perEur: { EUR: 1 } }),
  ),
}));

const RANK = { viewer: 0, admin: 1, owner: 2 } as const;

const entitlement = () =>
  entitlementOf({
    tenant: { isDemo: false },
    record:
      member.plan === "free"
        ? null
        : {
            plan: member.plan,
            source: "polar",
            status: "active",
            trialEnd: null,
            currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
            cancelAtPeriodEnd: false,
          },
    covered: true,
    billingEnabled: true,
    now: new Date(),
  });

vi.mock("~/server/access", () => ({
  apiAccess: async (minRole: keyof typeof RANK) =>
    RANK[member.role] >= RANK[minRole]
      ? ({
          user: { oid: "user_1", tid: "", upn: "a@a.example", name: "A" },
          tenant: { ...tenant, isDemo: member.isDemo },
          membership: {
            id: member.id,
            role: member.role,
            email: "a@a.example",
          },
          entitlement: entitlement(),
          workspaces: [],
        } as unknown as AccessContext)
      : null,
}));

const {
  setMyEmailPreference,
  setNotificationAddressPreference,
  setRenewalAlerts,
} = await import("~/server/actions");

const tenantRow = () =>
  currentDb.query.tenants.findFirst({
    where: eq(schema.tenants.id, tenant.id),
  });
const membershipRow = () =>
  currentDb.query.memberships.findFirst({
    where: eq(schema.memberships.id, member.id),
  });
const sharedRow = () =>
  currentDb.query.notificationAddresses.findFirst({
    where: eq(schema.notificationAddresses.tenantId, tenant.id),
  });

beforeEach(async () => {
  currentDb = await freshDb();
  tenant = await seedTenant(currentDb, 1);
  const [m] = await currentDb
    .insert(schema.memberships)
    .values({
      tenantId: tenant.id,
      email: "a@a.example",
      oid: "user_1",
      role: "admin",
    })
    .returning();
  await currentDb.insert(schema.notificationAddresses).values({
    tenantId: tenant.id,
    email: "team@a.example",
    verifiedAt: new Date(),
  });
  member = { id: m!.id, role: "admin", plan: "pro", isDemo: false };
});

describe("setRenewalAlerts", () => {
  it("lets an admin on Pro turn the workspace switch off and on, audited", async () => {
    expect(await setRenewalAlerts(false)).toEqual({ ok: true });
    expect((await tenantRow())?.renewalAlerts).toBe(false);
    expect(await setRenewalAlerts(true)).toEqual({ ok: true });
    expect((await tenantRow())?.renewalAlerts).toBe(true);
    const entries = await currentDb.query.auditLog.findMany();
    expect(entries.map((e) => [e.action, e.detail])).toEqual([
      ["renewal_alerts_changed", { enabled: false }],
      ["renewal_alerts_changed", { enabled: true }],
    ]);
  });

  it("refuses viewers, the demo workspace and non-boolean input", async () => {
    member.role = "viewer";
    expect((await setRenewalAlerts(false)).ok).toBe(false);
    member.role = "admin";
    member.isDemo = true;
    expect((await setRenewalAlerts(false)).ok).toBe(false);
    member.isDemo = false;
    expect((await setRenewalAlerts("false" as unknown as boolean)).ok).toBe(
      false,
    );
    expect((await tenantRow())?.renewalAlerts).toBe(true);
  });

  it("on Free, refuses switching on but still allows switching off", async () => {
    member.plan = "free";
    expect(await setRenewalAlerts(false)).toEqual({ ok: true });
    const refused = await setRenewalAlerts(true);
    expect(refused.ok).toBe(false);
    expect(refused.error).toContain("Pro");
    expect((await tenantRow())?.renewalAlerts).toBe(false);
  });
});

describe("personal and shared renewal switches", () => {
  it("sets only the caller's own renewal opt-out", async () => {
    expect(await setMyEmailPreference("renewal", false)).toEqual({ ok: true });
    expect(await membershipRow()).toMatchObject({
      renewalOptOut: true,
      digestOptOut: false,
      reportOptOut: false,
    });
    expect(await setMyEmailPreference("renewal", true)).toEqual({ ok: true });
    expect((await membershipRow())?.renewalOptOut).toBe(false);
  });

  it("sets only the shared address's renewal switch", async () => {
    expect(await setNotificationAddressPreference("renewal", false)).toEqual({
      ok: true,
    });
    expect(await sharedRow()).toMatchObject({
      renewalAlerts: false,
      digest: true,
      report: true,
      leakAlerts: true,
    });
  });

  it("on Free, both refuse switching on and allow switching off", async () => {
    member.plan = "free";
    expect((await setMyEmailPreference("renewal", false)).ok).toBe(true);
    expect((await setMyEmailPreference("renewal", true)).ok).toBe(false);
    expect((await membershipRow())?.renewalOptOut).toBe(true);
    expect((await setNotificationAddressPreference("renewal", false)).ok).toBe(
      true,
    );
    expect((await setNotificationAddressPreference("renewal", true)).ok).toBe(
      false,
    );
    expect((await sharedRow())?.renewalAlerts).toBe(false);
    // The other emails are not part of the plan gate.
    expect((await setMyEmailPreference("digest", true)).ok).toBe(true);
  });
});
