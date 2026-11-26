import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "~/server/db/schema";
import { DEMO_EMAIL, DEMO_OID, DEMO_TID } from "~/server/demo/constants";
import { WorkspaceUpdateInProgressError } from "~/server/sync/lockTenant";

/**
 * The demo principal must never create or claim a workspace other than the
 * fixed demo workspace. Before the fix, the action's only demo refusal was
 * `existing.isDemo`, which is unreachable because `existing` is selected with
 * isNull(tenants.consentedAt) while the demo tenant is seeded with consentedAt
 * set; the create branch then provisioned a second, non-demo workspace under
 * the shared DEMO_OID. This suite drives the real action against PGlite.
 */

let currentDb: ReturnType<typeof makeDb>;

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

const requireSession = vi.fn();
const runAnalysis = vi.fn<() => Promise<void>>();
const setCookie = vi.fn();

vi.mock("~/server/access", () => ({
  requireSession,
  WORKSPACE_COOKIE: "lm_ws",
  workspaceCookieOptions: () => ({}),
}));
vi.mock("~/server/rateLimit", () => ({
  rateLimitDurable: () => Promise.resolve(true),
  clientIp: () => "unknown",
}));
vi.mock("~/server/sync/runSync", () => ({
  runAnalysis,
}));
vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve({ get: () => undefined, set: setCookie }),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));

const { submitCsvImport } = await import("./actions");

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

beforeEach(async ({ onTestFinished }) => {
  const client = new PGlite();
  onTestFinished(() => client.close());
  requireSession.mockReset();
  runAnalysis.mockReset();
  setCookie.mockClear();
  for (const stmt of await schemaDdl()) await client.exec(stmt);
  currentDb = makeDb(client);
});

const DIRECTORY_CSV =
  "User Principal Name,Display Name,Licenses\n" +
  "alice@acme.example,Alice Example,ENTERPRISEPACK\n";

const importForm = () => {
  const formData = new FormData();
  formData.set(
    "directory",
    new File([DIRECTORY_CSV], "users.csv", { type: "text/csv" }),
  );
  formData.set("orgName", "Acme Imported");
  return formData;
};

describe("submitCsvImport", () => {
  it("refuses the demo principal without creating a shared workspace", async () => {
    requireSession.mockResolvedValue({ user: { oid: DEMO_OID, isDemo: true } });
    const [demoTenant] = await currentDb
      .insert(schema.tenants)
      .values({
        tid: DEMO_TID,
        name: "Meridian Industries GmbH (Demo)",
        isDemo: true,
        consentedAt: new Date(),
      })
      .returning();
    await currentDb.insert(schema.memberships).values({
      tenantId: demoTenant!.id,
      oid: DEMO_OID,
      email: DEMO_EMAIL,
      name: "Demo Admin",
      role: "owner",
    });

    const result = await submitCsvImport(importForm());
    expect(result.ok).toBe(false);

    const tenants = await currentDb.select().from(schema.tenants);
    expect(tenants).toHaveLength(1);
    expect(tenants[0]!.isDemo).toBe(true);

    const memberships = await currentDb
      .select()
      .from(schema.memberships)
      .where(eq(schema.memberships.oid, DEMO_OID));
    expect(memberships).toHaveLength(1);
    expect(memberships[0]!.tenantId).toBe(demoTenant!.id);
  });

  it.each([
    { busy: false, destination: "/app" },
    { busy: true, destination: "/app?csvAnalysis=pending" },
  ])(
    "saves the import and selects the workspace with busy=$busy",
    async ({ busy, destination }) => {
      requireSession.mockResolvedValue({
        user: {
          oid: "00000000-0000-4000-8000-000000000001",
          tid: "00000000-0000-4000-8000-000000000002",
          upn: "admin@example.test",
        },
      });
      if (busy)
        runAnalysis.mockRejectedValue(new WorkspaceUpdateInProgressError(null));
      else runAnalysis.mockResolvedValue(undefined);

      await expect(submitCsvImport(importForm())).rejects.toThrow(
        `redirect:${destination}`,
      );
      const [tenant] = await currentDb.select().from(schema.tenants);
      expect(tenant?.name).toBe("Acme Imported");
      expect(runAnalysis).toHaveBeenCalledWith(tenant?.id);
      expect(setCookie).toHaveBeenCalledWith("lm_ws", tenant?.id, {});
      expect(await currentDb.select().from(schema.tenantUsers)).toMatchObject([
        { tenantId: tenant?.id, upn: "alice@acme.example" },
      ]);
    },
  );
});
