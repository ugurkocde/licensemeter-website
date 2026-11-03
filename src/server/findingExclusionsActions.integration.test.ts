import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AccessContext } from "~/server/access";
import * as schema from "~/server/db/schema";
import { freshDb, seedTenant, type TestDb } from "~/server/mcp/testHarness";

/**
 * Who may edit the finding exclusions and how input is validated. The real
 * action runs against a real database; only the access layer is a fixture.
 */

let currentDb: TestDb;
let tenant: schema.TenantRow;
let member: { role: "viewer" | "admin" | "owner"; isDemo: boolean };

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

vi.mock("~/server/access", () => ({
  apiAccess: async (minRole: keyof typeof RANK) =>
    RANK[member.role] >= RANK[minRole]
      ? ({
          user: { oid: "user_1", tid: "", upn: "a@a.example", name: "A" },
          tenant: { ...tenant, isDemo: member.isDemo },
          membership: { id: "m1", role: member.role, email: "a@a.example" },
          workspaces: [],
        } as unknown as AccessContext)
      : null,
}));

const { setFindingExclusions } = await import("~/server/actions");

const form = (patterns: string) => {
  const data = new FormData();
  data.set("patterns", patterns);
  return data;
};

const stored = async () =>
  (
    await currentDb.query.tenants.findFirst({
      where: eq(schema.tenants.id, tenant.id),
    })
  )?.findingExclusions;

beforeEach(async () => {
  currentDb = await freshDb();
  tenant = await seedTenant(currentDb, 1);
  member = { role: "admin", isDemo: false };
});

describe("setFindingExclusions", () => {
  it.each(["admin", "owner"] as const)(
    "lets an %s save cleaned patterns",
    async (role) => {
      member.role = role;
      expect(
        await setFindingExclusions(form(" svc-* \nSVC-*\n*@rooms.contoso.com")),
      ).toEqual({
        ok: true,
      });
      expect(await stored()).toEqual(["svc-*", "*@rooms.contoso.com"]);
      const [entry] = await currentDb.query.auditLog.findMany();
      expect(entry).toMatchObject({
        action: "finding_exclusions_changed",
        detail: { patterns: 2 },
      });
    },
  );

  it("refuses viewers and the demo workspace", async () => {
    member.role = "viewer";
    expect((await setFindingExclusions(form("svc-*"))).ok).toBe(false);
    member = { role: "admin", isDemo: true };
    expect((await setFindingExclusions(form("svc-*"))).ok).toBe(false);
    expect(await stored()).toEqual([]);
  });

  it("rejects invalid input and keeps the stored patterns", async () => {
    await setFindingExclusions(form("svc-*"));
    for (const bad of [
      "*",
      "x".repeat(121),
      Array.from({ length: 52 }, (_, i) => `p${i}`).join("\n"),
    ]) {
      expect((await setFindingExclusions(form(bad))).ok).toBe(false);
    }
    expect((await setFindingExclusions(new FormData())).ok).toBe(false);
    expect(await stored()).toEqual(["svc-*"]);
  });

  it("clears the exclusions with an empty list", async () => {
    await setFindingExclusions(form("svc-*"));
    expect(await setFindingExclusions(form(""))).toEqual({ ok: true });
    expect(await stored()).toEqual([]);
  });
});
