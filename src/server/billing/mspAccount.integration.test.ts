import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AccessContext } from "~/server/access";
import * as schema from "~/server/db/schema";
import type { MembershipRole } from "~/server/types";

/**
 * Integration test for the MSP account functions against a real Drizzle/PGlite
 * instance (fresh in-memory database per test, schema generated straight from
 * the Drizzle definitions), so the owner unique indexes, the conditional
 * attach update and the (created_at, id) ordering run with genuine Postgres
 * semantics.
 */

let currentDb: ReturnType<typeof makeDb>;

vi.mock("~/env", () => ({
  env: { NODE_ENV: "test" },
  billingEnabled: () => true,
}));

// Stable proxy so the module's `import { db }` binding always hits currentDb.
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

const {
  MspAccountError,
  attachWorkspace,
  coveredIds,
  detachWorkspace,
  ensureMspAccount,
  getMspAccount,
  listCoverage,
} = await import("./mspAccount");

// --- DB harness --------------------------------------------------------------

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

// --- fixtures ----------------------------------------------------------------

const NOW = new Date("2026-09-18T12:00:00Z");
const FUTURE = new Date("2026-10-01T00:00:00Z");

const tenantId = (n: number) =>
  `11111111-1111-1111-1111-${String(n).padStart(12, "0")}`;

/** `id` is the Entra object id. */
type User = { id: string; email: string };

const ALICE: User = {
  id: "00000000-aaaa-bbbb-cccc-00000000000a",
  email: "a@msp.example",
};
const BOB: User = {
  id: "00000000-aaaa-bbbb-cccc-00000000000b",
  email: "b@other.example",
};
const ERIN: User = {
  id: "00000000-aaaa-bbbb-cccc-000000000001",
  email: "erin@entra.example",
};
/** Erin's identity from before sign-in moved to Entra. */

async function seedTenant(
  n: number,
  overrides: Partial<typeof schema.tenants.$inferInsert> = {},
): Promise<schema.TenantRow> {
  const [row] = await currentDb
    .insert(schema.tenants)
    .values({ id: tenantId(n), name: `Workspace ${n}`, ...overrides })
    .returning();
  return row!;
}

async function seedMember(
  tenant: schema.TenantRow,
  user: User,
  role: MembershipRole,
): Promise<typeof schema.memberships.$inferSelect> {
  const [row] = await currentDb
    .insert(schema.memberships)
    .values({
      tenantId: tenant.id,
      email: user.email,
      role,
      oid: user.id,
    })
    .returning();
  return row!;
}

/** The context requireAccess would build with `tenant` as the active workspace. */
function ctxFor(
  user: User,
  tenant: schema.TenantRow,
  membership: typeof schema.memberships.$inferSelect,
  overrides: {
    isDemo?: boolean;
    workspaces?: AccessContext["workspaces"];
  } = {},
): AccessContext {
  return {
    user: {
      oid: user.id,
      tid: "entra-home-tid",
      upn: user.email,
      name: "",
      isDemo: overrides.isDemo ?? false,
    },
    tenant,
    membership,
    workspaces: overrides.workspaces ?? [],
  } as AccessContext;
}

async function seedOwned(
  n: number,
  user: User,
  role: MembershipRole = "owner",
) {
  const tenant = await seedTenant(n);
  const membership = await seedMember(tenant, user, role);
  return { tenant, ctx: ctxFor(user, tenant, membership) };
}

const accountOf = async (tenant: schema.TenantRow) => {
  const [row] = await currentDb
    .select({ mspAccountId: schema.tenants.mspAccountId })
    .from(schema.tenants)
    .where(eq(schema.tenants.id, tenant.id));
  return row?.mspAccountId ?? null;
};

async function seedMspPlan(
  mspAccountId: string,
  values: Partial<typeof schema.entitlements.$inferInsert> = {},
): Promise<void> {
  await currentDb.insert(schema.entitlements).values({
    mspAccountId,
    plan: "msp",
    source: "polar",
    status: "active",
    currentPeriodEnd: FUTURE,
    quantity: 10,
    ...values,
  });
}

