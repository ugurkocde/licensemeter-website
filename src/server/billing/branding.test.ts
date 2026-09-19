import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AccessContext } from "~/server/access";
import * as schema from "~/server/db/schema";
import { LOGO_MAX_BYTES } from "~/server/report/brandStyle";
import type { MembershipRole } from "~/server/types";

/**
 * White-label branding against a real Drizzle/PGlite instance (fresh in-memory
 * database per test, schema generated straight from the Drizzle definitions),
 * so the plan gate runs through loadEntitlement and the owner check runs as the
 * conditional update it is in production.
 */

let currentDb: ReturnType<typeof makeDb>;
let billing = true;
/** Queries started by the code under test through the shared db binding. */
let dbQueries = 0;
const QUERY_ENTRY_POINTS = new Set<string | symbol>([
  "select",
  "insert",
  "update",
  "delete",
  "execute",
  "transaction",
  "query",
]);

vi.mock("~/env", () => ({
  env: { NODE_ENV: "test" },
  billingEnabled: () => billing,
}));

// Stable proxy so the module's `import { db }` binding always hits currentDb.
// Fixtures write through currentDb directly and are never counted.
vi.mock("~/server/db", () => {
  const proxy = new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (QUERY_ENTRY_POINTS.has(prop)) dbQueries += 1;
        return (currentDb as unknown as Record<string | symbol, unknown>)[prop];
      },
    },
  );
  return { db: proxy, schema };
});

const { loadEntitlement } = await import("~/server/entitlementStore");
const {
  brandingInputSchema,
  checkLogo,
  clearBranding,
  getBranding,
  getBrandingSettings,
  saveBranding,
  sniffLogoType,
} = await import("./branding");

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
const MSP_ID = "aaaaaaaa-0000-0000-0000-000000000001";

const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);
const JPEG_BYTES = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46,
]);
const GIF_BYTES = Buffer.from([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00,
]);
const SVG_BYTES = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
);

const dataUrl = (mediaType: string, bytes: Buffer) =>
  `data:${mediaType};base64,${bytes.toString("base64")}`;

const PNG_LOGO = dataUrl("image/png", PNG_BYTES);
const BRAND = { name: "Northwind IT", color: "#FFE600", logo: PNG_LOGO };

/** `id` is the Entra object id. */
type User = { id: string; email: string };

const ALICE: User = {
  id: "00000000-aaaa-bbbb-cccc-00000000000a",
  email: "a@msp.example",
};
const BOB: User = {
  id: "00000000-aaaa-bbbb-cccc-00000000000b",
  email: "b@client.example",
};
const ERIN: User = {
  id: "00000000-aaaa-bbbb-cccc-000000000001",
  email: "erin@entra.example",
};

const tenantId = (n: number) =>
  `11111111-1111-1111-1111-${String(n).padStart(12, "0")}`;

/** Later numbers are created later, so coverage order is the seeding order. */
async function seedTenant(
  n: number,
  overrides: Partial<typeof schema.tenants.$inferInsert> = {},
): Promise<schema.TenantRow> {
  const [row] = await currentDb
    .insert(schema.tenants)
    .values({
      id: tenantId(n),
      name: `Workspace ${n}`,
      createdAt: new Date(NOW.getTime() - (100 - n) * 86_400_000),
      ...overrides,
    })
    .returning();
  return row!;
}

async function seedMspAccount(
  owner: User,
  brand: Partial<typeof schema.mspAccounts.$inferInsert> = {},
): Promise<void> {
  await currentDb.insert(schema.mspAccounts).values({
    id: MSP_ID,
    name: "Partner",
    ownerOid: owner.id,
    ...brand,
  });
}

const BRANDED = {
  brandName: "Northwind IT",
  brandColor: "#ffe600",
  brandLogo: PNG_LOGO,
};

async function seedEntitlement(
  values: Partial<typeof schema.entitlements.$inferInsert> &
    Pick<typeof schema.entitlements.$inferInsert, "plan">,
): Promise<void> {
  await currentDb.insert(schema.entitlements).values({
    source: "polar",
    status: "active",
    currentPeriodEnd: FUTURE,
    ...values,
  });
}

