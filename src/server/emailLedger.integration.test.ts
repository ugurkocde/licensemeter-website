import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "~/server/db/schema";

/**
 * Claim rules of the email delivery ledger against a real Drizzle/PGlite
 * database (schema generated from the Drizzle definitions), so the unique
 * index and the ON CONFLICT ... WHERE re-claim run with Postgres semantics.
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

const {
  claimDelivery,
  completeDelivery,
  deliveryIdempotencyKey,
  failDelivery,
  isBlocked,
  pruneDeliveries,
  MAX_ATTEMPTS,
  STALE_CLAIM_MS,
} = await import("~/server/emailLedger");

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
const KEY = {
  tenantId: TENANT_ID,
  job: "digest",
  periodKey: "2026-W38",
  recipient: "admin@contoso.test",
} as const;

const rowFor = async (recipient: string = KEY.recipient) =>
  currentDb.query.emailDeliveries.findFirst({
    where: eq(schema.emailDeliveries.recipient, recipient),
  });

beforeEach(async () => {
  const client = new PGlite();
  for (const stmt of await schemaDdl()) await client.exec(stmt);
  currentDb = makeDb(client);
  await currentDb
    .insert(schema.tenants)
    .values({ id: TENANT_ID, name: "Acme" });
});

describe("claimDelivery", () => {
  it("lets the first claim win and the second lose", async () => {
    const first = await claimDelivery(KEY);
    expect(first.won).toBe(true);
    const second = await claimDelivery(KEY);
    expect(second).toEqual({ won: false, status: "claimed" });
    expect(await currentDb.query.emailDeliveries.findMany()).toHaveLength(1);
  });

  it("lets exactly one of two concurrent claims win", async () => {
    const results = await Promise.all([claimDelivery(KEY), claimDelivery(KEY)]);
    expect(results.filter((r) => r.won)).toHaveLength(1);
  });

  it("treats the recipient case-insensitively", async () => {
    await claimDelivery(KEY);
    const upper = await claimDelivery({
      ...KEY,
      recipient: " Admin@Contoso.TEST ",
    });
    expect(upper.won).toBe(false);
  });

  it("keeps periods, jobs and recipients independent", async () => {
    await claimDelivery(KEY);
    expect((await claimDelivery({ ...KEY, periodKey: "2026-W39" })).won).toBe(
      true,
    );
    expect(
      (await claimDelivery({ ...KEY, job: "report", periodKey: "2026-08" }))
        .won,
    ).toBe(true);
    expect(
      (await claimDelivery({ ...KEY, recipient: "other@contoso.test" })).won,
    ).toBe(true);
  });

  it("never re-claims a sent row", async () => {
    const claim = await claimDelivery(KEY);
    if (!claim.won) throw new Error("expected to win");
    await completeDelivery(claim.id);

    const later = new Date(Date.now() + 10 * STALE_CLAIM_MS);
    expect(await claimDelivery(KEY, later)).toEqual({
      won: false,
      status: "sent",
    });
    const row = await rowFor();
    expect(row?.status).toBe("sent");
    expect(row?.sentAt).toBeInstanceOf(Date);
  });

  it("re-claims a failed row until the attempts are used up", async () => {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const claim = await claimDelivery(KEY);
      if (!claim.won) throw new Error(`expected to win attempt ${attempt}`);
      await failDelivery(claim.id, new Error("Resend responded 500"));
      const row = await rowFor();
      expect(row?.status).toBe("failed");
      expect(row?.attempts).toBe(attempt);
      expect(row?.error).toBe("Resend responded 500");
    }
    expect(await claimDelivery(KEY)).toEqual({ won: false, status: "failed" });
    expect(await currentDb.query.emailDeliveries.findMany()).toHaveLength(1);
  });

  it("clears the error on a re-claim and keeps the same row", async () => {
    const first = await claimDelivery(KEY);
    if (!first.won) throw new Error("expected to win");
    await failDelivery(first.id, "boom");
    const second = await claimDelivery(KEY);
    expect(second).toEqual({ won: true, id: first.id });
    const row = await rowFor();
    expect(row?.status).toBe("claimed");
    expect(row?.error).toBeNull();
    expect(row?.attempts).toBe(1);
  });

  it("re-claims a stale claim but not a fresh one", async () => {
    const t0 = new Date("2026-09-14T06:00:00Z");
    const first = await claimDelivery(KEY, t0);
    expect(first.won).toBe(true);

    const fresh = new Date(t0.getTime() + STALE_CLAIM_MS - 1000);
    expect((await claimDelivery(KEY, fresh)).won).toBe(false);

    const stale = new Date(t0.getTime() + STALE_CLAIM_MS + 1000);
    expect((await claimDelivery(KEY, stale)).won).toBe(true);
    // The re-claim restarts the clock, so a third run right after loses.
    expect(
      (await claimDelivery(KEY, new Date(stale.getTime() + 1000))).won,
    ).toBe(false);
  });

  it("stores no address in the error text", async () => {
    const claim = await claimDelivery(KEY);
    if (!claim.won) throw new Error("expected to win");
    await failDelivery(
      claim.id,
      new Error(`rejected admin@contoso.test ${"x".repeat(500)}`),
    );
    const row = await rowFor();
    expect(row?.error).not.toContain("contoso");
    expect(row?.error?.length).toBeLessThanOrEqual(200);
  });
});

describe("completeDelivery", () => {
  it("stores the provider id, and keeps a stored one when none is given", async () => {
    const claim = await claimDelivery(KEY);
    if (!claim.won) throw new Error("expected the claim to win");
    await completeDelivery(claim.id, "re_123");
    expect(await rowFor()).toMatchObject({
      status: "sent",
      providerId: "re_123",
    });
    await completeDelivery(claim.id);
    expect((await rowFor())?.providerId).toBe("re_123");
  });

  it("claims and completes a leak alert under its own timestamp key", async () => {
    const first = {
      ...KEY,
      job: "leak",
      periodKey: "2026-09-14T03:00:00.000Z",
    } as const;
    const second = { ...first, periodKey: "2026-09-14T15:00:00.000Z" };
    expect((await claimDelivery(first)).won).toBe(true);
    // Same day, later alert: its own delivery.
    expect((await claimDelivery(second)).won).toBe(true);
    expect((await claimDelivery(first)).won).toBe(false);
  });
});

describe("isBlocked", () => {
  it("matches the address case-insensitively, per workspace", async () => {
    const OTHER = "22222222-2222-2222-2222-222222222222";
    await currentDb.insert(schema.tenants).values({ id: OTHER, name: "Beta" });
    await currentDb.insert(schema.emailBlocks).values({
      tenantId: TENANT_ID,
      email: "admin@contoso.test",
      reason: "bounced",
    });
    expect(await isBlocked(TENANT_ID, " Admin@Contoso.test")).toBe(true);
    expect(await isBlocked(TENANT_ID, "other@contoso.test")).toBe(false);
    expect(await isBlocked(OTHER, "admin@contoso.test")).toBe(false);
  });
});

describe("pruneDeliveries", () => {
  it("deletes only rows older than 400 days", async () => {
    const now = new Date("2026-09-01T07:00:00Z");
    const day = 24 * 60 * 60 * 1000;
    await currentDb.insert(schema.emailDeliveries).values([
      {
        ...KEY,
        periodKey: "2025-W20",
        status: "sent",
        createdAt: new Date(now.getTime() - 401 * day),
      },
      {
        ...KEY,
        periodKey: "2025-W40",
        status: "sent",
        createdAt: new Date(now.getTime() - 399 * day),
      },
    ]);
    expect(await pruneDeliveries(now)).toBe(1);
    const left = await currentDb.query.emailDeliveries.findMany();
    expect(left.map((r) => r.periodKey)).toEqual(["2025-W40"]);
  });
});

describe("deliveryIdempotencyKey", () => {
  it("is deterministic, case-insensitive and specific to the delivery", () => {
    const base = deliveryIdempotencyKey(KEY);
    expect(base).toBe(
      deliveryIdempotencyKey({ ...KEY, recipient: "ADMIN@contoso.test" }),
    );
    expect(base).not.toBe(
      deliveryIdempotencyKey({ ...KEY, periodKey: "2026-W39" }),
    );
    expect(base).not.toContain("contoso");
    expect(base.length).toBeLessThanOrEqual(256);
  });
});