beforeEach(async () => {
  const client = new PGlite();
  for (const stmt of await schemaDdl()) await client.exec(stmt);
  currentDb = makeDb(client);
});

describe("coveredIds", () => {
  it("takes the first quantity ids and never a negative or fractional slice", () => {
    expect([...coveredIds(["a", "b", "c"], 2)]).toEqual(["a", "b"]);
    expect([...coveredIds(["a", "b"], 5)]).toEqual(["a", "b"]);
    expect([...coveredIds(["a", "b"], 0)]).toEqual([]);
    expect([...coveredIds(["a", "b"], -1)]).toEqual([]);
    expect([...coveredIds(["a", "b"], 1.9)]).toEqual(["a"]);
  });
});

describe("ensureMspAccount", () => {
  it("creates one account per owner, keyed by object id, and attaches the active workspace", async () => {
    const { tenant, ctx } = await seedOwned(1, ALICE);

    const first = await ensureMspAccount(ctx);
    const second = await ensureMspAccount(ctx);

    expect(second.id).toBe(first.id);
    const accounts = await currentDb.select().from(schema.mspAccounts);
    expect(accounts).toHaveLength(1);
    expect(accounts[0]!.ownerOid).toBe(ALICE.id);
    expect(await accountOf(tenant)).toBe(first.id);
    expect(await getMspAccount(ctx)).toEqual({ id: first.id, name: null });
  });

  it("can create the account without attaching the active workspace", async () => {
    const { tenant, ctx } = await seedOwned(1, ALICE);

    await ensureMspAccount(ctx, { attachActive: false });

    expect(await accountOf(tenant)).toBeNull();
  });

  it("collapses a concurrent double create into one account", async () => {
    const { ctx } = await seedOwned(1, ALICE);

    const [a, b] = await Promise.all([
      ensureMspAccount(ctx),
      ensureMspAccount(ctx),
    ]);

    expect(a.id).toBe(b.id);
    expect(await currentDb.select().from(schema.mspAccounts)).toHaveLength(1);
  });

  it("gives separate owners separate accounts", async () => {
    const alice = await seedOwned(1, ALICE);
    const bob = await seedOwned(2, BOB);

    const a = await ensureMspAccount(alice.ctx);
    const b = await ensureMspAccount(bob.ctx);

    expect(a.id).not.toBe(b.id);
    expect(await getMspAccount(bob.ctx)).toEqual({ id: b.id, name: null });
  });

  it("creates the account without attaching when the caller is only an admin", async () => {
    const { tenant, ctx } = await seedOwned(1, ALICE, "admin");

    const { id } = await ensureMspAccount(ctx);

    expect(id).toBeTruthy();
    expect(await accountOf(tenant)).toBeNull();
  });

  it("leaves an active workspace that belongs to another account alone", async () => {
    const bob = await seedOwned(1, BOB);
    const bobAccount = await ensureMspAccount(bob.ctx);
    // Alice co-owns Bob's workspace and opens billing from inside it.
    const membership = await seedMember(bob.tenant, ALICE, "owner");
    const aliceCtx = ctxFor(ALICE, bob.tenant, membership);

    const aliceAccount = await ensureMspAccount(aliceCtx);

    expect(aliceAccount.id).not.toBe(bobAccount.id);
    expect(await accountOf(bob.tenant)).toBe(bobAccount.id);
  });

  it("refuses the shared demo sign-in", async () => {
    const tenant = await seedTenant(1, { isDemo: true });
    const membership = await seedMember(tenant, ERIN, "owner");
    const ctx = ctxFor(ERIN, tenant, membership, { isDemo: true });

    await expect(ensureMspAccount(ctx)).rejects.toBeInstanceOf(MspAccountError);
    expect(await currentDb.select().from(schema.mspAccounts)).toHaveLength(0);
    expect(await getMspAccount(ctx)).toBeNull();
  });
});

