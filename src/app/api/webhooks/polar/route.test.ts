import { createHmac } from "node:crypto";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "~/server/db/schema";

/**
 * Route test for the Polar webhook against a real Drizzle/PGlite instance, so
 * "nothing written" and "applied once" are read back from the actual tables.
 */

// A Standard Webhooks secret: whsec_ plus the base64 of the key.
const SECRET = `whsec_${Buffer.from("placeholder-key-for-tests-only-32b").toString("base64")}`;
const keyOf = (secret: string) =>
  secret.startsWith("whsec_")
    ? Buffer.from(secret.slice(6), "base64")
    : Buffer.from(secret, "utf-8");
const testEnv: Record<string, string | undefined> = {};
let currentDb: ReturnType<typeof makeDb>;

vi.mock("~/env", () => ({ env: testEnv }));
vi.mock("~/server/ops", () => ({ notifyOps: vi.fn() }));
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

const { POST } = await import("./route");
const { notifyOps } = await import("~/server/ops");

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

const payload = (
  type = "subscription.active",
  data: Record<string, unknown> = {},
) => ({
  type,
  timestamp: new Date().toISOString(),
  data: {
    id: "sub_1",
    status: "active",
    product_id: "prod-pro-month",
    customer_id: "cus_1",
    customer: { id: "cus_1", external_id: `t_${TENANT_ID}` },
    metadata: { owner_ref: `t_${TENANT_ID}` },
    seats: null,
    current_period_end: "2099-01-01T00:00:00Z",
    trial_end: null,
    cancel_at_period_end: false,
    ended_at: null,
    ...data,
  },
});

const request = (
  body: unknown,
  options: { id?: string; secret?: string; sentAt?: number; raw?: string } = {},
) => {
  const raw = options.raw ?? JSON.stringify(body);
  const id = options.id ?? "msg_1";
  const sentAt = String(options.sentAt ?? Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", keyOf(options.secret ?? SECRET))
    .update(`${id}.${sentAt}.${raw}`)
    .digest("base64");
  return new Request("https://licensemeter.com/api/webhooks/polar", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "webhook-id": id,
      "webhook-timestamp": sentAt,
      "webhook-signature": `v1,${signature}`,
    },
    body: raw,
  });
};

const rows = () => currentDb.select().from(schema.entitlements);
const ledger = () => currentDb.select().from(schema.billingEvents);

beforeEach(async () => {
  const client = new PGlite();
  for (const stmt of await schemaDdl()) await client.exec(stmt);
  currentDb = makeDb(client);
  await currentDb
    .insert(schema.tenants)
    .values({ id: TENANT_ID, name: "Workspace" });
  testEnv.POLAR_WEBHOOK_SECRET = SECRET;
  testEnv.POLAR_PRODUCT_PRO_MONTH = "prod-pro-month";
  vi.mocked(notifyOps).mockClear();
});

