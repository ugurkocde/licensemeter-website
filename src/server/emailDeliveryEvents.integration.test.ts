import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "~/server/db/schema";

/**
 * Delivery webhooks applied to a real Drizzle/PGlite ledger, so the row lock,
 * the unique provider id and the block table's conflict handling run with
 * Postgres semantics.
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

const { applyDeliveryEvent } = await import("~/server/emailDeliveryEvents");
const { pruneDeliveries } = await import("~/server/emailLedger");

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

const TENANT_A = "11111111-1111-1111-1111-111111111111";
const TENANT_B = "22222222-2222-2222-2222-222222222222";
const ANNA = "anna@contoso.test";
const T1 = "2026-09-14T06:00:00.000Z";
const T2 = "2026-09-14T06:05:00.000Z";
const T3 = "2026-09-14T06:10:00.000Z";

const seedDelivery = async (
  overrides: Partial<typeof schema.emailDeliveries.$inferInsert> = {},
) => {
  const [row] = await currentDb
    .insert(schema.emailDeliveries)
    .values({
      tenantId: TENANT_A,
      job: "digest",
      periodKey: "2026-W38",
      recipient: ANNA,
      status: "sent",
      providerId: "re_anna",
      ...overrides,
    })
    .returning();
  return row!;
};

const event = (
  type: string,
  overrides: {
    at?: string;
    emailId?: string;
    to?: string[];
    tags?: Record<string, string>;
  } = {},
) => ({
  type,
  created_at: overrides.at ?? T1,
  data: {
    email_id: overrides.emailId ?? "re_anna",
    to: overrides.to ?? [ANNA],
    ...(overrides.tags ? { tags: overrides.tags } : {}),
  },
});

const rowById = async (id: string) =>
  (await currentDb.query.emailDeliveries.findFirst({
    where: eq(schema.emailDeliveries.id, id),
  }))!;

const blocks = () => currentDb.query.emailBlocks.findMany();

beforeEach(async () => {
  const client = new PGlite();
  for (const stmt of await schemaDdl()) await client.exec(stmt);
  currentDb = makeDb(client);
  await currentDb.insert(schema.tenants).values([
    { id: TENANT_A, name: "Acme" },
    { id: TENANT_B, name: "Beta" },
  ]);
});

describe("applyDeliveryEvent", () => {
  it("records what the provider reported", async () => {
    const row = await seedDelivery();
    await applyDeliveryEvent(event("email.sent", { at: T1 }));
    expect(await rowById(row.id)).toMatchObject({
      status: "sent",
      deliveryStatus: "accepted",
    });
    await applyDeliveryEvent(event("email.delivered", { at: T2 }));
    const after = await rowById(row.id);
    expect(after.deliveryStatus).toBe("delivered");
    expect(after.deliveryEventAt).toEqual(new Date(T2));
    // The provider's report never touches our own send status.
    expect(after.status).toBe("sent");
    expect(await blocks()).toHaveLength(0);
  });

  it("is idempotent for a duplicate event", async () => {
    const row = await seedDelivery();
    await applyDeliveryEvent(event("email.bounced", { at: T1 }));
    const once = await rowById(row.id);
    await applyDeliveryEvent(event("email.bounced", { at: T1 }));
    expect(await rowById(row.id)).toEqual(once);
    expect(await blocks()).toHaveLength(1);
  });

  it("keeps a bounce when delivered or sent arrives afterwards", async () => {
    const row = await seedDelivery();
    await applyDeliveryEvent(event("email.bounced", { at: T2 }));
    await applyDeliveryEvent(event("email.delivered", { at: T3 }));
    await applyDeliveryEvent(event("email.sent", { at: T1 }));
    const after = await rowById(row.id);
    expect(after.deliveryStatus).toBe("bounced");
    expect(after.deliveryEventAt).toEqual(new Date(T2));
    expect(await blocks()).toMatchObject([
      { tenantId: TENANT_A, email: ANNA, reason: "bounced" },
    ]);
  });

  it("blocks the address even when the failure arrives late", async () => {
    const row = await seedDelivery();
    await applyDeliveryEvent(event("email.complained", { at: T3 }));
    // Older than the stored complaint, so the row keeps it; the block of a
    // permanent failure is written all the same, exactly once per address.
    await applyDeliveryEvent(event("email.bounced", { at: T1 }));
    expect((await rowById(row.id)).deliveryStatus).toBe("complained");
    expect(await blocks()).toMatchObject([
      { email: ANNA, reason: "complained" },
    ]);
  });

  it("creates exactly one block for several failures of one address", async () => {
    await seedDelivery();
    await seedDelivery({ periodKey: "2026-W39", providerId: "re_anna_2" });
    await applyDeliveryEvent(event("email.bounced"));
    await applyDeliveryEvent(
      event("email.suppressed", { emailId: "re_anna_2" }),
    );
    expect(await blocks()).toMatchObject([{ email: ANNA, reason: "bounced" }]);
  });

  it("finds the row by tag when the provider id is not stored yet", async () => {
    const row = await seedDelivery({ status: "claimed", providerId: null });
    await applyDeliveryEvent(
      event("email.delivered", {
        emailId: "re_early",
        tags: { lm_delivery: row.id },
      }),
    );
    expect(await rowById(row.id)).toMatchObject({
      deliveryStatus: "delivered",
      providerId: "re_early",
      // Still ours to complete: the webhook only got here first.
      status: "claimed",
    });
  });

  it("ignores an event for a different recipient", async () => {
    const row = await seedDelivery();
    await applyDeliveryEvent(
      event("email.bounced", { to: ["someone-else@contoso.test"] }),
    );
    expect((await rowById(row.id)).deliveryStatus).toBeNull();
    expect(await blocks()).toHaveLength(0);
  });

  it("matches the recipient case-insensitively", async () => {
    const row = await seedDelivery();
    await applyDeliveryEvent(
      event("email.delivered", { to: [" Anna@Contoso.test "] }),
    );
    expect((await rowById(row.id)).deliveryStatus).toBe("delivered");
  });

  it("ignores an event whose email id contradicts the stored provider id", async () => {
    const row = await seedDelivery();
    await applyDeliveryEvent(
      event("email.bounced", {
        emailId: "re_other",
        tags: { lm_delivery: row.id },
      }),
    );
    expect(await rowById(row.id)).toMatchObject({
      providerId: "re_anna",
      deliveryStatus: null,
    });
    expect(await blocks()).toHaveLength(0);
  });

  it("prefers the provider id when the tag names another row", async () => {
    const mine = await seedDelivery();
    const other = await seedDelivery({
      periodKey: "2026-W39",
      providerId: null,
    });
    await applyDeliveryEvent(
      event("email.delivered", { tags: { lm_delivery: other.id } }),
    );
    expect((await rowById(mine.id)).deliveryStatus).toBe("delivered");
    expect(await rowById(other.id)).toMatchObject({
      providerId: null,
      deliveryStatus: null,
    });
  });

  it("silently ignores unknown event types and malformed payloads", async () => {
    const row = await seedDelivery();
    for (const input of [
      event("email.opened"),
      event("email.clicked"),
      { type: "email.bounced" },
      { ...event("email.bounced"), created_at: "not a date" },
      event("email.bounced", {
        tags: { lm_delivery: "not-a-uuid" },
        emailId: "re_unknown",
      }),
      null,
      "garbage",
      42,
    ]) {
      await expect(applyDeliveryEvent(input)).resolves.toBeUndefined();
    }
    expect((await rowById(row.id)).deliveryStatus).toBeNull();
    expect(await blocks()).toHaveLength(0);
  });

  it("lets a database error surface", async () => {
    await seedDelivery();
    const original = currentDb;
    currentDb = {
      transaction: () => Promise.reject(new Error("connection lost")),
    } as unknown as typeof currentDb;
    await expect(applyDeliveryEvent(event("email.bounced"))).rejects.toThrow(
      "connection lost",
    );
    currentDb = original;
  });
});

describe("workspace isolation", () => {
  it("never touches another workspace's row or blocks", async () => {
    const a = await seedDelivery();
    const b = await seedDelivery({ tenantId: TENANT_B, providerId: "re_b" });
    await applyDeliveryEvent(event("email.bounced"));
    expect((await rowById(a.id)).deliveryStatus).toBe("bounced");
    expect((await rowById(b.id)).deliveryStatus).toBeNull();
    expect(await blocks()).toMatchObject([{ tenantId: TENANT_A, email: ANNA }]);
  });

  it("keeps a block per workspace", async () => {
    await seedDelivery();
    await seedDelivery({ tenantId: TENANT_B, providerId: "re_b" });
    await applyDeliveryEvent(event("email.bounced"));
    await applyDeliveryEvent(event("email.complained", { emailId: "re_b" }));
    expect((await blocks()).map((b) => [b.tenantId, b.reason]).sort()).toEqual([
      [TENANT_A, "bounced"],
      [TENANT_B, "complained"],
    ]);
  });
});

describe("housekeeping", () => {
  it("removes a workspace's deliveries and blocks with the workspace", async () => {
    await seedDelivery();
    await seedDelivery({ tenantId: TENANT_B, providerId: "re_b" });
    await applyDeliveryEvent(event("email.bounced"));
    await applyDeliveryEvent(event("email.bounced", { emailId: "re_b" }));

    await currentDb
      .delete(schema.tenants)
      .where(eq(schema.tenants.id, TENANT_A));
    expect(await blocks()).toMatchObject([{ tenantId: TENANT_B }]);
    expect(
      (await currentDb.query.emailDeliveries.findMany()).map((r) => r.tenantId),
    ).toEqual([TENANT_B]);
  });

  it("still prunes tracked rows past the retention window and keeps blocks", async () => {
    await seedDelivery({
      deliveryStatus: "bounced",
      deliveryEventAt: new Date(T1),
      createdAt: new Date("2025-01-01T00:00:00Z"),
    });
    await currentDb
      .insert(schema.emailBlocks)
      .values({ tenantId: TENANT_A, email: ANNA, reason: "bounced" });
    expect(await pruneDeliveries(new Date(T1))).toBe(1);
    expect(await blocks()).toHaveLength(1);
  });
});

describe("schema guards", () => {
  it("rejects an unknown delivery status and an unknown block reason", async () => {
    await expect(
      seedDelivery({ deliveryStatus: "opened" as never }),
    ).rejects.toThrow();
    await expect(
      currentDb
        .insert(schema.emailBlocks)
        .values({ tenantId: TENANT_A, email: ANNA, reason: "manual" as never }),
    ).rejects.toThrow();
  });

  it("allows many rows without a provider id but no duplicate id", async () => {
    await seedDelivery({ providerId: null });
    await seedDelivery({ providerId: null, periodKey: "2026-W39" });
    await seedDelivery({ providerId: "re_x", periodKey: "2026-W40" });
    await expect(
      seedDelivery({ providerId: "re_x", periodKey: "2026-W41" }),
    ).rejects.toThrow();
  });
});
