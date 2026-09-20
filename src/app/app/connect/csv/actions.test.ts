import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "~/server/db/schema";
import { DEMO_EMAIL, DEMO_OID, DEMO_TID } from "~/server/demo/constants";

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

vi.mock("~/server/access", () => ({
  requireSession: () =>
    Promise.resolve({
      user: {
        oid: "00000000-0000-0000-0000-0000demoadmin",
        tid: "00000000-0000-0000-0000-00000000demo",
        upn: "demo.admin@meridian.example",
        name: "Demo Admin",
        email: "demo.admin@meridian.example",
        isDemo: true,
        emailProven: false,
      },
    }),
  WORKSPACE_COOKIE: "lm_ws",
  workspaceCookieOptions: () => ({}),
}));
vi.mock("~/server/rateLimit", () => ({
  rateLimitDurable: () => Promise.resolve(true),
  clientIp: () => "unknown",
}));
vi.mock("~/server/sync/runSync", () => ({
  runAnalysis: () => Promise.resolve(),
  runSync: () => Promise.resolve(),
}));
vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({ get: () => undefined, set: () => undefined }),
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

beforeEach(async () => {
  const client = new PGlite();
  for (const stmt of await schemaDdl()) await client.exec(stmt);
  currentDb = makeDb(client);
});

const DIRECTORY_CSV =
  "User Principal Name,Display Name,Licenses\n" +
  "alice@acme.example,Alice Example,ENTERPRISEPACK\n";

describe("submitCsvImport demo guard", () => {
  it("refuses the demo principal without creating a shared workspace", async () => {
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

    const formData = new FormData();
    formData.set(
      "directory",
      new File([DIRECTORY_CSV], "users.csv", { type: "text/csv" }),
    );
    formData.set("orgName", "Acme Imported");

    const result = await submitCsvImport(formData);
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
});
