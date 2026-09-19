import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DPA_VERSION } from "~/lib/dpa";
import type { AccessContext } from "~/server/access";
import * as schema from "~/server/db/schema";
import { entitlementOf, type Plan } from "~/server/entitlement";
import type { MembershipRole } from "~/server/types";

/**
 * The acceptance and signing records against a real Drizzle/PGlite instance
 * (fresh in-memory database per test, schema generated straight from the
 * Drizzle definitions), so the unique indexes that make both write-once run
 * with genuine Postgres semantics. Role, plan and demo decisions are the real
 * ones, fed by the context each test builds.
 */

let currentDb: ReturnType<typeof makeDb>;

let billing = true;
vi.mock("~/env", () => ({
  env: { NODE_ENV: "test" },
  billingEnabled: () => billing,
}));

// Stable proxy so every module's `import { db }` binding hits currentDb.
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

const RANK: Record<MembershipRole, number> = { viewer: 0, admin: 1, owner: 2 };

// The real role comparison, without the session and cookie machinery.
vi.mock("~/server/access", () => ({
  hasRole: (ctx: AccessContext, minRole: MembershipRole) =>
    RANK[ctx.membership.role] >= RANK[minRole],
}));

const { getAcceptance, getAgreement, recordAcceptance, recordAgreement } =
  await import("./records");

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

const NOW = new Date("2026-09-19T12:00:00Z");
const FUTURE = new Date("2026-10-19T00:00:00Z");

const tenantId = (n: number) =>
  `11111111-1111-1111-1111-${String(n).padStart(12, "0")}`;

let tenant: schema.TenantRow;

async function seedTenant(n: number): Promise<schema.TenantRow> {
  const [row] = await currentDb
    .insert(schema.tenants)
    .values({ id: tenantId(n), name: `Workspace ${n}` })
    .returning();
  return row!;
}

const context = (opts: {
  role: MembershipRole;
  plan: Plan;
  tenantDemo?: boolean;
  userDemo?: boolean;
  oid?: string;
}): AccessContext =>
  ({
    user: {
      oid: opts.oid ?? "user_1",
      tid: "",
      upn: "owner@contoso.example",
      name: "Owner",
      isDemo: opts.userDemo ?? false,
    },
    tenant: { ...tenant, isDemo: opts.tenantDemo ?? false },
    membership: { role: opts.role, email: "owner@contoso.example" },
    workspaces: [],
    entitlement: entitlementOf({
      tenant: { isDemo: false },
      record:
        opts.plan === "free"
          ? null
          : {
              plan: opts.plan,
              source: "polar",
              status: "active",
              trialEnd: null,
              currentPeriodEnd: FUTURE,
              cancelAtPeriodEnd: false,
            },
      covered: true,
      billingEnabled: true,
      now: NOW,
    }),
  }) as unknown as AccessContext;

const SIGNING = {
  kind: "controller",
  language: "en",
  companyName: "Contoso GmbH",
  companyAddress: "Musterstrasse 1, 10115 Berlin",
  signerName: "Dana Example",
  signerTitle: "Head of IT",
  signerEmail: "dana@contoso.example",
};

const auditActions = async () =>
  (await currentDb.select().from(schema.auditLog)).map((r) => r.action);

beforeEach(async () => {
  const client = new PGlite();
  for (const stmt of await schemaDdl()) await client.exec(stmt);
  currentDb = makeDb(client);
  tenant = await seedTenant(1);
});

describe("recordAcceptance", () => {
  it("records the caller once and returns the same row on repeat", async () => {
    const owner = context({ role: "owner", plan: "free" });

    const first = await recordAcceptance(owner, "de");
    if (!first.ok) throw new Error(first.error);
    expect(first.created).toBe(true);
    expect(first.record).toMatchObject({
      tenantId: tenant.id,
      version: DPA_VERSION,
      language: "de",
      acceptedByKey: "user_1",
      acceptedByEmail: "owner@contoso.example",
    });

    // A second submission, even in the other language by another admin,
    // returns the row that exists and leaves it untouched.
    const second = await recordAcceptance(
      context({ role: "admin", plan: "free", oid: "user_2" }),
      "en",
    );
    if (!second.ok) throw new Error(second.error);
    expect(second.created).toBe(false);
    expect(second.record.id).toBe(first.record.id);
    expect(second.record.language).toBe("de");

    expect(await currentDb.select().from(schema.dpaAcceptances)).toHaveLength(
      1,
    );
    expect(await getAcceptance(tenant.id)).toMatchObject({
      id: first.record.id,
    });
    expect(await auditActions()).toEqual(["dpa_accepted"]);
  });

  it("accepts from an admin", async () => {
    const result = await recordAcceptance(
      context({ role: "admin", plan: "pro" }),
      "en",
    );
    expect(result.ok).toBe(true);
  });

  it("refuses a viewer", async () => {
    const result = await recordAcceptance(
      context({ role: "viewer", plan: "pro" }),
      "en",
    );
    expect(result).toEqual({ ok: false, error: "forbidden" });
    expect(await getAcceptance(tenant.id)).toBeNull();
    expect(await auditActions()).toEqual([]);
  });

  it("refuses a self-hosted install, where there is no processor relationship", async () => {
    billing = false;
    try {
      expect(
        await recordAcceptance(context({ role: "owner", plan: "msp" }), "en"),
      ).toEqual({
        ok: false,
        error: "selfHosted",
      });
    } finally {
      billing = true;
    }
    expect(await getAcceptance(tenant.id)).toBeNull();
  });

  it("refuses the demo workspace and the demo visitor", async () => {
    for (const ctx of [
      context({ role: "owner", plan: "msp", tenantDemo: true }),
      context({ role: "owner", plan: "msp", userDemo: true }),
    ]) {
      expect(await recordAcceptance(ctx, "en")).toEqual({
        ok: false,
        error: "demo",
      });
    }
    expect(await getAcceptance(tenant.id)).toBeNull();
  });

  it("is scoped to the workspace", async () => {
    await recordAcceptance(context({ role: "owner", plan: "free" }), "en");
    const other = await seedTenant(2);
    expect(await getAcceptance(other.id)).toBeNull();
  });
});

