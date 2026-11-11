import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DAY_MS, RETENTION_DAYS } from "~/lib/retention";
import { RULE_META } from "~/lib/rules";
import * as schema from "~/server/db/schema";

/**
 * The daily retention job against a real Drizzle/PGlite database: stale
 * sign-in rows and expired rate-limit rows are deleted, and person data on
 * old resolved findings is pseudonymised while everything else is kept.
 */

let currentDb: ReturnType<typeof makeDb>;

vi.mock("~/env", () => ({
  env: { NODE_ENV: "test", AUTH_SECRET: "test-secret-test-secret" },
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

const {
  clearResolvedFindingNotes,
  purgeSeenSignins,
  purgeRateLimits,
  pseudonymiseResolvedFindings,
  pseudonymisedDedupeKey,
} = await import("~/server/retention");
const { diffFindings } = await import("~/server/sync/runSync");

const NOW = new Date("2026-11-11T05:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * DAY_MS);
let tenantId: string;

beforeEach(async () => {
  const client = new PGlite();
  for (const stmt of await schemaDdl()) await client.exec(stmt);
  currentDb = makeDb(client);
  const [tenant] = await currentDb
    .insert(schema.tenants)
    .values({ tid: "tid-1", name: "Example Ltd" })
    .returning({ id: schema.tenants.id });
  tenantId = tenant!.id;
});

describe("purgeSeenSignins", () => {
  it("deletes identities not seen within the retention period", async () => {
    const limit = RETENTION_DAYS.seenSignins;
    await currentDb.insert(schema.seenSignins).values([
      {
        oid: "old",
        tid: "t",
        upn: "old@example.com",
        lastSeenAt: daysAgo(limit + 1),
      },
      {
        oid: "recent",
        tid: "t",
        upn: "new@example.com",
        lastSeenAt: daysAgo(limit - 1),
      },
    ]);
    expect(await purgeSeenSignins(NOW)).toBe(1);
    const left = await currentDb.select().from(schema.seenSignins);
    expect(left.map((r) => r.oid)).toEqual(["recent"]);
  });
});

describe("purgeRateLimits", () => {
  it("deletes windows that have ended and keeps live ones", async () => {
    await currentDb.insert(schema.rateLimits).values([
      { key: "demo:203.0.113.9", count: 3, resetAt: daysAgo(1) },
      {
        key: "support:abc",
        count: 1,
        resetAt: new Date(NOW.getTime() + 60_000),
      },
    ]);
    expect(await purgeRateLimits(NOW)).toBe(1);
    const left = await currentDb.select().from(schema.rateLimits);
    expect(left.map((r) => r.key)).toEqual(["support:abc"]);
  });
});

describe("pseudonymiseResolvedFindings", () => {
  const limit = RETENTION_DAYS.resolvedFindingPersonData;
  const base = {
    monthlyImpactCents: 1200,
    firstSeenAt: daysAgo(400),
    lastSeenAt: daysAgo(200),
  };

  beforeEach(async () => {
    await currentDb.insert(schema.findings).values([
      {
        ...base,
        tenantId,
        dedupeKey: "disabled_account_with_license|g-old|-",
        rule: "disabled_account_with_license",
        graphUserId: "g-old",
        title: "Disabled account still licensed: Alex Example",
        detail: {
          upn: "alex@example.com",
          displayName: "Alex Example",
          licenses: [{ skuId: "s" }],
        },
        status: "resolved",
        resolvedAt: daysAgo(limit + 1),
        workflowNote: "Asked Alex's manager",
      },
      {
        ...base,
        tenantId,
        dedupeKey: "saas_orphaned|zoom:sam@example.com|-",
        rule: "saas_orphaned",
        graphUserId: null,
        title: "Zoom seat without Entra account: sam@example.com",
        detail: { upn: "sam@example.com", products: ["Pro"], provider: "zoom" },
        status: "resolved",
        resolvedAt: daysAgo(limit + 5),
      },
      {
        ...base,
        tenantId,
        dedupeKey: "inactive_90d|g-recent|-",
        rule: "inactive_90d",
        graphUserId: "g-recent",
        title: "No activity for 120 days: Robin Example",
        detail: { upn: "robin@example.com", displayName: "Robin Example" },
        status: "resolved",
        resolvedAt: daysAgo(limit - 1),
      },
      {
        ...base,
        tenantId,
        dedupeKey: "never_active|g-open|-",
        rule: "never_active",
        graphUserId: "g-open",
        title: "Licensed but never active: Kim Example",
        detail: { upn: "kim@example.com", displayName: "Kim Example" },
        status: "open",
      },
      {
        ...base,
        tenantId,
        dedupeKey: "shelfware||sku-1",
        rule: "shelfware",
        graphUserId: null,
        skuId: "sku-1",
        title: "12 unassigned seats of E3",
        detail: { unassigned: 12 },
        status: "resolved",
        resolvedAt: daysAgo(limit + 30),
      },
    ]);
  });

  const byRule = async (rule: string) =>
    (
      await currentDb
        .select()
        .from(schema.findings)
        .where(eq(schema.findings.rule, rule as never))
    )[0]!;

  it("removes names, UPNs and notes from findings resolved past the period", async () => {
    expect(await pseudonymiseResolvedFindings(NOW)).toBe(2);
    expect(await clearResolvedFindingNotes(NOW)).toBe(1);

    const ms = await byRule("disabled_account_with_license");
    expect(ms.title).toBe(RULE_META.disabled_account_with_license.label);
    expect(ms.detail).toEqual({
      licenses: [{ skuId: "s" }],
      pseudonymised: true,
    });
    expect(ms.workflowNote).toBeNull();
    expect(ms.graphUserId).toBe("g-old");
    expect(ms.dedupeKey).toBe("disabled_account_with_license|g-old|-");

    const saas = await byRule("saas_orphaned");
    expect(saas.title).toBe(RULE_META.saas_orphaned.label);
    expect(JSON.stringify(saas)).not.toContain("sam@example.com");
    expect(saas.dedupeKey).toMatch(/^pseudonymised:[0-9a-f]{64}$/);
  });

  it("keeps recently resolved, open and aggregate findings unchanged", async () => {
    await pseudonymiseResolvedFindings(NOW);
    expect((await byRule("inactive_90d")).title).toContain("Robin Example");
    expect((await byRule("never_active")).title).toContain("Kim Example");
    expect((await byRule("shelfware")).title).toBe("12 unassigned seats of E3");
  });

  it("is idempotent", async () => {
    expect(await pseudonymiseResolvedFindings(NOW)).toBe(2);
    expect(await pseudonymiseResolvedFindings(NOW)).toBe(0);
  });
});

describe("clearResolvedFindingNotes", () => {
  it("clears notes on old resolved findings, aggregate and already pseudonymised ones included", async () => {
    const limit = RETENTION_DAYS.resolvedFindingPersonData;
    await currentDb.insert(schema.findings).values([
      {
        tenantId,
        dedupeKey: "shelfware||sku-9",
        rule: "shelfware",
        graphUserId: null,
        skuId: "sku-9",
        title: "3 unassigned seats",
        detail: { unassigned: 3 },
        monthlyImpactCents: 100,
        status: "resolved",
        resolvedAt: daysAgo(limit + 1),
        firstSeenAt: daysAgo(300),
        lastSeenAt: daysAgo(200),
        workflowNote: "Agreed with Alex Example",
        ticketUrl: "https://tickets.example/?user=alex@example.com",
      },
      {
        tenantId,
        dedupeKey: "never_active|g-p|-",
        rule: "never_active",
        graphUserId: "g-p",
        title: RULE_META.never_active.label,
        detail: { pseudonymised: true },
        monthlyImpactCents: 100,
        status: "resolved",
        resolvedAt: daysAgo(limit + 40),
        firstSeenAt: daysAgo(300),
        lastSeenAt: daysAgo(200),
        workflowNote: "Added after pseudonymisation: ask Kim",
      },
      {
        tenantId,
        dedupeKey: "never_active|g-q|-",
        rule: "never_active",
        graphUserId: "g-q",
        title: "Licensed but never active: Quinn",
        detail: {},
        monthlyImpactCents: 100,
        status: "resolved",
        resolvedAt: daysAgo(limit - 1),
        firstSeenAt: daysAgo(300),
        lastSeenAt: daysAgo(200),
        workflowNote: "Recent note",
        ticketUrl: "https://tickets.example/recent",
      },
      {
        tenantId,
        dedupeKey: "never_active|g-r|-",
        rule: "never_active",
        graphUserId: "g-r",
        title: RULE_META.never_active.label,
        detail: { pseudonymised: true },
        monthlyImpactCents: 100,
        status: "resolved",
        resolvedAt: daysAgo(limit + 2),
        firstSeenAt: daysAgo(300),
        lastSeenAt: daysAgo(200),
        ticketUrl: "https://tickets.example/?user=riley@example.com",
      },
    ]);
    expect(await clearResolvedFindingNotes(NOW)).toBe(3);
    const all = await currentDb.select().from(schema.findings);
    expect(all.map((f) => f.workflowNote).filter((n) => n !== null)).toEqual([
      "Recent note",
    ]);
    expect(all.map((f) => f.ticketUrl).filter((n) => n !== null)).toEqual([
      "https://tickets.example/recent",
    ]);
  });
});

describe("pseudonymised findings across syncs", () => {
  const seat = (email: string) => ({
    dedupeKey: `saas_orphaned|zoom:${email}|-`,
    rule: "saas_orphaned" as const,
    graphUserId: null,
    skuId: null,
    title: `Zoom seat without Entra account: ${email}`,
    detail: { upn: email, products: ["Pro"], provider: "zoom" },
    monthlyImpactCents: 1500,
  });
  const rows = () =>
    currentDb
      .select()
      .from(schema.findings)
      .where(eq(schema.findings.tenantId, tenantId));

  it("hashes the key exactly like the SQL does", async () => {
    await diffFindings(tenantId, [seat("sam@example.com")], daysAgo(300));
    await diffFindings(tenantId, [], daysAgo(200));
    await pseudonymiseResolvedFindings(NOW);
    const [row] = await rows();
    expect(row!.dedupeKey).toBe(
      pseudonymisedDedupeKey("saas_orphaned|zoom:sam@example.com|-"),
    );
  });

  it("reopens the same row when the seat recurs and survives a second retention pass", async () => {
    const limit = RETENTION_DAYS.resolvedFindingPersonData;
    const email = "sam@example.com";

    // Found, then resolved long enough ago, then pseudonymised.
    await diffFindings(tenantId, [seat(email)], daysAgo(400));
    await diffFindings(tenantId, [], daysAgo(limit + 10));
    expect(await pseudonymiseResolvedFindings(NOW)).toBe(1);

    // The seat shows up again: no second row, plain key and title are back.
    const inserted = await diffFindings(tenantId, [seat(email)], NOW);
    expect(inserted).toEqual([]);
    let all = await rows();
    expect(all).toHaveLength(1);
    expect(all[0]!.status).toBe("open");
    expect(all[0]!.dedupeKey).toBe(`saas_orphaned|zoom:${email}|-`);
    expect(all[0]!.title).toContain(email);

    // Resolved again and aged out again: pseudonymised again, no conflict.
    const later = new Date(NOW.getTime() + (limit + 5) * DAY_MS);
    await diffFindings(tenantId, [], NOW);
    expect(await pseudonymiseResolvedFindings(later)).toBe(1);
    all = await rows();
    expect(all).toHaveLength(1);
    expect(JSON.stringify(all[0])).not.toContain(email);
  });

  it("pseudonymises a row whose hashed key another row already holds, under a distinct key", async () => {
    const limit = RETENTION_DAYS.resolvedFindingPersonData;
    const key = "saas_orphaned|zoom:dup@example.com|-";
    await currentDb.insert(schema.findings).values([
      {
        tenantId,
        dedupeKey: pseudonymisedDedupeKey(key),
        rule: "saas_orphaned",
        graphUserId: null,
        title: RULE_META.saas_orphaned.label,
        detail: { pseudonymised: true },
        monthlyImpactCents: 100,
        status: "resolved",
        resolvedAt: daysAgo(limit + 50),
        firstSeenAt: daysAgo(400),
        lastSeenAt: daysAgo(300),
      },
      {
        tenantId,
        dedupeKey: key,
        rule: "saas_orphaned",
        graphUserId: null,
        title: "Zoom seat without Entra account: dup@example.com",
        detail: { upn: "dup@example.com" },
        monthlyImpactCents: 100,
        status: "resolved",
        resolvedAt: daysAgo(limit + 5),
        firstSeenAt: daysAgo(200),
        lastSeenAt: daysAgo(100),
      },
    ]);
    await expect(pseudonymiseResolvedFindings(NOW)).resolves.toBe(1);
    const all = await rows();
    expect(JSON.stringify(all)).not.toContain("dup@example.com");
    const keys = all.map((r) => r.dedupeKey).sort();
    const hashed = pseudonymisedDedupeKey(key);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(hashed);
    expect(keys[1]).toMatch(new RegExp(`^${hashed}:[0-9a-f-]{36}$`));

    // The seat comes back: exactly one row reopens with the plain key.
    await diffFindings(tenantId, [seat("dup@example.com")], NOW);
    const after = await rows();
    expect(after.filter((r) => r.dedupeKey === key)).toHaveLength(1);
    expect(after.filter((r) => r.status === "open")).toHaveLength(1);
  });

  it("restores the plain key once when both the plain and the hashed row exist", async () => {
    const key = "saas_orphaned|zoom:both@example.com|-";
    const base = {
      tenantId,
      rule: "saas_orphaned" as const,
      graphUserId: null,
      monthlyImpactCents: 100,
      status: "resolved" as const,
      resolvedAt: daysAgo(10),
      firstSeenAt: daysAgo(400),
      lastSeenAt: daysAgo(300),
    };
    await currentDb.insert(schema.findings).values([
      {
        ...base,
        dedupeKey: pseudonymisedDedupeKey(key),
        title: RULE_META.saas_orphaned.label,
        detail: { pseudonymised: true },
      },
      {
        ...base,
        dedupeKey: key,
        title: "Zoom seat without Entra account: both@example.com",
        detail: { upn: "both@example.com" },
      },
    ]);
    await diffFindings(tenantId, [seat("both@example.com")], NOW);
    const all = await rows();
    expect(all).toHaveLength(2);
    expect(all.filter((r) => r.dedupeKey === key)).toHaveLength(1);
    expect(all.find((r) => r.dedupeKey === key)!.status).toBe("open");
    expect(
      all.find((r) => r.dedupeKey === pseudonymisedDedupeKey(key))!.status,
    ).toBe("resolved");
  });
});
