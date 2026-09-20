import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "~/server/db/schema";
import type * as EmailModule from "~/server/email";

/**
 * The immediate leak alert against a real Drizzle/PGlite database. Only the
 * Resend call (sendEmailWithReceipt) and ops notifications are stubbed;
 * recipients, the template, the ledger and the block list are the real thing.
 */

let currentDb: ReturnType<typeof makeDb>;

type SendArgs = {
  to: string[];
  subject: string;
  html: string;
  idempotencyKey?: string;
  tags?: { name: string; value: string }[];
};
let receipts = 0;
const receipt = () => Promise.resolve({ id: `re_${++receipts}` });
const sendEmailMock = vi.fn((_args: SendArgs) => receipt());
const notifyOpsMock = vi.fn((_text: string, _opts?: unknown) =>
  Promise.resolve(),
);

vi.mock("~/env", () => ({
  env: { NODE_ENV: "test", AUTH_SECRET: "test-secret-test-secret-test-secret" },
  byoConnectorEnabled: () => true,
  siteUrl: () => "https://licensemeter.test",
  appBaseUrl: () => "https://licensemeter.test",
}));

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

vi.mock("~/server/email", async (original) => ({
  ...(await original<typeof EmailModule>()),
  emailEnabled: () => true,
  sendEmailWithReceipt: (args: SendArgs) => sendEmailMock(args),
}));

vi.mock("~/server/ops", () => ({
  notifyOps: (text: string, opts?: unknown) => notifyOpsMock(text, opts),
}));

const { sendLeakAlert } = await import("~/server/sync/runSync");

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
const NOW = new Date("2026-09-14T03:00:00.000Z");
const LEAKS = [
  {
    id: "f1",
    rule: "disabled_account_with_license" as const,
    title: "Disabled account keeps a license",
    monthlyImpactCents: 2300,
  },
];

const SHARED = "it-licenses@contoso.test";

const seedAdmin = (email: string) =>
  currentDb.insert(schema.memberships).values({
    tenantId: TENANT_ID,
    email,
    oid: `oid-${email}`,
    role: "admin",
  });

const tenant = async () =>
  (await currentDb.query.tenants.findFirst({
    where: eq(schema.tenants.id, TENANT_ID),
  }))!;

const recipientsOf = (): string[] =>
  sendEmailMock.mock.calls.map(([args]) => args.to.join(",")).sort();

beforeEach(async () => {
  const client = new PGlite();
  for (const stmt of await schemaDdl()) await client.exec(stmt);
  currentDb = makeDb(client);
  sendEmailMock.mockReset();
  sendEmailMock.mockImplementation(receipt);
  notifyOpsMock.mockClear();
  await currentDb
    .insert(schema.tenants)
    .values({ id: TENANT_ID, name: "Acme" });
});

