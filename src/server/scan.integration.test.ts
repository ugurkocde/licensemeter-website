import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "~/server/db";
import * as schema from "~/server/db/schema";
import { provisionForSignIn } from "~/server/domainJoin";

/**
 * Instant-scan workspace resolution against a real Drizzle/PGlite database
 * (fresh per test, schema generated from the Drizzle definitions), so the
 * partial unique index on tenants.tid and the guarded update run with genuine
 * Postgres semantics. The scan itself (Graph client, sync) is not exercised.
 */

let currentDb: Db;

vi.mock("~/server/db", () => {
  const proxy = new Proxy(
    {},
    {
      get: (_t, prop) =>
        (currentDb as unknown as Record<string | symbol, unknown>)[prop],
    },
  );
  return { db: proxy, schema };
});
vi.mock("~/server/graph/msGraph", () => ({ DelegatedGraphClient: class {} }));
vi.mock("~/server/sync/runSync", () => ({ runSync: vi.fn() }));

const { resolveScanTenant } = await import("~/server/scan");

let cachedDdl: string[] | null = null;
const schemaDdl = async (): Promise<string[]> => {
  cachedDdl ??= await generateMigration(
    generateDrizzleJson({}),
    generateDrizzleJson(schema),
  );
  return cachedDdl;
};

beforeEach(async () => {
  const client = new PGlite();
  for (const stmt of await schemaDdl()) await client.exec(stmt);
  currentDb = drizzle(client, { schema }) as unknown as Db;
});

const ACME_TID = "aaaaaaaa-0000-4000-8000-000000000001";
const OTHER_TID = "bbbbbbbb-0000-4000-8000-000000000002";
const OWNER_OID = "00000000-0000-4000-8000-0000000000a1";
const CASEY_OID = "00000000-0000-4000-8000-0000000000c1";

const scanAs = (oid: string, upn: string, tid = ACME_TID) =>
  resolveScanTenant({
    ms: { tid, upn, name: null, email: upn },
    actor: { oid },
    isDemo: false,
  });

/** The workspace first sign-in provisions: owned by the caller, no tid yet. */
const signIn = async (oid: string, email: string, tid = ACME_TID) => {
  await provisionForSignIn(currentDb, {
    oid,
    tid,
    email,
    emailVerified: true,
    name: null,
  });
  const rows = await currentDb
    .select({ tenant: schema.tenants })
    .from(schema.memberships)
    .innerJoin(
      schema.tenants,
      eq(schema.memberships.tenantId, schema.tenants.id),
    )
    .where(eq(schema.memberships.oid, oid));
  return rows.map((r) => r.tenant);
};

/** A workspace created directly, with the given membership for the caller. */
const workspace = async (
  oid: string,
  values: Partial<typeof schema.tenants.$inferInsert> = {},
  role: "owner" | "admin" | "viewer" = "owner",
) => {
  const [tenant] = await currentDb
    .insert(schema.tenants)
    .values({ name: "ws", ...values })
    .returning();
  await currentDb.insert(schema.memberships).values({
    tenantId: tenant!.id,
    oid,
    email: `${oid}@example.test`,
    role,
  });
  return tenant!;
};

const allTenants = () => currentDb.select().from(schema.tenants);