/** The context requireAccess would build with `tenant` as the active workspace. */
async function ctxFor(
  user: User,
  tenant: schema.TenantRow,
  role: MembershipRole = "owner",
  isDemo = false,
): Promise<AccessContext> {
  const [membership] = await currentDb
    .insert(schema.memberships)
    .values({
      tenantId: tenant.id,
      email: user.email,
      role,
      oid: user.id,
    })
    .returning();
  const entitlement = await loadEntitlement(tenant, NOW);
  dbQueries = 0;
  return {
    user: {
      oid: user.id,
      tid: "entra-home-tid",
      upn: user.email,
      name: "",
      isDemo,
    },
    tenant,
    membership: membership!,
    workspaces: [],
    entitlement,
  };
}

const storedBrand = async () => {
  const [row] = await currentDb
    .select({
      brandName: schema.mspAccounts.brandName,
      brandColor: schema.mspAccounts.brandColor,
      brandLogo: schema.mspAccounts.brandLogo,
    })
    .from(schema.mspAccounts)
    .where(eq(schema.mspAccounts.id, MSP_ID));
  return row!;
};

beforeEach(async () => {
  const client = new PGlite();
  for (const stmt of await schemaDdl()) await client.exec(stmt);
  currentDb = makeDb(client);
  billing = true;
  dbQueries = 0;
});

// --- validation --------------------------------------------------------------

describe("checkLogo", () => {
  it("accepts a PNG and a JPEG whose bytes match the declared type", () => {
    expect(checkLogo(PNG_LOGO)).toEqual({ ok: true });
    expect(checkLogo(dataUrl("image/jpeg", JPEG_BYTES))).toEqual({ ok: true });
  });

  it("refuses a logo above 256 KB decoded, and accepts one at the limit", () => {
    const sized = (bytes: number) =>
      dataUrl(
        "image/png",
        Buffer.concat([PNG_BYTES, Buffer.alloc(bytes - PNG_BYTES.length)]),
      );
    expect(checkLogo(sized(LOGO_MAX_BYTES))).toEqual({ ok: true });
    expect(checkLogo(sized(LOGO_MAX_BYTES + 1))).toEqual({
      ok: false,
      reason: "tooLarge",
    });
    // The largest accepted logo still fits the database check.
    expect(sized(LOGO_MAX_BYTES).length).toBeLessThanOrEqual(400_000);
  });

  it("refuses bytes with the wrong magic number behind a png media type", () => {
    for (const bytes of [GIF_BYTES, SVG_BYTES, JPEG_BYTES]) {
      expect(checkLogo(dataUrl("image/png", bytes))).toEqual({
        ok: false,
        reason: "contentMismatch",
      });
    }
  });

  it("refuses SVG, declared honestly or not", () => {
    expect(checkLogo(dataUrl("image/svg+xml", SVG_BYTES))).toEqual({
      ok: false,
      reason: "unsupportedType",
    });
    // Real PNG bytes do not make an SVG media type acceptable either.
    expect(checkLogo(dataUrl("image/svg+xml", PNG_BYTES))).toEqual({
      ok: false,
      reason: "unsupportedType",
    });
  });

  it("refuses anything that is not a base64 data URL", () => {
    for (const value of [
      "",
      "https://example.com/logo.png",
      "data:image/png,plain",
      "data:image/png;base64,",
      "data:image/png;base64,@@@@",
      `data:image/png;charset=utf-8;base64,${PNG_BYTES.toString("base64")}`,
    ]) {
      expect(checkLogo(value)).toEqual({ ok: false, reason: "notDataUrl" });
    }
  });

  it("sniffs the type from the bytes alone", () => {
    expect(sniffLogoType(PNG_BYTES)).toBe("image/png");
    expect(sniffLogoType(JPEG_BYTES)).toBe("image/jpeg");
    expect(sniffLogoType(GIF_BYTES)).toBeNull();
    expect(sniffLogoType(new Uint8Array())).toBeNull();
  });
});