describe("Polar webhook", () => {
  it("answers 503 when the secret is not configured", async () => {
    testEnv.POLAR_WEBHOOK_SECRET = undefined;

    const res = await POST(request(payload()));

    expect(res.status).toBe(503);
    expect(await ledger()).toEqual([]);
  });

  it("rejects a bad signature and writes nothing", async () => {
    const res = await POST(request(payload(), { secret: "polar_whs_wrong" }));

    expect(res.status).toBe(400);
    expect(await rows()).toEqual([]);
    expect(await ledger()).toEqual([]);
  });

  it("rejects a body that was changed after signing", async () => {
    const signed = request(payload());
    const tampered = new Request(signed.url, {
      method: "POST",
      headers: signed.headers,
      body: JSON.stringify(payload("subscription.active", { seats: 500 })),
    });

    expect((await POST(tampered)).status).toBe(400);
    expect(await rows()).toEqual([]);
  });

  it("rejects a stale timestamp even when the signature is valid", async () => {
    const sentAt = Math.floor(Date.now() / 1000) - 10 * 60;

    const res = await POST(request(payload(), { sentAt }));

    expect(res.status).toBe(400);
    expect(await rows()).toEqual([]);
    expect(await ledger()).toEqual([]);
  });

  it("rejects a signed body that is not a webhook envelope", async () => {
    expect((await POST(request(null, { raw: "not json" }))).status).toBe(400);
    expect((await POST(request({ type: "subscription.active" }))).status).toBe(
      400,
    );
    expect(
      (await POST(request(payload("subscription.active", { id: 7 })))).status,
    ).toBe(400);
    expect(await ledger()).toEqual([]);
  });

  it("refuses an oversized body", async () => {
    const res = await POST(request(null, { raw: "x".repeat(256_001) }));
    expect(res.status).toBe(413);
  });

  it("applies a valid event once and answers 2xx for its redelivery", async () => {
    const first = await POST(request(payload()));
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ received: true, result: "applied" });

    const again = await POST(request(payload()));
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ received: true, result: "duplicate" });

    expect(await rows()).toMatchObject([
      {
        tenantId: TENANT_ID,
        plan: "pro",
        source: "polar",
        status: "active",
        quantity: 1,
        providerSubscriptionId: "sub_1",
        providerCustomerId: "cus_1",
      },
    ]);
    expect(await ledger()).toMatchObject([
      { provider: "polar", eventId: "msg_1", type: "subscription.active" },
    ]);
  });

  it("answers 2xx for a stale event and for a comped owner", async () => {
    await POST(request(payload(), { id: "msg_new" }));
    const older = {
      ...payload("subscription.past_due", { status: "past_due" }),
      timestamp: new Date(Date.now() - 60_000).toISOString(),
    };
    const stale = await POST(request(older, { id: "msg_old" }));
    expect(stale.status).toBe(200);
    expect(await stale.json()).toMatchObject({ result: "stale" });
    expect(await rows()).toMatchObject([{ status: "active" }]);

    await currentDb.update(schema.entitlements).set({ source: "comped" });
    const comped = await POST(
      request(payload("subscription.revoked", { status: "canceled" }), {
        id: "msg_comped",
      }),
    );
    expect(comped.status).toBe(200);
    expect(await comped.json()).toMatchObject({ result: "comped" });
    expect(await rows()).toMatchObject([
      { source: "comped", status: "active" },
    ]);
  });

  it("answers 2xx without writing for an event type it does not use", async () => {
    const res = await POST(request(payload("order.created")));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, result: "ignored" });
    expect(await ledger()).toEqual([]);
  });

  it("skips a product that is not ours without alerting", async () => {
    const res = await POST(
      request(payload("subscription.active", { product_id: "prod-other" })),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      result: "ignored",
      reason: "unknownProduct",
    });
    expect(await rows()).toEqual([]);
    expect(notifyOps).not.toHaveBeenCalled();
  });

  it("reports one of our subscriptions whose owner it cannot place", async () => {
    const unknown = "11111111-1111-1111-1111-000000000099";
    for (const data of [
      { customer: { external_id: null }, metadata: {} },
      // Parses, but the workspace is gone.
      { customer: { external_id: `t_${unknown}` }, metadata: {} },
    ]) {
      const res = await POST(request(payload("subscription.active", data)));
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        result: "ignored",
        reason: "unknownOwner",
      });
    }
    expect(await rows()).toEqual([]);
    expect(await ledger()).toEqual([]);
    expect(notifyOps).toHaveBeenCalledTimes(2);
  });

  it("keeps a running plan when an older subscription of the same owner ends", async () => {
    await POST(request(payload(), { id: "msg_running" }));

    const res = await POST(
      request(
        payload("subscription.revoked", {
          id: "sub_old",
          status: "canceled",
          ended_at: "2026-01-01T00:00:00Z",
        }),
        { id: "msg_old_sub" },
      ),
    );

    expect(await res.json()).toMatchObject({
      result: "ignored",
      reason: "superseded",
    });
    expect(await rows()).toMatchObject([
      { status: "active", providerSubscriptionId: "sub_1" },
    ]);
  });
});

describe("Polar webhook body cap", () => {
  it("stops reading a chunked body once it exceeds the cap", async () => {
    let pulls = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        if (pulls > 50) {
          controller.close();
          return;
        }
        controller.enqueue(new Uint8Array(10_000));
      },
    });
    const req = new Request("http://localhost/api/webhooks/polar", {
      method: "POST",
      body: stream,
      duplex: "half",
    } as RequestInit & { duplex: string });

    const res = await POST(req);

    expect(res.status).toBe(413);
    // 256 KB cap at 10 KB per pull stops near 27; the old code buffered all 50.
    expect(pulls).toBeLessThan(40);
  });
});