describe("resolveScanTenant", () => {
  it("binds the caller's empty sign-in workspace instead of creating a second one", async () => {
    const [own] = await signIn(OWNER_OID, "owner@acme.com");
    expect(own?.tid).toBeNull();

    const result = await scanAs(OWNER_OID, "owner@acme.com");

    expect(result).toEqual({ ok: true, tenantId: own!.id });
    const tenants = await allTenants();
    expect(tenants).toHaveLength(1);
    expect(tenants[0]).toMatchObject({
      id: own!.id,
      tid: ACME_TID,
      consentedAt: null,
      concealedNames: false,
      hasP1: false,
      activitySignal: "none",
      copilotSignal: "none",
    });
  });

  it("keeps an existing workspace name", async () => {
    await workspace(OWNER_OID, { name: "Acme Ltd" });

    await scanAs(OWNER_OID, "owner@acme.com");

    const [row] = await allTenants();
    expect(row).toMatchObject({ tid: ACME_TID, name: "Acme Ltd" });
  });

  it("never binds a workspace shared with anyone else, invited or claimed", async () => {
    const withColleague = await workspace(OWNER_OID);
    await currentDb.insert(schema.memberships).values({
      tenantId: withColleague.id,
      oid: CASEY_OID,
      email: "casey@acme.com",
      role: "viewer",
    });
    const withInvite = await workspace(OWNER_OID);
    await currentDb.insert(schema.memberships).values({
      tenantId: withInvite.id,
      oid: null,
      email: "invitee@elsewhere.example",
      role: "viewer",
    });

    const result = await scanAs(OWNER_OID, "owner@acme.com");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect([withColleague.id, withInvite.id]).not.toContain(result.tenantId);
    const shared = (await allTenants()).filter((t) =>
      [withColleague.id, withInvite.id].includes(t.id),
    );
    expect(shared.map((t) => t.tid)).toEqual([null, null]);
  });

  const usedBy: [string, (tenantId: string) => Promise<unknown>][] = [
    [
      "a SaaS seat import",
      (tenantId) =>
        currentDb.insert(schema.saasSeats).values({
          tenantId,
          provider: "chatgpt",
          email: "someone@customer.example",
        }),
    ],
    [
      "an Adobe user list",
      (tenantId) =>
        currentDb
          .insert(schema.adobeUsers)
          .values({ tenantId, email: "someone@customer.example" }),
    ],
    [
      "edited prices",
      (tenantId) =>
        currentDb
          .insert(schema.priceBook)
          .values({ tenantId, skuId: "sku-1", monthlyPriceCents: 1000 }),
    ],
    [
      "findings",
      (tenantId) =>
        currentDb.insert(schema.findings).values({
          tenantId,
          dedupeKey: "k",
          rule: "never_active",
          title: "t",
        }),
    ],
    [
      "a snapshot",
      (tenantId) =>
        currentDb
          .insert(schema.snapshots)
          .values({ tenantId, day: "2026-11-01" }),
    ],
    [
      "a past sync run",
      (tenantId) =>
        currentDb
          .insert(schema.syncRuns)
          .values({ tenantId, status: "failed" }),
    ],
    [
      "a Microsoft connection",
      (tenantId) =>
        currentDb
          .insert(schema.msConnections)
          .values({ tenantId, mode: "managed", tid: OTHER_TID }),
    ],
    [
      "a vendor renewal",
      (tenantId) =>
        currentDb.insert(schema.vendorRenewals).values({
          tenantId,
          vendor: "Vendor",
          contractName: "Contract",
          renewalDate: "2027-01-01",
        }),
    ],
    [
      "a metering connection",
      (tenantId) =>
        currentDb
          .insert(schema.meteringConnections)
          .values({ tenantId, tid: OTHER_TID }),
    ],
    [
      "an Adobe connection",
      (tenantId) =>
        currentDb.insert(schema.adobeConnections).values({
          tenantId,
          orgId: "org",
          clientId: "client",
          clientSecretEnc: "enc",
        }),
    ],
    [
      "a SaaS connection",
      (tenantId) =>
        currentDb.insert(schema.saasConnections).values({
          tenantId,
          provider: "chatgpt",
          orgRef: "org",
          secretEnc: "enc",
        }),
    ],
    [
      "AI spend history",
      (tenantId) =>
        currentDb.insert(schema.aiSpendDaily).values({
          tenantId,
          provider: "chatgpt",
          day: "2026-11-01",
          category: "usage",
        }),
    ],
  ];

  it.each(usedBy)(
    "never binds a workspace that holds %s",
    async (_label, seed) => {
      const used = await workspace(OWNER_OID);
      await seed(used.id);

      const result = await scanAs(OWNER_OID, "owner@acme.com");

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.tenantId).not.toBe(used.id);
      const [row] = await currentDb
        .select()
        .from(schema.tenants)
        .where(eq(schema.tenants.id, used.id));
      expect(row?.tid).toBeNull();
    },
  );

  it("skips the demo and workspaces that were consented without a tenant id", async () => {
    const demo = await workspace(OWNER_OID, { isDemo: true });
    const consented = await workspace(OWNER_OID, { consentedAt: new Date() });

    const result = await scanAs(OWNER_OID, "owner@acme.com");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect([demo.id, consented.id]).not.toContain(result.tenantId);
    expect(await allTenants()).toHaveLength(3);
  });

  it("fills in the placeholder name when the sign-in workspace has none", async () => {
    const ws = await workspace(OWNER_OID, { name: null });

    const result = await scanAs(OWNER_OID, "owner@acme.com");

    expect(result).toEqual({ ok: true, tenantId: ws.id });
    const [row] = await allTenants();
    expect(row).toMatchObject({ tid: ACME_TID, name: "acme.com" });
  });

  it("picks the oldest of several empty workspaces", async () => {
    const older = await workspace(OWNER_OID, {
      createdAt: new Date("2026-01-01T00:00:00Z"),
    });
    await workspace(OWNER_OID, {
      createdAt: new Date("2026-02-01T00:00:00Z"),
    });

    const result = await scanAs(OWNER_OID, "owner@acme.com");

    expect(result).toEqual({ ok: true, tenantId: older.id });
    expect(await allTenants()).toHaveLength(2);
  });

  it("never overwrites a CSV-imported workspace, which may describe another organization", async () => {
    const imported = await workspace(OWNER_OID);
    await currentDb.insert(schema.tenantUsers).values({
      tenantId: imported.id,
      graphId: "csv:1",
      upn: "someone@customer.example",
    });

    const result = await scanAs(OWNER_OID, "owner@acme.com");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.tenantId).not.toBe(imported.id);
    const [untouched] = await currentDb
      .select()
      .from(schema.tenants)
      .where(eq(schema.tenants.id, imported.id));
    expect(untouched?.tid).toBeNull();
  });

  it("skips a workspace that only has SKU rows", async () => {
    const imported = await workspace(OWNER_OID);
    await currentDb.insert(schema.tenantSkus).values({
      tenantId: imported.id,
      skuId: "sku-1",
      skuPartNumber: "SPE_E3",
    });

    const result = await scanAs(OWNER_OID, "owner@acme.com");

    expect(result.ok && result.tenantId !== imported.id).toBe(true);
  });

  it("skips workspaces the caller does not own, MSP client workspaces and workspaces bound elsewhere", async () => {
    const asAdmin = await workspace(OWNER_OID, {}, "admin");
    const asViewer = await workspace(OWNER_OID, {}, "viewer");
    const [msp] = await currentDb
      .insert(schema.mspAccounts)
      .values({ name: "MSP", ownerOid: OWNER_OID })
      .returning();
    const mspClient = await workspace(OWNER_OID, { mspAccountId: msp!.id });
    const boundElsewhere = await workspace(OWNER_OID, { tid: OTHER_TID });

    const result = await scanAs(OWNER_OID, "owner@acme.com");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect([
      asAdmin.id,
      asViewer.id,
      mspClient.id,
      boundElsewhere.id,
    ]).not.toContain(result.tenantId);
    const tenants = await allTenants();
    expect(tenants).toHaveLength(5);
    expect(tenants.filter((t) => t.tid === ACME_TID)).toHaveLength(1);
    expect(tenants.find((t) => t.id === boundElsewhere.id)?.tid).toBe(
      OTHER_TID,
    );
  });

  it("never binds a colleague's empty workspace", async () => {
    const [colleagues] = await signIn(CASEY_OID, "casey@acme.com");

    const result = await scanAs(OWNER_OID, "owner@acme.com");

    expect(result.ok && result.tenantId !== colleagues!.id).toBe(true);
    const [row] = await currentDb
      .select()
      .from(schema.tenants)
      .where(eq(schema.tenants.id, colleagues!.id));
    expect(row?.tid).toBeNull();
  });

  it("creates a fresh owned workspace when the caller has no empty one", async () => {
    const result = await scanAs(OWNER_OID, "owner@acme.com");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [row] = await allTenants();
    expect(row).toMatchObject({
      id: result.tenantId,
      tid: ACME_TID,
      name: "acme.com",
    });
    const members = await currentDb.select().from(schema.memberships);
    expect(members).toMatchObject([{ oid: OWNER_OID, role: "owner" }]);
  });

  it("re-scans the workspace already bound by an earlier scan", async () => {
    const [own] = await signIn(OWNER_OID, "owner@acme.com");
    await scanAs(OWNER_OID, "owner@acme.com");

    const again = await scanAs(OWNER_OID, "owner@acme.com");

    expect(again).toEqual({ ok: true, tenantId: own!.id });
    expect(await allTenants()).toHaveLength(1);
  });

  it("refuses a demo identity before touching any workspace", async () => {
    const own = await workspace(OWNER_OID);

    const result = await resolveScanTenant({
      ms: { tid: ACME_TID, upn: "owner@acme.com" },
      actor: { oid: OWNER_OID },
      isDemo: true,
    });

    expect(result).toEqual({ ok: false, error: "scan_demo" });
    const [row] = await allTenants();
    expect(row).toMatchObject({ id: own.id, tid: null });
  });

  it.each([
    ["owner", { ok: true }],
    ["admin", { ok: true }],
    ["viewer", { ok: false, error: "scan_workspace_role" }],
  ] as const)(
    "re-scans an imported workspace as %s with the existing role rule",
    async (role, expected) => {
      const bound = await workspace(OWNER_OID, { tid: ACME_TID }, role);

      const result = await scanAs(OWNER_OID, "owner@acme.com");

      expect(result).toEqual(
        expected.ok ? { ok: true, tenantId: bound.id } : expected,
      );
      expect(await allTenants()).toHaveLength(1);
    },
  );

  it("sends a non-member of an imported tenant to ask for an invite", async () => {
    await workspace(CASEY_OID, { tid: ACME_TID });
    await workspace(OWNER_OID);

    const result = await scanAs(OWNER_OID, "owner@acme.com");

    expect(result).toEqual({ ok: false, error: "scan_workspace_invite" });
    expect((await allTenants()).filter((t) => t.tid === ACME_TID)).toHaveLength(
      1,
    );
  });

  it("points a member of a consented tenant at the existing workspace", async () => {
    const bound = await workspace(OWNER_OID, {
      tid: ACME_TID,
      consentedAt: new Date(),
    });
    await workspace(OWNER_OID, { createdAt: new Date("2020-01-01") });

    const result = await scanAs(OWNER_OID, "owner@acme.com");

    expect(result).toEqual({ ok: false, error: "scan_already_synced" });
    const [row] = await currentDb
      .select()
      .from(schema.tenants)
      .where(eq(schema.tenants.id, bound.id));
    expect(row?.tid).toBe(ACME_TID);
    expect((await allTenants()).filter((t) => t.tid === ACME_TID)).toHaveLength(
      1,
    );
  });

  it("keeps refusing a tenant that is already consented elsewhere", async () => {
    await workspace(CASEY_OID, { tid: ACME_TID, consentedAt: new Date() });
    const [own] = await signIn(OWNER_OID, "owner@acme.com");

    const result = await scanAs(OWNER_OID, "owner@acme.com");

    expect(result).toEqual({
      ok: false,
      error: "scan_already_synced_invite",
    });
    const [row] = await currentDb
      .select()
      .from(schema.tenants)
      .where(eq(schema.tenants.id, own!.id));
    expect(row?.tid).toBeNull();
  });
});