describe("brandingInputSchema", () => {
  const parse = (input: unknown) => brandingInputSchema.safeParse(input);

  it("accepts a full brand, trims the name and lower-cases the colour", () => {
    const parsed = parse({ ...BRAND, name: "  Northwind IT " });
    expect(parsed.success && parsed.data).toEqual({
      name: "Northwind IT",
      color: "#ffe600",
      logo: PNG_LOGO,
    });
  });

  it("accepts a name alone", () => {
    expect(parse({ name: "N", color: null, logo: null }).success).toBe(true);
  });

  it("refuses an empty or blank name, and one above 60 characters", () => {
    expect(parse({ ...BRAND, name: "" }).success).toBe(false);
    expect(parse({ ...BRAND, name: "   " }).success).toBe(false);
    expect(parse({ ...BRAND, name: "x".repeat(60) }).success).toBe(true);
    expect(parse({ ...BRAND, name: "x".repeat(61) }).success).toBe(false);
  });

  it("refuses a colour that is not #RRGGBB", () => {
    for (const color of ["#fff", "ffe600", "#ffe60g", "yellow", "#ffe6000", ""])
      expect(parse({ ...BRAND, color }).success).toBe(false);
  });

  it("refuses an svg logo and a mislabelled logo", () => {
    expect(
      parse({ ...BRAND, logo: dataUrl("image/svg+xml", SVG_BYTES) }).success,
    ).toBe(false);
    expect(
      parse({ ...BRAND, logo: dataUrl("image/png", SVG_BYTES) }).success,
    ).toBe(false);
  });
});

// --- getBranding -------------------------------------------------------------

describe("getBranding", () => {
  it("returns null for a Free workspace, even when its account is branded", async () => {
    await seedMspAccount(ALICE, BRANDED);
    const tenant = await seedTenant(1, { mspAccountId: MSP_ID });
    const entitlement = await loadEntitlement(tenant, NOW);
    dbQueries = 0;

    expect(entitlement.plan).toBe("free");
    expect(await getBranding(tenant, entitlement)).toBeNull();
    expect(dbQueries).toBe(0);
  });

  it("returns null for a Pro workspace", async () => {
    await seedMspAccount(ALICE, BRANDED);
    const tenant = await seedTenant(1, { mspAccountId: MSP_ID });
    await seedEntitlement({ tenantId: tenant.id, plan: "pro" });
    const entitlement = await loadEntitlement(tenant, NOW);

    expect(entitlement.plan).toBe("pro");
    expect(await getBranding(tenant, entitlement)).toBeNull();
  });

  it("returns null for a workspace with the feature that is not attached to an account", async () => {
    // Only a self-hosted install has the feature without an MSP plan: the
    // database refuses an MSP row that belongs to a single workspace.
    await seedMspAccount(ALICE, BRANDED);
    const tenant = await seedTenant(1);
    billing = false;
    const entitlement = await loadEntitlement(tenant, NOW);
    dbQueries = 0;

    expect(entitlement.features.whiteLabel).toBe(true);
    expect(await getBranding(tenant, entitlement)).toBeNull();
    expect(dbQueries).toBe(0);
  });

  it("returns null for a workspace beyond the covered quantity", async () => {
    await seedMspAccount(ALICE, BRANDED);
    const covered = await seedTenant(1, { mspAccountId: MSP_ID });
    const beyond = await seedTenant(2, { mspAccountId: MSP_ID });
    await seedEntitlement({ mspAccountId: MSP_ID, plan: "msp", quantity: 1 });

    const beyondEntitlement = await loadEntitlement(beyond, NOW);
    expect(beyondEntitlement.state).toBe("overQuantity");
    expect(await getBranding(beyond, beyondEntitlement)).toBeNull();

    expect(
      await getBranding(covered, await loadEntitlement(covered, NOW)),
    ).toEqual({ name: "Northwind IT", color: "#ffe600", logo: PNG_LOGO });
  });

  it("returns null once the MSP plan has ended", async () => {
    await seedMspAccount(ALICE, BRANDED);
    const tenant = await seedTenant(1, { mspAccountId: MSP_ID });
    await seedEntitlement({
      mspAccountId: MSP_ID,
      plan: "msp",
      quantity: 10,
      status: "suspended",
    });

    expect(
      await getBranding(tenant, await loadEntitlement(tenant, NOW)),
    ).toBeNull();
  });

  it("returns null while the account has neither a name nor a logo", async () => {
    await seedMspAccount(ALICE, { brandColor: "#ffe600" });
    const tenant = await seedTenant(1, { mspAccountId: MSP_ID });
    await seedEntitlement({ mspAccountId: MSP_ID, plan: "msp", quantity: 10 });

    expect(
      await getBranding(tenant, await loadEntitlement(tenant, NOW)),
    ).toBeNull();
  });

  it("returns the branding of a covered workspace in one query", async () => {
    await seedMspAccount(ALICE, { brandName: "Northwind IT" });
    const tenant = await seedTenant(1, { mspAccountId: MSP_ID });
    await seedEntitlement({ mspAccountId: MSP_ID, plan: "msp", quantity: 10 });
    const entitlement = await loadEntitlement(tenant, NOW);
    dbQueries = 0;

    expect(await getBranding(tenant, entitlement)).toEqual({
      name: "Northwind IT",
      color: null,
      logo: null,
    });
    expect(dbQueries).toBe(1);
  });

  it("brands an attached workspace of a self-hosted install", async () => {
    billing = false;
    await seedMspAccount(ALICE, BRANDED);
    const tenant = await seedTenant(1, { mspAccountId: MSP_ID });

    expect(
      (await getBranding(tenant, await loadEntitlement(tenant, NOW)))?.name,
    ).toBe("Northwind IT");
  });
});