describe("sendLeakAlert", () => {
  it("sends one tracked message per owner or admin", async () => {
    await seedAdmin("anna@contoso.test");
    await seedAdmin("ben@contoso.test");

    await sendLeakAlert(await tenant(), LEAKS, NOW);

    expect(recipientsOf()).toEqual(["anna@contoso.test", "ben@contoso.test"]);
    const rows = await currentDb.query.emailDeliveries.findMany();
    expect(rows).toHaveLength(2);
    for (const [args] of sendEmailMock.mock.calls) {
      expect(args.to).toHaveLength(1);
      expect(args.subject).toContain("Acme");
      const row = rows.find((r) => r.recipient === args.to[0])!;
      expect(row).toMatchObject({
        job: "leak",
        periodKey: NOW.toISOString(),
        status: "sent",
      });
      expect(row.providerId).toMatch(/^re_\d+$/);
      expect(args.tags).toEqual([{ name: "lm_delivery", value: row.id }]);
      expect(args.idempotencyKey).toMatch(/^licensemeter-leak-[0-9a-f]{64}$/);
    }
    expect(notifyOpsMock).not.toHaveBeenCalled();
  });

  it("treats two alerts on the same day as two deliveries", async () => {
    await seedAdmin("anna@contoso.test");
    await sendLeakAlert(await tenant(), LEAKS, NOW);
    await sendLeakAlert(
      await tenant(),
      LEAKS,
      new Date("2026-09-14T15:00:00.000Z"),
    );
    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    expect(await currentDb.query.emailDeliveries.findMany()).toHaveLength(2);
  });

  it("keeps going when one recipient fails, and tells ops without throwing", async () => {
    await seedAdmin("anna@contoso.test");
    await seedAdmin("bad@contoso.test");
    await seedAdmin("carl@contoso.test");
    sendEmailMock.mockImplementation((args) =>
      args.to[0] === "bad@contoso.test"
        ? Promise.reject(new Error("Resend responded 422 for bad@contoso.test"))
        : receipt(),
    );

    await expect(
      sendLeakAlert(await tenant(), LEAKS, NOW),
    ).resolves.toBeUndefined();

    expect(sendEmailMock).toHaveBeenCalledTimes(3);
    const rows = await currentDb.query.emailDeliveries.findMany();
    expect(rows.map((r) => [r.recipient, r.status]).sort()).toEqual([
      ["anna@contoso.test", "sent"],
      ["bad@contoso.test", "failed"],
      ["carl@contoso.test", "sent"],
    ]);
    const bad = rows.find((r) => r.status === "failed")!;
    expect(bad.error).not.toContain("bad@contoso.test");
    expect(notifyOpsMock).toHaveBeenCalledTimes(1);
    expect(notifyOpsMock.mock.calls[0]?.[0]).toContain(
      "1 of 3 message(s) not sent",
    );
    expect(notifyOpsMock.mock.calls[0]?.[0]).not.toContain("@");
  });

  it("skips a blocked address and writes no ledger row for it", async () => {
    await seedAdmin("anna@contoso.test");
    await seedAdmin("bounced@contoso.test");
    await currentDb.insert(schema.emailBlocks).values({
      tenantId: TENANT_ID,
      email: "bounced@contoso.test",
      reason: "bounced",
    });

    await sendLeakAlert(await tenant(), LEAKS, NOW);

    expect(recipientsOf()).toEqual(["anna@contoso.test"]);
    expect(await currentDb.query.emailDeliveries.findMany()).toHaveLength(1);
    expect(notifyOpsMock).not.toHaveBeenCalled();
  });

  it("sends nothing when alerts are off, in the demo, or without leak findings", async () => {
    await seedAdmin("anna@contoso.test");
    const base = await tenant();
    await sendLeakAlert({ ...base, leakAlerts: false }, LEAKS, NOW);
    await sendLeakAlert({ ...base, isDemo: true }, LEAKS, NOW);
    await sendLeakAlert(
      base,
      [{ ...LEAKS[0]!, rule: "inactive_user" as never }],
      NOW,
    );
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(await currentDb.query.emailDeliveries.findMany()).toHaveLength(0);
  });

  it("includes the shared notification address while its switch is on", async () => {
    await seedAdmin("anna@contoso.test");
    await currentDb.insert(schema.notificationAddresses).values({
      tenantId: TENANT_ID,
      email: SHARED,
      verifiedAt: NOW,
    });

    await sendLeakAlert(await tenant(), LEAKS, NOW);

    expect(recipientsOf()).toEqual(["anna@contoso.test", SHARED]);
    expect(await currentDb.query.emailDeliveries.findMany()).toHaveLength(2);
  });

  it("leaves the shared address out when only its leak switch is off", async () => {
    await seedAdmin("anna@contoso.test");
    await currentDb.insert(schema.notificationAddresses).values({
      tenantId: TENANT_ID,
      email: SHARED,
      verifiedAt: NOW,
      leakAlerts: false,
    });

    await sendLeakAlert(await tenant(), LEAKS, NOW);

    expect(recipientsOf()).toEqual(["anna@contoso.test"]);
  });
});