describe("attachWorkspace", () => {
  it("attaches a second workspace the caller owns", async () => {
    const { ctx } = await seedOwned(1, ALICE);
    const { id } = await ensureMspAccount(ctx);
    const client = await seedTenant(2);
    await seedMember(client, ALICE, "owner");

    expect(await attachWorkspace(ctx, client.id)).toEqual({ ok: true });
    expect(await accountOf(client)).toBe(id);
    // Attaching again is a no-op, not an error.
    expect(await attachWorkspace(ctx, client.id)).toEqual({ ok: true });
  });

  it("refuses a caller without an MSP account", async () => {
    const { tenant, ctx } = await seedOwned(1, ALICE);

    expect(await attachWorkspace(ctx, tenant.id)).toEqual({
      ok: false,
      reason: "noAccount",
    });
    expect(await accountOf(tenant)).toBeNull();
  });

  it("refuses a workspace where the caller is admin or viewer", async () => {
    const { ctx } = await seedOwned(1, ALICE);
    await ensureMspAccount(ctx);
    for (const [n, role] of [
      [2, "admin"],
      [3, "viewer"],
    ] as const) {
      const target = await seedTenant(n);
      await seedMember(target, ALICE, role);

      expect(await attachWorkspace(ctx, target.id)).toEqual({
        ok: false,
        reason: "notOwner",
      });
      expect(await accountOf(target)).toBeNull();
    }
  });

  it("checks the owner role in the database, not in ctx.workspaces", async () => {
    const { tenant, ctx } = await seedOwned(1, ALICE);
    await ensureMspAccount(ctx);
    const target = await seedTenant(2);
    const membership = await seedMember(target, ALICE, "viewer");
    // A context that claims the owner role the database does not grant.
    const forged = ctxFor(ALICE, tenant, ctx.membership, {
      workspaces: [
        { id: target.id, name: "Forged", role: "owner", isDemo: false },
      ],
    });
    expect(membership.role).toBe("viewer");

    expect(await attachWorkspace(forged, target.id)).toEqual({
      ok: false,
      reason: "notOwner",
    });
    expect(await accountOf(target)).toBeNull();
  });

  it("answers notFound for a workspace the caller has no membership in", async () => {
    const { ctx } = await seedOwned(1, ALICE);
    await ensureMspAccount(ctx);
    const stranger = await seedOwned(2, BOB);

    for (const id of [stranger.tenant.id, tenantId(999)]) {
      expect(await attachWorkspace(ctx, id)).toEqual({
        ok: false,
        reason: "notFound",
      });
    }
    expect(await accountOf(stranger.tenant)).toBeNull();
  });

  it("does not grant ownership through an unclaimed invitation", async () => {
    const { ctx } = await seedOwned(1, ALICE);
    await ensureMspAccount(ctx);
    const target = await seedTenant(2);
    // An invitation is not proof of ownership until its Microsoft identity is bound.
    await currentDb.insert(schema.memberships).values({
      tenantId: target.id,
      email: "x@x.example",
      role: "owner",
    });

    expect(await attachWorkspace(ctx, target.id)).toEqual({
      ok: false,
      reason: "notFound",
    });
  });

  it("cannot take over a workspace attached to another MSP account", async () => {
    const bob = await seedOwned(1, BOB);
    const bobAccount = await ensureMspAccount(bob.ctx);
    const alice = await seedOwned(2, ALICE);
    await ensureMspAccount(alice.ctx);
    // Alice is a full owner of Bob's workspace and still cannot move it.
    await seedMember(bob.tenant, ALICE, "owner");

    expect(await attachWorkspace(alice.ctx, bob.tenant.id)).toEqual({
      ok: false,
      reason: "attachedElsewhere",
    });
    expect(await accountOf(bob.tenant)).toBe(bobAccount.id);
  });

  it("refuses the demo workspace", async () => {
    const { ctx } = await seedOwned(1, ALICE);
    await ensureMspAccount(ctx);
    const demo = await seedTenant(2, { isDemo: true });
    await seedMember(demo, ALICE, "owner");

    expect(await attachWorkspace(ctx, demo.id)).toEqual({
      ok: false,
      reason: "demoWorkspace",
    });
    expect(await accountOf(demo)).toBeNull();
  });

  it("refuses the shared demo sign-in", async () => {
    const tenant = await seedTenant(1);
    const membership = await seedMember(tenant, ERIN, "owner");
    const ctx = ctxFor(ERIN, tenant, membership, { isDemo: true });

    expect(await attachWorkspace(ctx, tenant.id)).toEqual({
      ok: false,
      reason: "demoUser",
    });
  });
});