// --- saveBranding and clearBranding --------------------------------------------

describe("saveBranding", () => {
  const seedCovered = async (owner: User = ALICE) => {
    await seedMspAccount(owner);
    const tenant = await seedTenant(1, { mspAccountId: MSP_ID });
    await seedEntitlement({ mspAccountId: MSP_ID, plan: "msp", quantity: 10 });
    return tenant;
  };

  it("lets the owner of the MSP account save, normalised", async () => {
    const tenant = await seedCovered();
    const ctx = await ctxFor(ALICE, tenant);

    expect(await saveBranding(ctx, BRAND)).toEqual({ ok: true });
    expect(await storedBrand()).toEqual(BRANDED);
  });

  it("matches an Entra owner by object id", async () => {
    const tenant = await seedCovered(ERIN);
    const ctx = await ctxFor(ERIN, tenant);

    expect(await saveBranding(ctx, BRAND)).toEqual({ ok: true });
    expect((await storedBrand()).brandName).toBe("Northwind IT");
  });

  it("refuses a workspace owner who does not own the MSP account", async () => {
    const tenant = await seedCovered();
    const ctx = await ctxFor(BOB, tenant, "owner");

    expect(await saveBranding(ctx, BRAND)).toEqual({
      ok: false,
      reason: "notOwner",
    });
    expect(await clearBranding(ctx)).toEqual({ ok: false, reason: "notOwner" });
    expect((await storedBrand()).brandName).toBeNull();
  });

  it("does not match the object id against the legacy owner column", async () => {
    // An account from before the move whose legacy owner id happens to hold
    // the same string as Alice's object id, and that nobody adopted yet.
    await currentDb.insert(schema.mspAccounts).values({
      id: MSP_ID,
      name: "Partner",
      ownerWorkosUserId: ALICE.id,
    });
    const tenant = await seedTenant(1, { mspAccountId: MSP_ID });
    await seedEntitlement({ mspAccountId: MSP_ID, plan: "msp", quantity: 10 });
    const ctx = await ctxFor(ALICE, tenant);

    expect(await saveBranding(ctx, BRAND)).toEqual({
      ok: false,
      reason: "notOwner",
    });
  });

  it("answers featureRequired for the account owner on a Free workspace", async () => {
    await seedMspAccount(ALICE, BRANDED);
    const tenant = await seedTenant(1, { mspAccountId: MSP_ID });
    const ctx = await ctxFor(ALICE, tenant);

    expect(ctx.entitlement.plan).toBe("free");
    expect(await saveBranding(ctx, { ...BRAND, name: "Changed" })).toEqual({
      ok: false,
      reason: "featureRequired",
    });
    expect(await clearBranding(ctx)).toEqual({
      ok: false,
      reason: "featureRequired",
    });
    expect(dbQueries).toBe(0);
    expect(await storedBrand()).toEqual(BRANDED);
  });

  it("answers featureRequired on a workspace beyond the covered quantity", async () => {
    await seedMspAccount(ALICE);
    await seedTenant(1, { mspAccountId: MSP_ID });
    const beyond = await seedTenant(2, { mspAccountId: MSP_ID });
    await seedEntitlement({ mspAccountId: MSP_ID, plan: "msp", quantity: 1 });
    const ctx = await ctxFor(ALICE, beyond);

    expect(await saveBranding(ctx, BRAND)).toEqual({
      ok: false,
      reason: "featureRequired",
    });
  });

  it("answers noAccount for a workspace with the feature that is not attached", async () => {
    await seedMspAccount(ALICE);
    const tenant = await seedTenant(1);
    billing = false;
    const ctx = await ctxFor(ALICE, tenant);

    expect(await saveBranding(ctx, BRAND)).toEqual({
      ok: false,
      reason: "noAccount",
    });
    expect((await storedBrand()).brandName).toBeNull();
  });

  it("refuses the shared demo sign-in", async () => {
    const tenant = await seedCovered();
    const ctx = await ctxFor(ALICE, tenant, "owner", true);

    expect(await saveBranding(ctx, BRAND)).toEqual({
      ok: false,
      reason: "demoUser",
    });
  });

  it("refuses invalid input without writing", async () => {
    const tenant = await seedCovered();
    const ctx = await ctxFor(ALICE, tenant);

    for (const input of [
      { ...BRAND, name: "" },
      { ...BRAND, color: "yellow" },
      { ...BRAND, logo: dataUrl("image/png", SVG_BYTES) },
      { ...BRAND, logo: dataUrl("image/svg+xml", SVG_BYTES) },
      null,
      "Northwind IT",
    ]) {
      const result = await saveBranding(ctx, input);
      expect(result.ok).toBe(false);
      expect(!result.ok && result.reason).toBe("invalid");
    }
    expect(dbQueries).toBe(0);
    expect((await storedBrand()).brandName).toBeNull();
  });

  it("clears every brand column for the owner", async () => {
    await seedMspAccount(ALICE, BRANDED);
    const tenant = await seedTenant(1, { mspAccountId: MSP_ID });
    await seedEntitlement({ mspAccountId: MSP_ID, plan: "msp", quantity: 10 });
    const ctx = await ctxFor(ALICE, tenant);

    expect(await clearBranding(ctx)).toEqual({ ok: true });
    expect(await storedBrand()).toEqual({
      brandName: null,
      brandColor: null,
      brandLogo: null,
    });
    expect(await getBranding(tenant, ctx.entitlement)).toBeNull();
  });
});

