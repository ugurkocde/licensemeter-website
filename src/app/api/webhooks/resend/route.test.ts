import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { Webhook } from "svix";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "~/server/db/schema";

/**
 * Route test for the Resend webhook against a real Drizzle/PGlite instance, so
 * "nothing written" and "applied" are read back from the actual tables.
 */

// A Svix secret: whsec_ plus the base64 of the key.
const SECRET = `whsec_${Buffer.from("placeholder-key-for-tests-only-32b").toString("base64")}`;
const OTHER_SECRET = `whsec_${Buffer.from("another-placeholder-key-for-tests").toString("base64")}`;
const testEnv: Record<string, string | undefined> = {};
let currentDb: ReturnType<typeof makeDb>;

vi.mock("~/env", () => ({ env: testEnv }));
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

const route = await import("./route");
const { POST } = route;

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

const TENANT_ID = "11111111-1111-1111-1111-111111111111";
const ANNA = "anna@contoso.test";

const bounced = JSON.stringify({
  type: "email.bounced",
  created_at: "2026-09-14T06:00:00.000Z",
  data: { email_id: "re_anna", to: [ANNA] },
});

const signed = (
  body: string,
  secret = SECRET,
  extraHeaders: Record<string, string> = {},
): Request => {
  const id = "msg_test_1";
  const timestamp = new Date();
  return new Request("https://licensemeter.test/api/webhooks/resend", {
    method: "POST",
    body,
    headers: {
      "svix-id": id,
      "svix-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
      "svix-signature": new Webhook(secret).sign(id, timestamp, body),
      ...extraHeaders,
    },
  });
};

const deliveryStatus = async () =>
  (await currentDb.query.emailDeliveries.findFirst())?.deliveryStatus;

beforeEach(async () => {
  const client = new PGlite();
  for (const stmt of await schemaDdl()) await client.exec(stmt);
  currentDb = makeDb(client);
  testEnv.RESEND_WEBHOOK_SECRET = SECRET;
  await currentDb
    .insert(schema.tenants)
    .values({ id: TENANT_ID, name: "Acme" });
  await currentDb.insert(schema.emailDeliveries).values({
    tenantId: TENANT_ID,
    job: "digest",
    periodKey: "2026-W38",
    recipient: ANNA,
    status: "sent",
    providerId: "re_anna",
  });
});

describe("POST /api/webhooks/resend", () => {
  it("only answers POST", () => {
    expect(Object.keys(route)).toEqual(["POST"]);
  });

  it("answers 503 when the secret is not configured", async () => {
    testEnv.RESEND_WEBHOOK_SECRET = undefined;
    const res = await POST(signed(bounced));
    expect(res.status).toBe(503);
    expect(await deliveryStatus()).toBeNull();
  });

  it("answers 413 when the declared length is too large", async () => {
    const res = await POST(
      signed(bounced, SECRET, { "content-length": "100001" }),
    );
    expect(res.status).toBe(413);
    expect(await deliveryStatus()).toBeNull();
  });

  it("answers 413 when the actual body is too large, whatever was declared", async () => {
    const big = JSON.stringify({ pad: "x".repeat(100_001) });
    const res = await POST(signed(big, SECRET, { "content-length": "10" }));
    expect(res.status).toBe(413);
  });

  it("answers 400 for a bad or missing signature and writes nothing", async () => {
    expect((await POST(signed(bounced, OTHER_SECRET))).status).toBe(400);
    // Signed for a different body.
    const tampered = signed(bounced.replace("re_anna", "re_other"));
    const forged = new Request(tampered.url, {
      method: "POST",
      body: bounced,
      headers: tampered.headers,
    });
    expect((await POST(forged)).status).toBe(400);
    const bare = new Request(tampered.url, { method: "POST", body: bounced });
    expect((await POST(bare)).status).toBe(400);

    expect(await deliveryStatus()).toBeNull();
    expect(await currentDb.query.emailBlocks.findMany()).toHaveLength(0);
  });

  it("applies a valid event and answers 200", async () => {
    const res = await POST(signed(bounced));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(await deliveryStatus()).toBe("bounced");
    expect(await currentDb.query.emailBlocks.findMany()).toMatchObject([
      { tenantId: TENANT_ID, email: ANNA, reason: "bounced" },
    ]);
  });

  it("answers 200 for signed events it does not track or cannot read", async () => {
    for (const body of [
      JSON.stringify({ type: "email.opened", data: {} }),
      JSON.stringify({ unexpected: true }),
      "not json",
    ]) {
      expect((await POST(signed(body))).status).toBe(200);
    }
    expect(await deliveryStatus()).toBeNull();
  });

  it("lets a persistence error surface so Resend retries", async () => {
    currentDb = {
      transaction: () => Promise.reject(new Error("connection lost")),
    } as unknown as typeof currentDb;
    await expect(POST(signed(bounced))).rejects.toThrow("connection lost");
  });
});