describe("recordAgreement", () => {
  it("refuses a Free workspace with featureRequired", async () => {
    const result = await recordAgreement(
      context({ role: "owner", plan: "free" }),
      SIGNING,
    );
    expect(result).toEqual({
      ok: false,
      error: "featureRequired",
      plan: "pro",
    });
    expect(await getAgreement(tenant.id, "controller")).toBeNull();
    expect(await auditActions()).toEqual([]);
  });

  it("refuses an admin: owners sign", async () => {
    const result = await recordAgreement(
      context({ role: "admin", plan: "pro" }),
      SIGNING,
    );
    expect(result).toEqual({ ok: false, error: "forbidden" });
    expect(await getAgreement(tenant.id, "controller")).toBeNull();
  });

  it("refuses the demo workspace", async () => {
    const result = await recordAgreement(
      context({ role: "owner", plan: "msp", tenantDemo: true }),
      SIGNING,
    );
    expect(result).toEqual({ ok: false, error: "demo" });
  });

  it("refuses input outside the limits", async () => {
    const owner = context({ role: "owner", plan: "pro" });
    const cases: Record<string, unknown>[] = [
      { companyName: "A" },
      { companyName: "x".repeat(121) },
      { companyAddress: "Bonn" },
      { signerName: "D" },
      { signerTitle: "x".repeat(81) },
      { signerEmail: "not-an-email" },
      { language: "fr" },
      { kind: "other" },
    ];
    for (const bad of cases) {
      expect(await recordAgreement(owner, { ...SIGNING, ...bad })).toEqual({
        ok: false,
        error: "invalid",
      });
    }
    expect(await currentDb.select().from(schema.dpaAgreements)).toHaveLength(0);
  });

  it("refuses the sub-processor kind on Pro", async () => {
    const result = await recordAgreement(
      context({ role: "owner", plan: "pro" }),
      { ...SIGNING, kind: "subprocessor" },
    );
    expect(result).toEqual({ ok: false, error: "kindNotAvailable" });
    expect(await getAgreement(tenant.id, "subprocessor")).toBeNull();
  });

  it("signs the controller agreement on Pro and audits it", async () => {
    const result = await recordAgreement(
      context({ role: "owner", plan: "pro" }),
      { ...SIGNING, companyName: "  Contoso GmbH  " },
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.created).toBe(true);
    expect(result.record).toMatchObject({
      tenantId: tenant.id,
      kind: "controller",
      version: DPA_VERSION,
      language: "en",
      companyName: "Contoso GmbH",
      signerName: "Dana Example",
      signedByKey: "user_1",
    });
    expect(await getAgreement(tenant.id, "controller")).toMatchObject({
      id: result.record.id,
    });

    const [entry] = await currentDb
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, "dpa_signed"));
    expect(entry?.detail).toMatchObject({
      kind: "controller",
      companyName: "Contoso GmbH",
    });
  });

  it("returns the existing record on a second signing instead of overwriting", async () => {
    const owner = context({ role: "owner", plan: "pro" });
    const first = await recordAgreement(owner, SIGNING);
    if (!first.ok) throw new Error(first.error);

    const second = await recordAgreement(owner, {
      ...SIGNING,
      companyName: "Fabrikam AG",
      signerName: "Someone Else",
    });
    if (!second.ok) throw new Error(second.error);
    expect(second.created).toBe(false);
    expect(second.record.id).toBe(first.record.id);
    expect(second.record.companyName).toBe("Contoso GmbH");

    expect(await currentDb.select().from(schema.dpaAgreements)).toHaveLength(1);
    expect(await auditActions()).toEqual(["dpa_signed"]);
  });

  it("signs both kinds on MSP, each once", async () => {
    const owner = context({ role: "owner", plan: "msp" });
    const controller = await recordAgreement(owner, SIGNING);
    const subprocessor = await recordAgreement(owner, {
      ...SIGNING,
      kind: "subprocessor",
    });
    expect(controller.ok && controller.created).toBe(true);
    expect(subprocessor.ok && subprocessor.created).toBe(true);
    expect(await getAgreement(tenant.id, "subprocessor")).toMatchObject({
      kind: "subprocessor",
    });
    expect(await currentDb.select().from(schema.dpaAgreements)).toHaveLength(2);
  });

  it("is scoped to the workspace", async () => {
    await recordAgreement(context({ role: "owner", plan: "pro" }), SIGNING);
    const other = await seedTenant(2);
    expect(await getAgreement(other.id, "controller")).toBeNull();
  });
});