// --- getBrandingSettings -------------------------------------------------------

describe("getBrandingSettings", () => {
  it("lists the attached workspaces for the account owner", async () => {
    await seedMspAccount(ALICE, BRANDED);
    const first = await seedTenant(1, { mspAccountId: MSP_ID });
    await seedTenant(2, { mspAccountId: MSP_ID });
    await seedTenant(3);

    const settings = await getBrandingSettings(await ctxFor(ALICE, first));

    expect(settings.isOwner).toBe(true);
    expect(settings.branding.name).toBe("Northwind IT");
    expect(settings.workspaces.map((w) => w.name)).toEqual([
      "Workspace 1",
      "Workspace 2",
    ]);
  });

  it("shows a client member the branding, never the other client workspaces", async () => {
    await seedMspAccount(ALICE, BRANDED);
    const first = await seedTenant(1, { mspAccountId: MSP_ID });
    await seedTenant(2, { mspAccountId: MSP_ID });

    const settings = await getBrandingSettings(
      await ctxFor(BOB, first, "admin"),
    );

    expect(settings.isOwner).toBe(false);
    expect(settings.branding.name).toBe("Northwind IT");
    expect(settings.workspaces).toEqual([]);
  });

  it("reports no account for a workspace that is not attached", async () => {
    await seedMspAccount(ALICE, BRANDED);
    const solo = await seedTenant(1);

    const settings = await getBrandingSettings(await ctxFor(ALICE, solo));

    expect(settings.account).toBeNull();
    expect(settings.isOwner).toBe(false);
    expect(settings.branding).toEqual({ name: null, color: null, logo: null });
  });
});
