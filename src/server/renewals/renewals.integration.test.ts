import { and, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AccessContext, FeatureAccess } from "~/server/access";
import * as schema from "~/server/db/schema";
import { entitlementOf, type Plan } from "~/server/entitlement";
import { freshDb, seedTenant, type TestDb } from "~/server/mcp/testHarness";

/**
 * The renewal savings plan end to end on a real database: the loader's SQL,
 * the Free teaser against the Pro breakdown, the calendar export gate, the
 * plan settings and the contract plan fields. Only access is a fixture.
 */

let currentDb: TestDb;
let tenant: schema.TenantRow;
let member: { role: "viewer" | "admin" | "owner"; plan: Plan; isDemo: boolean };

vi.mock("server-only", () => ({}));
vi.mock("~/env", () => ({
  env: { NODE_ENV: "test", AUTH_SECRET: "test-secret-test-secret-test-secret" },
  byoConnectorEnabled: () => true,
  siteUrl: () => "https://licensemeter.test",
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// Routed through the tenant proxy like production, so queries inside
// withTenant() run on its transaction instead of waiting for the connection.
vi.mock("~/server/db", async () => {
  const { createTenantDb } = await import("~/server/db/tenant");
  return {
    db: createTenantDb(
      new Proxy(
        {},
        {
          get: (_t, prop) =>
            (currentDb as unknown as Record<string | symbol, unknown>)[prop],
        },
      ),
    ),
    schema,
  };
});

type PlanBody = {
  access: string;
  items?: unknown[];
  teaser?: Record<string, unknown>;
  upgrade?: string;
  summary: { next: string | null };
  bufferPct: number;
};

const RANK = { viewer: 0, admin: 1, owner: 2 } as const;

const entitlement = () =>
  member.plan === "free"
    ? entitlementOf({
        tenant: { isDemo: false },
        record: null,
        covered: true,
        billingEnabled: true,
        now: new Date(),
      })
    : entitlementOf({
        tenant: { isDemo: false },
        record: {
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

const context = (): AccessContext =>
  ({
    user: { oid: "user_1", tid: "", upn: "a@a.example", name: "A" },
    tenant: { ...tenant, isDemo: member.isDemo },
    membership: { id: "m1", role: member.role, email: "a@a.example" },
    entitlement: entitlement(),
    workspaces: [],
  }) as unknown as AccessContext;

vi.mock("~/server/access", () => ({
  apiAccess: async (minRole: keyof typeof RANK = "viewer") =>
    RANK[member.role] >= RANK[minRole] ? context() : null,
  apiFeatureAccess: async (
    feature: "renewalPlans",
    minRole: keyof typeof RANK = "viewer",
  ): Promise<FeatureAccess> => {
    if (RANK[member.role] < RANK[minRole])
      return { ctx: null, denied: "unauthorized" };
    return entitlement().features[feature]
      ? { ctx: context(), denied: null }
      : { ctx: null, denied: "featureRequired", feature, plan: "pro" };
  },
}));

const { loadRenewalPlan } = await import("./loadPlan");
const { GET: getPlan } = await import("~/app/api/renewals/plan/route");
const { GET: getIcs } = await import("~/app/api/renewals/[key]/ics/route");
const { setRenewalBuffer, setRenewalSkuTerm } =
  await import("~/app/app/(dash)/renewals/actions");
const { saveVendorRenewal } = await import("~/server/actions");
const { GET: getScript } = await import("~/app/api/export/remediation/route");

const E3 = "05e9a617-0261-4cee-bb44-138d3ef5d965";
const VISIO = "c5928f49-12ba-48f7-ada3-0d743a3601d5";
const inDays = (days: number) => new Date(Date.now() + days * 86_400_000);
const isoInDays = (days: number) => inDays(days).toISOString().slice(0, 10);

const seed = async () => {
  await currentDb.insert(schema.tenantSkus).values([
    {
      tenantId: tenant.id,
      skuId: E3,
      skuPartNumber: "SPE_E3",
      displayName: "Microsoft 365 E3",
      prepaidEnabled: 100,
      consumedUnits: 90,
      nextLifecycleAt: inDays(40),
    },
    {
      tenantId: tenant.id,
      skuId: VISIO,
      skuPartNumber: "VISIOCLIENT",
      displayName: "Visio Plan 2",
      prepaidEnabled: 10,
      consumedUnits: 10,
      nextLifecycleAt: inDays(200),
    },
  ]);
  await currentDb.insert(schema.priceBook).values([
    { tenantId: tenant.id, skuId: E3, monthlyPriceCents: 3_360 },
    { tenantId: tenant.id, skuId: VISIO, monthlyPriceCents: 1_400 },
  ]);
  const license = (skuId: string) => ({
    skuId,
    name: "x",
    monthlyPriceCents: 0,
  });
  await currentDb.insert(schema.findings).values([
    {
      tenantId: tenant.id,
      dedupeKey: "inactive|u1",
      rule: "inactive_90d",
      graphUserId: "u1",
      title: "Inactive",
      detail: { upn: "u1@x.example", licenses: [license(E3), license(VISIO)] },
    },
    {
      tenantId: tenant.id,
      dedupeKey: "never|u1",
      rule: "never_active",
      graphUserId: "u1",
      title: "Never active",
      detail: { upn: "u1@x.example", licenses: [license(E3)] },
    },
    {
      tenantId: tenant.id,
      dedupeKey: "disabled|u2",
      rule: "disabled_account_with_license",
      graphUserId: "u2",
      title: "Disabled",
      status: "acknowledged",
      detail: { upn: "u2@x.example", licenses: [license(E3)] },
    },
    {
      tenantId: tenant.id,
      dedupeKey: "inactive|u3",
      rule: "inactive_90d",
      graphUserId: "u3",
      title: "Resolved",
      status: "resolved",
      detail: { upn: "u3@x.example", licenses: [license(E3)] },
    },
  ]);
};

afterEach(async () => {
  await currentDb.$client.close();
});

beforeEach(async () => {
  currentDb = await freshDb();
  tenant = await seedTenant(currentDb, 1, { activitySignal: "full" });
  member = { role: "admin", plan: "pro", isDemo: false };
});

describe("loadRenewalPlan", () => {
  it("reads skus, prices and open findings into the plan", async () => {
    await seed();
    const plan = await loadRenewalPlan(tenant);
    const e3 = plan.items.find((i) => i.key === `sku-${E3}`)!;
    // u1 twice and u2 acknowledged count as two people; resolved u3 is out.
    expect(e3).toMatchObject({
      paidSeats: 100,
      unassignedSeats: 10,
      reclaimableSeats: 2,
      activeSeats: 88,
      recommendedSeats: 93,
      cutSeats: 7,
      annualSavingsCents: 7 * 3_360 * 12,
      estimate: false,
    });
    expect(
      plan.items.find((i) => i.key === `sku-${VISIO}`)?.reclaimableSeats,
    ).toBe(1);
  });

  it("treats concealed report names as a conservative estimate", async () => {
    await seed();
    const plan = await loadRenewalPlan({ ...tenant, concealedNames: true });
    expect(plan.summary.estimate).toBe(true);
  });

  it("plans linked SKUs once under their contract", async () => {
    await seed();
    await currentDb.insert(schema.vendorRenewals).values({
      tenantId: tenant.id,
      vendor: "Microsoft",
      contractName: "EA",
      renewalDate: isoInDays(60),
      noticeDays: 30,
      skuIds: [E3],
    });
    const plan = await loadRenewalPlan(tenant);
    expect(plan.items.map((i) => i.kind).sort()).toEqual([
      "contract",
      "subscription",
    ]);
    expect(plan.items.filter((i) => i.skuIds.includes(E3))).toHaveLength(1);
  });

  it("reads the stored monthly term and its opt-in", async () => {
    await seed();
    await currentDb.insert(schema.renewalSkuTerms).values({
      tenantId: tenant.id,
      skuId: E3,
      term: "monthly",
    });
    const plan = await loadRenewalPlan(tenant);
    expect(plan.items.find((i) => i.key === `sku-${E3}`)).toMatchObject({
      term: "monthly",
      alertsApply: false,
    });
  });
});

describe("GET /api/renewals/plan", () => {
  it("returns only the teaser on Free, computed from real data", async () => {
    await seed();
    member.plan = "free";
    const res = await getPlan();
    expect(res.status).toBe(200);
    const body = (await res.json()) as PlanBody;
    expect(body.access).toBe("teaser");
    expect(body.items).toBeUndefined();
    expect(body.teaser).toMatchObject({ actionable: 1, cutSeats: 7 });
    expect(body.upgrade).toBe("/app/billing?feature=renewalPlans");
    expect(JSON.stringify(body)).not.toMatch(/E3|Visio|sku-/);
  });

  it("returns the full breakdown with renewalPlans", async () => {
    await seed();
    const body = (await (await getPlan()).json()) as PlanBody;
    expect(body.access).toBe("full");
    expect(body.items).toHaveLength(2);
    expect(body.summary.next).toBe(`sku-${E3}`);
    expect(body.bufferPct).toBe(5);
  });

  it("refuses an unauthenticated caller", async () => {
    member.role = "viewer";
    const mod = await import("~/server/access");
    vi.spyOn(mod, "apiAccess").mockResolvedValueOnce(null);
    expect((await getPlan()).status).toBe(401);
  });
});

describe("GET /api/renewals/[key]/ics", () => {
  const call = (key: string) =>
    getIcs(new Request("https://x"), { params: Promise.resolve({ key }) });

  it("answers 402 without renewalPlans", async () => {
    await seed();
    member.plan = "free";
    const res = await call(`sku-${E3}`);
    expect(res.status).toBe(402);
    expect(((await res.json()) as { feature: string }).feature).toBe(
      "renewalPlans",
    );
  });

  it("returns one renewal as a calendar file and audits it", async () => {
    await seed();
    const res = await call(`sku-${E3}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe(
      "text/calendar; charset=utf-8",
    );
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="microsoft-365-e3.ics"',
    );
    const ics = await res.text();
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain(
      "SUMMARY:Decide Microsoft 365 E3 renewal: cut 7 seats",
    );
    const audits = await currentDb.query.auditLog.findMany({
      where: eq(schema.auditLog.action, "export_renewal_ics"),
    });
    expect(audits).toHaveLength(1);
  });

  it("exports every renewal with all and 404s unknown keys", async () => {
    await seed();
    const all = await call("all");
    expect((await all.text()).match(/BEGIN:VEVENT/g)).toHaveLength(4);
    expect((await call("sku-nope")).status).toBe(404);
    expect((await call("../../etc")).status).toBe(404);
  });
});

describe("plan settings", () => {
  it("saves the buffer for Pro admins and audits the change", async () => {
    expect(await setRenewalBuffer(12)).toEqual({ ok: true });
    const row = await currentDb.query.tenants.findFirst({
      where: eq(schema.tenants.id, tenant.id),
    });
    expect(row?.renewalBufferPct).toBe(12);
    const audit = await currentDb.query.auditLog.findFirst({
      where: eq(schema.auditLog.action, "renewal_buffer_changed"),
    });
    expect(audit?.detail).toEqual({ from: 5, to: 12 });
  });

  it("rejects buffers outside 0..50 and non-integers", async () => {
    for (const bad of [-1, 51, 2.5, "10", null]) {
      expect((await setRenewalBuffer(bad)).ok).toBe(false);
    }
  });

  it("refuses Free, viewers and the demo workspace", async () => {
    member.plan = "free";
    expect((await setRenewalBuffer(10)).error).toMatch(/included in Pro/);
    member = { role: "viewer", plan: "pro", isDemo: false };
    expect((await setRenewalBuffer(10)).ok).toBe(false);
    member = { role: "admin", plan: "pro", isDemo: true };
    expect((await setRenewalBuffer(10)).error).toMatch(/read-only/);
  });

  it("stores a monthly term, its opt-in, and annual as no row", async () => {
    await seed();
    const termRow = () =>
      currentDb.query.renewalSkuTerms.findFirst({
        where: and(
          eq(schema.renewalSkuTerms.tenantId, tenant.id),
          eq(schema.renewalSkuTerms.skuId, E3),
        ),
      });
    expect((await setRenewalSkuTerm(E3, "monthly")).ok).toBe(true);
    expect(await termRow()).toMatchObject({
      term: "monthly",
      monthlyAlerts: false,
    });
    expect((await setRenewalSkuTerm(E3, "monthly_alerts")).ok).toBe(true);
    expect(await termRow()).toMatchObject({
      term: "monthly",
      monthlyAlerts: true,
    });
    expect((await setRenewalSkuTerm(E3, "annual")).ok).toBe(true);
    expect(await termRow()).toBeUndefined();
    expect(
      await currentDb.query.auditLog.findMany({
        where: eq(schema.auditLog.action, "renewal_sku_term_changed"),
      }),
    ).toHaveLength(3);
  });

  it("rejects unknown SKUs and choices", async () => {
    await seed();
    expect((await setRenewalSkuTerm("not-a-sku", "monthly")).ok).toBe(false);
    expect((await setRenewalSkuTerm(E3, "quarterly")).ok).toBe(false);
  });
});

describe("saveVendorRenewal plan fields", () => {
  const form = (fields: Record<string, string | string[]>) => {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      for (const v of [value].flat()) data.append(key, v);
    }
    return data;
  };
  const base = {
    vendor: "Microsoft",
    contractName: "EA",
    renewalDate: isoInDays(60),
    noticeDays: "30",
    annualValue: "0",
  };
  const stored = () =>
    currentDb.query.vendorRenewals.findFirst({
      where: eq(schema.vendorRenewals.tenantId, tenant.id),
    });

  it("saves linked SKUs and target seats with renewalPlans", async () => {
    await seed();
    const result = await saveVendorRenewal(
      form({ ...base, skuIds: [E3, VISIO, E3], targetSeats: "80" }),
    );
    expect(result).toEqual({ ok: true });
    expect(await stored()).toMatchObject({
      skuIds: [E3, VISIO],
      targetSeats: 80,
    });
  });

  it("rejects SKUs from outside the workspace and bad targets", async () => {
    await seed();
    expect(
      (await saveVendorRenewal(form({ ...base, skuIds: ["other-sku"] }))).ok,
    ).toBe(false);
    expect(
      (await saveVendorRenewal(form({ ...base, targetSeats: "-1" }))).ok,
    ).toBe(false);
    expect(
      (await saveVendorRenewal(form({ ...base, targetSeats: "1.5" }))).ok,
    ).toBe(false);
    // Never truncated into a smaller valid number.
    expect(
      (await saveVendorRenewal(form({ ...base, targetSeats: "10000000" }))).ok,
    ).toBe(false);
    expect(
      (await saveVendorRenewal(form({ ...base, targetSeats: "1000000.5" }))).ok,
    ).toBe(false);
  });

  it("keeps stored plan fields when a Free workspace edits the contract", async () => {
    await seed();
    await saveVendorRenewal(form({ ...base, skuIds: [E3], targetSeats: "80" }));
    const row = await stored();
    member.plan = "free";
    const result = await saveVendorRenewal(
      form({ ...base, id: row!.id, contractName: "EA renamed" }),
    );
    expect(result).toEqual({ ok: true });
    expect(await stored()).toMatchObject({
      contractName: "EA renamed",
      skuIds: [E3],
      targetSeats: 80,
    });
  });

  it("clears the plan fields when a Pro admin unlinks everything", async () => {
    await seed();
    await saveVendorRenewal(form({ ...base, skuIds: [E3], targetSeats: "80" }));
    const row = await stored();
    await saveVendorRenewal(form({ ...base, id: row!.id, targetSeats: "" }));
    expect(await stored()).toMatchObject({ skuIds: [], targetSeats: null });
  });
});

describe("GET /api/export/remediation?sku=", () => {
  const call = (query: string) =>
    getScript(
      new NextRequest(
        `https://licensemeter.test/api/export/remediation${query}`,
      ),
    );

  it("refuses a malformed SKU instead of exporting the whole tenant", async () => {
    await seed();
    expect((await call("?sku=05e9a617")).status).toBe(400);
    expect((await call("?sku=x'; rm")).status).toBe(400);
  });

  it("limits the script to one SKU, whatever the id's case", async () => {
    await seed();
    const res = await call(`?sku=${VISIO.toUpperCase()}`);
    expect(res.status).toBe(200);
    const script = await res.text();
    expect(script).toContain(`@('${VISIO}')`);
    expect(script).not.toContain(E3);
  });
});