describe("detachWorkspace", () => {
  it("clears the link and deletes nothing", async () => {
    const { tenant, ctx } = await seedOwned(1, ALICE);
    const { id } = await ensureMspAccount(ctx);
    await seedMspPlan(id);

    expect(await detachWorkspace(ctx, tenant.id)).toEqual({ ok: true });

    expect(await accountOf(tenant)).toBeNull();
    expect(await currentDb.select().from(schema.tenants)).toHaveLength(1);
    expect(await currentDb.select().from(schema.memberships)).toHaveLength(1);
    expect(await currentDb.select().from(schema.mspAccounts)).toHaveLength(1);
    expect(await currentDb.select().from(schema.entitlements)).toHaveLength(1);
  });

  it("only lets the account owner detach", async () => {
    const alice = await seedOwned(1, ALICE);
    const aliceAccount = await ensureMspAccount(alice.ctx);
    // Bob co-owns the workspace, with and without an account of his own.
    const membership = await seedMember(alice.tenant, BOB, "owner");
    const bobCtx = ctxFor(BOB, alice.tenant, membership);

    expect(await detachWorkspace(bobCtx, alice.tenant.id)).toEqual({
      ok: false,
      reason: "noAccount",
    });
    const bobOwn = await seedOwned(2, BOB);
    await ensureMspAccount(bobOwn.ctx);
    expect(await detachWorkspace(bobCtx, alice.tenant.id)).toEqual({
      ok: false,
      reason: "notAttached",
    });
    expect(await accountOf(alice.tenant)).toBe(aliceAccount.id);
  });

  it("answers notAttached for a workspace that was never attached", async () => {
    const { ctx } = await seedOwned(1, ALICE);
    await ensureMspAccount(ctx);
    const other = await seedTenant(2);
    await seedMember(other, ALICE, "owner");

    expect(await detachWorkspace(ctx, other.id)).toEqual({
      ok: false,
      reason: "notAttached",
    });
  });

  it("lets the account owner release a workspace they no longer own", async () => {
    const { ctx } = await seedOwned(1, ALICE);
    await ensureMspAccount(ctx);
    const client = await seedTenant(2);
    const membership = await seedMember(client, ALICE, "owner");
    await attachWorkspace(ctx, client.id);
    await currentDb
      .update(schema.memberships)
      .set({ role: "viewer" })
      .where(eq(schema.memberships.id, membership.id));

    const listed = (await listCoverage(ctx, NOW)).workspaces.find(
      (w) => w.id === client.id,
    );
    expect(listed).toMatchObject({ owned: false, attached: true });
    expect(await detachWorkspace(ctx, client.id)).toEqual({ ok: true });
    expect(await accountOf(client)).toBeNull();
  });
});

