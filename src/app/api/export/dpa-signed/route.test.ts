import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DPA_VERSION } from "~/lib/dpa";
import type { AccessContext } from "~/server/access";
import * as schema from "~/server/db/schema";

/**
 * The signed PDF download against a real PGlite database, with the session
 * layer replaced by a stub: the route must answer 401 without a member, 404
 * without a record for that workspace, and a PDF for a member. The document
 * itself is rendered for real.
 */

let currentDb: ReturnType<typeof makeDb>;

vi.mock("~/env", () => ({
  env: { NODE_ENV: "test" },
  billingEnabled: () => true,
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

vi.mock("~/server/access", () => ({ apiAccess: vi.fn() }));

const { GET } = await import("./route");
const { apiAccess } = await import("~/server/access");

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

const TENANT_ID = "11111111-1111-1111-1111-000000000001";
const OTHER_ID = "11111111-1111-1111-1111-000000000002";

const member = (tenantId: string): AccessContext =>
  ({
    user: { oid: "user_1", tid: "", upn: "v@contoso.example", isDemo: false },
    tenant: { id: tenantId, isDemo: false },
    membership: { role: "viewer", email: "v@contoso.example" },
  }) as unknown as AccessContext;

const seedAgreement = async (
  tenantId: string,
  kind: "controller" | "subprocessor" = "controller",
) => {
  await currentDb.insert(schema.dpaAgreements).values({
    tenantId,
    kind,
    version: DPA_VERSION,
    language: "en",
    companyName: "Contoso GmbH",
    companyAddress: "Musterstrasse 1, 10115 Berlin",
    signerName: "Dana Example",
    signerTitle: "Head of IT",
    signerEmail: "dana@contoso.example",
    signedByKey: "user_1",
    signedAt: new Date("2026-09-19T09:30:00Z"),
  });
};

const request = (query = "") =>
  new Request(`https://licensemeter.example/api/export/dpa-signed${query}`);

const isPdf = (buffer: Buffer) =>
  buffer.subarray(0, 5).toString("latin1") === "%PDF-";

beforeEach(async () => {
  const client = new PGlite();
  for (const stmt of await schemaDdl()) await client.exec(stmt);
  currentDb = makeDb(client);
  await currentDb.insert(schema.tenants).values([
    { id: TENANT_ID, name: "Contoso" },
    { id: OTHER_ID, name: "Fabrikam" },
  ]);
  vi.resetAllMocks();
  vi.mocked(apiAccess).mockResolvedValue(member(TENANT_ID));
});

describe("GET /api/export/dpa-signed", () => {
  it("answers 401 without a session", async () => {
    vi.mocked(apiAccess).mockResolvedValue(null);
    await seedAgreement(TENANT_ID);

    const res = await GET(request("?kind=controller&lang=en"));

    expect(res.status).toBe(401);
    expect(apiAccess).toHaveBeenCalledWith("viewer");
  });

  it("answers 404 without a record for this workspace", async () => {
    // Another workspace's agreement is never served.
    await seedAgreement(OTHER_ID);

    expect((await GET(request("?kind=controller"))).status).toBe(404);
    expect((await GET(request("?kind=subprocessor"))).status).toBe(404);
  });

  it("answers 400 for an unknown kind", async () => {
    await seedAgreement(TENANT_ID);
    expect((await GET(request("?kind=partner"))).status).toBe(400);
  });

  it("serves the signed PDF to a member, uncached, in both languages", async () => {
    await seedAgreement(TENANT_ID);

    const en = await GET(request("?kind=controller&lang=en"));
    expect(en.status).toBe(200);
    expect(en.headers.get("Content-Type")).toBe("application/pdf");
    expect(en.headers.get("Cache-Control")).toBe("private, no-store");
    expect(en.headers.get("Content-Disposition")).toBe(
      `attachment; filename="LicenseMeter-DPA-en-contoso-gmbh-v${DPA_VERSION}.pdf"`,
    );
    expect(isPdf(Buffer.from(await en.arrayBuffer()))).toBe(true);

    const de = await GET(request("?kind=controller&lang=de"));
    expect(de.status).toBe(200);
    expect(de.headers.get("Content-Disposition")).toContain(
      `LicenseMeter-AVV-de-contoso-gmbh-v${DPA_VERSION}.pdf`,
    );
    expect(isPdf(Buffer.from(await de.arrayBuffer()))).toBe(true);
  }, 60_000);

  it("defaults to the controller agreement in English", async () => {
    await seedAgreement(TENANT_ID);
    const res = await GET(request());
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toContain("-DPA-en-");
  }, 60_000);
});
