import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "~/server/db/schema";
import type * as EmailModule from "~/server/email";
import { freshDb, seedProPlan, type TestDb } from "~/server/mcp/testHarness";

/**
 * The renewal reminder job against a real Drizzle/PGlite database: the plan
 * loader, the recipient rules, the delivery ledger, the plan gate and the
 * unsubscribe route. Only the Resend call and ops notifications are stubbed.
 */

let currentDb: TestDb;

type SendArgs = {
  to: string[];
  subject: string;
  html: string;
  headers?: Record<string, string>;
  attachments?: { filename: string; content: string }[];
  idempotencyKey?: string;
};
let receipts = 0;
const sendEmailMock = vi.fn((_args: SendArgs) =>
  Promise.resolve({ id: `re_${++receipts}` }),
);
const notifyOpsMock = vi.fn((_text: string, _opts?: unknown) =>
  Promise.resolve(),
);

vi.mock("server-only", () => ({}));
vi.mock("~/env", () => ({
  env: { NODE_ENV: "test", AUTH_SECRET: "test-secret-test-secret-test-secret" },
  siteUrl: () => "https://licensemeter.test",
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
vi.mock("~/server/email", async (original) => ({
  ...(await original<typeof EmailModule>()),
  emailEnabled: () => true,
  sendEmailWithReceipt: (args: SendArgs) => sendEmailMock(args),
}));
vi.mock("~/server/ops", () => ({
  notifyOps: (text: string, opts?: unknown) => notifyOpsMock(text, opts),
}));

const { runRenewalAlertJob } = await import("./alerts");
const { POST: unsubscribe } = await import("~/app/api/unsubscribe/route");

const TENANT_ID = "11111111-1111-1111-1111-000000000001";
const E3 = "05e9a617-0261-4cee-bb44-138d3ef5d965";
const VISIO = "c5928f49-12ba-48f7-ada3-0d743a3601d5";
const NOW = new Date("2027-01-10T06:00:00Z");
const DAY = 86_400_000;
const at = (days: number) => new Date(NOW.getTime() + days * DAY);
const SHARED = "it-licenses@contoso.test";

const seedMember = async (
  email: string,
  overrides: Partial<typeof schema.memberships.$inferInsert> = {},
) => {
  const [row] = await currentDb
    .insert(schema.memberships)
    .values({
      tenantId: TENANT_ID,
      email,
      oid: `oid-${email}`,
      role: "admin",
      ...overrides,
    })
    .returning();
  return row!;
};

const seedSku = (
  skuId: string,
  days: number,
  overrides: Partial<typeof schema.tenantSkus.$inferInsert> = {},
) =>
  currentDb.insert(schema.tenantSkus).values({
    tenantId: TENANT_ID,
    skuId,
    skuPartNumber: skuId === E3 ? "SPE_E3" : "VISIOCLIENT",
    displayName: skuId === E3 ? "Microsoft 365 E3" : "Visio Plan 2",
    prepaidEnabled: 100,
    consumedUnits: 90,
    nextLifecycleAt: at(days),
    ...overrides,
  });

const sentTo = () =>
  sendEmailMock.mock.calls.map(([args]) => args.to.join(",")).sort();

beforeEach(async () => {
  currentDb = await freshDb();
  sendEmailMock.mockReset();
  sendEmailMock.mockImplementation(() =>
    Promise.resolve({ id: `re_${++receipts}` }),
  );
  notifyOpsMock.mockClear();
  await currentDb
    .insert(schema.tenants)
    .values({ id: TENANT_ID, name: "Acme", currency: "USD" });
  await seedProPlan(currentDb, TENANT_ID);
  await currentDb
    .insert(schema.priceBook)
    .values({ tenantId: TENANT_ID, skuId: E3, monthlyPriceCents: 3_360 });
});

describe("runRenewalAlertJob", () => {
  it("emails each owner/admin once per renewal and threshold", async () => {
    await seedMember("anna@contoso.test", { role: "owner" });
    await seedMember("ben@contoso.test");
    await seedMember("viewer@contoso.test", { role: "viewer" });
    await seedMember("pending@contoso.test", { oid: null });
    await seedSku(E3, 60);

    const first = await runRenewalAlertJob({ now: NOW });
    expect(first).toEqual({
      tenants: 1,
      sent: 2,
      skippedAlreadySent: 0,
      skippedOptedOut: 0,
      skippedBlocked: 0,
      failed: 0,
      unprocessedTenants: 0,
      skippedExhausted: 0,
    });
    expect(sentTo()).toEqual(["anna@contoso.test", "ben@contoso.test"]);

    // Same day again, and the next day inside the same band: nothing new.
    expect(await runRenewalAlertJob({ now: NOW })).toMatchObject({
      sent: 0,
      skippedAlreadySent: 2,
    });
    expect(await runRenewalAlertJob({ now: at(1) })).toMatchObject({
      sent: 0,
      skippedAlreadySent: 2,
    });
    expect(sendEmailMock).toHaveBeenCalledTimes(2);

    const [args] = sendEmailMock.mock.calls[0]!;
    expect(args.subject).toBe(
      "Microsoft renewal in 60 days: Microsoft 365 E3, save $2,016/yr",
    );
    expect(args.attachments?.[0]?.filename).toBe("microsoft-365-e3.ics");
    expect(
      Buffer.from(args.attachments![0]!.content, "base64").toString("utf8"),
    ).toContain("SUMMARY:Microsoft renewal: Microsoft 365 E3");
    expect(args.headers?.["List-Unsubscribe-Post"]).toBe(
      "List-Unsubscribe=One-Click",
    );
    const unsub = new URL(args.headers!["List-Unsubscribe"]!.slice(1, -1));
    expect(unsub.searchParams.get("j")).toBe("renewal");

    const rows = await currentDb.query.emailDeliveries.findMany();
    expect(rows.map((r) => [r.job, r.periodKey, r.status])).toEqual([
      ["renewal", `sku-${E3}:${at(60).toISOString().slice(0, 10)}:60`, "sent"],
      ["renewal", `sku-${E3}:${at(60).toISOString().slice(0, 10)}:60`, "sent"],
    ]);
  });

  it("sends the 90, 60 and 30 day reminders as the renewal comes closer", async () => {
    await seedMember("anna@contoso.test");
    await seedSku(E3, 95);
    // The edges of every band; the full day-by-day sweep is a unit test.
    for (const day of [0, 4, 5, 6, 34, 35, 36, 64, 65, 66, 95]) {
      await runRenewalAlertJob({ now: at(day) });
    }
    expect(
      sendEmailMock.mock.calls.map(([args]) => args.subject.split(":")[0]),
    ).toEqual([
      "Microsoft renewal in 90 days",
      "Microsoft renewal in 60 days",
      "Microsoft renewal in 30 days",
    ]);
  });

  it("catches up on a missed day with the reminder of that band", async () => {
    await seedMember("anna@contoso.test");
    await seedSku(E3, 45);
    await runRenewalAlertJob({ now: NOW });
    expect(sendEmailMock.mock.calls[0]![0].subject).toMatch(
      /^Microsoft renewal in 45 days/,
    );
    const [row] = await currentDb.query.emailDeliveries.findMany();
    expect(row!.periodKey.endsWith(":60")).toBe(true);
  });

  it("honours the membership opt-out and the shared address switch", async () => {
    await seedMember("anna@contoso.test");
    await seedMember("carl@contoso.test", { renewalOptOut: true });
    // Other opt-outs do not touch renewal reminders.
    await seedMember("dora@contoso.test", {
      digestOptOut: true,
      reportOptOut: true,
    });
    await currentDb.insert(schema.notificationAddresses).values({
      tenantId: TENANT_ID,
      email: SHARED,
      verifiedAt: NOW,
    });
    await seedSku(E3, 30);

    const totals = await runRenewalAlertJob({ now: NOW });
    expect(totals).toMatchObject({ sent: 3, skippedOptedOut: 1 });
    expect(sentTo()).toEqual([
      "anna@contoso.test",
      "dora@contoso.test",
      SHARED,
    ]);
    const shared = sendEmailMock.mock.calls.find(
      ([args]) => args.to[0] === SHARED,
    )![0];
    expect(shared.headers!["List-Unsubscribe"]).toContain("w=");
    expect(shared.html).toContain("shared notification address");

    // Switch the shared address off; a new renewal reaches the members only.
    sendEmailMock.mockClear();
    await currentDb
      .update(schema.notificationAddresses)
      .set({ renewalAlerts: false });
    await seedSku(VISIO, 30, { prepaidEnabled: 10, consumedUnits: 10 });
    await runRenewalAlertJob({ now: NOW });
    expect(sentTo()).toEqual(["anna@contoso.test", "dora@contoso.test"]);
  });

  it("sends nothing when the workspace switch is off", async () => {
    await seedMember("anna@contoso.test");
    await seedSku(E3, 30);
    await currentDb
      .update(schema.tenants)
      .set({ renewalAlerts: false })
      .where(eq(schema.tenants.id, TENANT_ID));
    expect(await runRenewalAlertJob({ now: NOW })).toMatchObject({
      tenants: 0,
      sent: 0,
    });
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("sends nothing on Free or for the demo workspace", async () => {
    await seedMember("anna@contoso.test");
    await seedSku(E3, 30);
    await currentDb
      .delete(schema.entitlements)
      .where(eq(schema.entitlements.tenantId, TENANT_ID));
    expect(await runRenewalAlertJob({ now: NOW })).toMatchObject({
      tenants: 1,
      sent: 0,
    });
    await currentDb
      .update(schema.tenants)
      .set({ isDemo: true })
      .where(eq(schema.tenants.id, TENANT_ID));
    await seedProPlan(currentDb, TENANT_ID);
    expect(await runRenewalAlertJob({ now: NOW })).toMatchObject({
      tenants: 0,
    });
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("follows the SKU billing term: monthly only with the opt-in", async () => {
    await seedMember("anna@contoso.test");
    await seedSku(E3, 20);
    await currentDb.insert(schema.renewalSkuTerms).values({
      tenantId: TENANT_ID,
      skuId: E3,
      term: "monthly",
      monthlyAlerts: false,
    });
    await runRenewalAlertJob({ now: NOW });
    expect(sendEmailMock).not.toHaveBeenCalled();
    await currentDb.update(schema.renewalSkuTerms).set({ monthlyAlerts: true });
    await runRenewalAlertJob({ now: NOW });
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it("sends nothing once the paid plan has lapsed", async () => {
    await seedMember("anna@contoso.test");
    await seedSku(E3, 30);
    await currentDb
      .update(schema.entitlements)
      .set({
        status: "canceled",
        currentPeriodEnd: new Date(NOW.getTime() - DAY),
      })
      .where(eq(schema.entitlements.tenantId, TENANT_ID));
    expect(await runRenewalAlertJob({ now: NOW })).toMatchObject({
      tenants: 1,
      sent: 0,
    });
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("skips an address the mail provider blocked", async () => {
    await seedMember("anna@contoso.test");
    await seedMember("ben@contoso.test");
    await seedSku(E3, 30);
    await currentDb.insert(schema.emailBlocks).values({
      tenantId: TENANT_ID,
      email: "ben@contoso.test",
      reason: "bounced",
    });
    expect(await runRenewalAlertJob({ now: NOW })).toMatchObject({
      sent: 1,
      skippedBlocked: 1,
    });
    expect(sentTo()).toEqual(["anna@contoso.test"]);
  });

  it("reminds about a tracked contract once, not again for its linked SKU", async () => {
    await seedMember("anna@contoso.test");
    await seedSku(E3, 200);
    await currentDb.insert(schema.vendorRenewals).values({
      tenantId: TENANT_ID,
      vendor: "Microsoft",
      contractName: "Enterprise Agreement",
      renewalDate: at(30).toISOString().slice(0, 10),
      noticeDays: 60,
      skuIds: [E3],
    });
    await runRenewalAlertJob({ now: NOW });
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const [args] = sendEmailMock.mock.calls[0]!;
    expect(args.subject).toMatch(
      /^Microsoft renewal in 30 days: Enterprise Agreement/,
    );
    expect(args.html).toContain("The notice deadline");
    const [row] = await currentDb.query.emailDeliveries.findMany();
    expect(row!.periodKey).toMatch(/^contract-[0-9a-f-]{36}:/);
  });

  it("does not report a run as incomplete for retries used up on earlier days", async () => {
    await seedMember("anna@contoso.test");
    await seedSku(E3, 30);
    sendEmailMock.mockImplementation(() =>
      Promise.reject(new Error("Resend responded 500")),
    );
    for (let i = 0; i < 3; i++) {
      expect(await runRenewalAlertJob({ now: at(i) })).toMatchObject({
        failed: 1,
      });
    }
    notifyOpsMock.mockClear();
    expect(await runRenewalAlertJob({ now: at(3) })).toMatchObject({
      failed: 0,
      skippedExhausted: 1,
    });
    expect(notifyOpsMock).not.toHaveBeenCalled();
    expect(sendEmailMock).toHaveBeenCalledTimes(3);
    sendEmailMock.mockImplementation(() =>
      Promise.resolve({ id: `re_${++receipts}` }),
    );
  });

  it("leaves trial-only subscriptions out", async () => {
    await seedMember("anna@contoso.test");
    await seedSku(E3, 30, { prepaidEnabled: 25, trialUnits: 25 });
    await runRenewalAlertJob({ now: NOW });
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("retries a failed send on the next run, without duplicating the others", async () => {
    await seedMember("anna@contoso.test");
    await seedMember("ben@contoso.test");
    await seedSku(E3, 30);
    sendEmailMock.mockImplementationOnce(() =>
      Promise.reject(new Error("Resend responded 500")),
    );
    const first = await runRenewalAlertJob({ now: NOW });
    expect(first).toMatchObject({ sent: 1, failed: 1 });
    expect(notifyOpsMock).toHaveBeenCalled();
    const second = await runRenewalAlertJob({ now: NOW });
    expect(second).toMatchObject({ sent: 1, skippedAlreadySent: 1 });
    expect(sendEmailMock).toHaveBeenCalledTimes(3);
  });

  it("stops at the time budget and finishes the rest on the next run", async () => {
    await seedMember("anna@contoso.test");
    await seedSku(E3, 30);
    let tick = 0;
    const partial = await runRenewalAlertJob({
      now: NOW,
      budgetMs: 0,
      clock: () => tick++ * 10,
    });
    expect(partial).toMatchObject({ unprocessedTenants: 1, sent: 0 });
    expect(await runRenewalAlertJob({ now: NOW })).toMatchObject({ sent: 1 });
  });

  it("one-click unsubscribe sets the personal renewal opt-out only", async () => {
    const anna = await seedMember("anna@contoso.test");
    await seedSku(E3, 30);
    await runRenewalAlertJob({ now: NOW });
    const header =
      sendEmailMock.mock.calls[0]![0].headers!["List-Unsubscribe"]!;
    const res = await unsubscribe(new NextRequest(header.slice(1, -1)));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("renewal reminder");
    const row = await currentDb.query.memberships.findFirst({
      where: eq(schema.memberships.id, anna.id),
    });
    expect(row).toMatchObject({
      renewalOptOut: true,
      digestOptOut: false,
      reportOptOut: false,
    });

    // A forged job in the link is refused by the signature.
    const forged = new URL(header.slice(1, -1));
    forged.searchParams.set("j", "digest");
    await unsubscribe(new NextRequest(forged));
    expect(
      (
        await currentDb.query.memberships.findFirst({
          where: eq(schema.memberships.id, anna.id),
        })
      )?.digestOptOut,
    ).toBe(false);
  });

  it("shared address unsubscribe turns off its renewal switch only", async () => {
    await currentDb.insert(schema.notificationAddresses).values({
      tenantId: TENANT_ID,
      email: SHARED,
      verifiedAt: NOW,
    });
    await seedSku(E3, 30);
    await runRenewalAlertJob({ now: NOW });
    const header =
      sendEmailMock.mock.calls[0]![0].headers!["List-Unsubscribe"]!;
    await unsubscribe(new NextRequest(header.slice(1, -1)));
    const row = await currentDb.query.notificationAddresses.findFirst();
    expect(row).toMatchObject({
      renewalAlerts: false,
      digest: true,
      report: true,
      leakAlerts: true,
    });
  });
});