describe("listCoverage", () => {
  it("reports no account and no coverage before one exists", async () => {
    const { tenant, ctx } = await seedOwned(1, ALICE);

    const coverage = await listCoverage(ctx, NOW);

    expect(coverage.account).toBeNull();
    expect(coverage.quantity).toBe(0);
    expect(coverage.state).toBe("free");
    expect(coverage.workspaces).toEqual([
      {
        id: tenant.id,
        name: "Workspace 1",
        owned: true,
        isDemo: false,
        attached: false,
        attachedElsewhere: false,
        covered: false,
      },
    ]);
  });

  it("covers the first quantity attached workspaces by createdAt, then id", async () => {
    const at = (minute: number) =>
      new Date(`2026-01-01T00:${String(minute).padStart(2, "0")}:00Z`);
    // Ids run against creation order and 1 and 2 share a timestamp, so the
    // expected order is 4, 1, 2, 3.
    const created: [number, number][] = [
      [2, 5],
      [1, 5],
      [3, 9],
      [4, 1],
    ];
    let ctx: AccessContext | null = null;
    for (const [n, minute] of created) {
      const tenant = await seedTenant(n, { createdAt: at(minute) });
      const membership = await seedMember(tenant, ALICE, "owner");
      ctx ??= ctxFor(ALICE, tenant, membership);
    }
    const { id } = await ensureMspAccount(ctx!);
    for (const [n] of created) await attachWorkspace(ctx!, tenantId(n));
    // Owned but not attached, and a viewer-only workspace that is not listed.
    const loose = await seedTenant(5, { createdAt: at(0) });
    await seedMember(loose, ALICE, "owner");
    await seedMember(await seedTenant(6), ALICE, "viewer");
    await seedMspPlan(id, { quantity: 3, source: "marketplace" });

    const coverage = await listCoverage(ctx!, NOW);

    expect(coverage.account?.id).toBe(id);
    expect(coverage.state).toBe("active");
    expect(coverage.source).toBe("marketplace");
    expect(coverage.currentPeriodEnd).toEqual(FUTURE);
    expect(coverage.quantity).toBe(3);
    expect(coverage.attachedCount).toBe(4);
    expect(coverage.coveredCount).toBe(3);
    expect(
      coverage.workspaces.map((w) => [w.id, w.attached, w.covered]),
    ).toEqual([
      [tenantId(5), false, false],
      [tenantId(4), true, true],
      [tenantId(1), true, true],
      [tenantId(2), true, true],
      [tenantId(3), true, false],
    ]);
  });

  it("agrees with loadEntitlement on which workspace is over quantity", async () => {
    const { loadEntitlement } = await import("~/server/entitlementStore");
    const first = await seedOwned(1, ALICE);
    const { id } = await ensureMspAccount(first.ctx);
    const second = await seedTenant(2);
    await seedMember(second, ALICE, "owner");
    await attachWorkspace(first.ctx, second.id);
    await seedMspPlan(id, { quantity: 1 });

    const coverage = await listCoverage(first.ctx, NOW);

    for (const w of coverage.workspaces) {
      const [tenant] = await currentDb
        .select()
        .from(schema.tenants)
        .where(eq(schema.tenants.id, w.id));
      const e = await loadEntitlement(tenant!, NOW);
      expect(e.state === "overQuantity").toBe(!w.covered);
    }
    expect(coverage.coveredCount).toBe(1);
  });

  it("covers nothing when the MSP plan has lapsed", async () => {
    const { ctx } = await seedOwned(1, ALICE);
    const { id } = await ensureMspAccount(ctx);
    await seedMspPlan(id, { status: "suspended" });

    const coverage = await listCoverage(ctx, NOW);

    expect(coverage.state).toBe("free");
    expect(coverage.quantity).toBe(0);
    expect(coverage.workspaces[0]).toMatchObject({
      attached: true,
      covered: false,
    });
  });

  it("flags a workspace held by another account and never lists strangers", async () => {
    const bob = await seedOwned(1, BOB);
    await ensureMspAccount(bob.ctx);
    const alice = await seedOwned(2, ALICE);
    await ensureMspAccount(alice.ctx);
    await seedMember(bob.tenant, ALICE, "owner");
    await seedOwned(3, ERIN);

    const coverage = await listCoverage(alice.ctx, NOW);

    expect(coverage.workspaces.map((w) => w.id).sort()).toEqual([
      bob.tenant.id,
      alice.tenant.id,
    ]);
    expect(
      coverage.workspaces.find((w) => w.id === bob.tenant.id),
    ).toMatchObject({ attached: false, attachedElsewhere: true });
  });
});
