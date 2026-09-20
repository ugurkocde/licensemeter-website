import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "~/server/db/schema";
import type * as EmailModule from "~/server/email";
import { freshDb, seedTenant, type TestDb } from "~/server/mcp/testHarness";

/**
 * The requested send of the current findings against a real Drizzle/PGlite
 * database. Only the Resend call is stubbed; the finding query, the recipient
 * rules, the templates and the delivery ledger are the real thing.
 */

let currentDb: TestDb;
let tenant: schema.TenantRow;

type SendArgs = {
  to: string[];
  subject: string;
  html: string;
  idempotencyKey?: string;
};
let receipts = 0;
const receipt = () => Promise.resolve({ id: `re_${++receipts}` });
const sendEmailMock = vi.fn((_args: SendArgs) => receipt());

vi.mock("~/env", () => ({
  env: { NODE_ENV: "test", AUTH_SECRET: "test-secret-test-secret-test-secret" },
  siteUrl: () => "https://licensemeter.test",
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

const { currentFindingsRecipients, sendCurrentFindings } =
  await import("~/server/currentFindings");

const NOW = new Date("2026-09-20T09:00:00Z");
const SHARED = "it-licenses@contoso.test";

const seedMember = (
  email: string,
  overrides: Partial<typeof schema.memberships.$inferInsert> = {},
) =>
  currentDb.insert(schema.memberships).values({
    tenantId: tenant.id,
    email,
    oid: `oid-${email}`,
    role: "admin",
    ...overrides,
  });

const seedFinding = (
  title: string,
  overrides: Partial<typeof schema.findings.$inferInsert> = {},
) =>
  currentDb.insert(schema.findings).values({
    tenantId: tenant.id,
    dedupeKey: `${title}|${tenant.id}`,
    rule: "disabled_account_with_license",
    title,
    monthlyImpactCents: 2300,
    ...overrides,
  });

/** A confirmed shared notification address with its leak switch turned off. */
const seedSharedAddress = (
  overrides: Partial<typeof schema.notificationAddresses.$inferInsert> = {},
) =>
  currentDb.insert(schema.notificationAddresses).values({
    tenantId: tenant.id,
    email: SHARED,
    verifiedAt: NOW,
    ...overrides,
  });

const recipientsOf = (): string[] =>
  sendEmailMock.mock.calls.map(([args]) => args.to.join(",")).sort();

beforeEach(async () => {
  currentDb = await freshDb();
  tenant = await seedTenant(currentDb, 1, { name: "Acme" });
  sendEmailMock.mockReset();
  sendEmailMock.mockImplementation(receipt);
});

describe("sendCurrentFindings", () => {
  it("says so and sends nothing when no leak is open", async () => {
    await seedMember("anna@contoso.test", { role: "owner" });
    await seedFinding("Resolved leak", { status: "resolved" });
    await seedFinding("Unused seat", { rule: "inactive_90d" });

    expect(await sendCurrentFindings(tenant, NOW)).toMatchObject({
      reason: "no-findings",
      findings: 0,
      sent: 0,
    });
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(await currentDb.query.emailDeliveries.findMany()).toHaveLength(0);
  });

  it("covers the unresolved leaks only, not other rules", async () => {
    await seedMember("anna@contoso.test", { role: "owner" });
    await seedFinding("Disabled account keeps a license");
    await seedFinding("Orphaned SaaS seat", {
      rule: "saas_orphaned",
      status: "acknowledged",
      monthlyImpactCents: 1700,
    });
    await seedFinding("Resolved leak", { status: "resolved" });
    await seedFinding("Unused seat", { rule: "inactive_90d" });

    const result = await sendCurrentFindings(tenant, NOW);
    expect(result).toMatchObject({ findings: 2, sent: 1, failed: 0 });

    const [args] = sendEmailMock.mock.calls[0]!;
    expect(args.html).toContain("Disabled account keeps a license");
    expect(args.html).toContain("Orphaned SaaS seat");
    expect(args.html).not.toContain("Resolved leak");
    expect(args.html).not.toContain("Unused seat");
    expect(args.subject).toContain("2 potential license leaks open in Acme");
  });

  it("never claims that a sync just ran", async () => {
    await seedMember("anna@contoso.test", { role: "owner" });
    await seedFinding("Disabled account keeps a license");

    await sendCurrentFindings(tenant, NOW);

    const [args] = sendEmailMock.mock.calls[0]!;
    expect(args.html).toContain("You asked for this summary of 1 open finding");
    expect(args.html).not.toContain("The latest sync detected");
    expect(args.html).toContain("No email setting was changed.");
  });

  it("sends one message per recipient and skips a blocked address", async () => {
    await seedMember("anna@contoso.test", { role: "owner" });
    await seedMember("ben@contoso.test");
    await seedMember("blocked@contoso.test");
    await seedMember("viewer@contoso.test", { role: "viewer" });
    await seedMember("pending@contoso.test", { oid: null });
    await currentDb.insert(schema.emailBlocks).values({
      tenantId: tenant.id,
      email: "blocked@contoso.test",
      reason: "bounced",
    });
    await seedFinding("Disabled account keeps a license");

    expect(await sendCurrentFindings(tenant, NOW)).toMatchObject({
      recipients: 3,
      sent: 2,
      skippedBlocked: 1,
      failed: 0,
    });
    expect(recipientsOf()).toEqual(["anna@contoso.test", "ben@contoso.test"]);
    const rows = await currentDb.query.emailDeliveries.findMany();
    expect(rows.map((r) => r.recipient).sort()).toEqual([
      "anna@contoso.test",
      "ben@contoso.test",
    ]);
  });

  it("ignores both leak switches, because this send was asked for", async () => {
    await currentDb
      .update(schema.tenants)
      .set({ leakAlerts: false })
      .where(eq(schema.tenants.id, tenant.id));
    await seedMember("anna@contoso.test", { role: "owner" });
    await seedSharedAddress({ leakAlerts: false });
    await seedFinding("Disabled account keeps a license");

    expect(await currentFindingsRecipients(tenant.id)).toEqual([
      "anna@contoso.test",
      SHARED,
    ]);
    expect(
      await sendCurrentFindings({ ...tenant, leakAlerts: false }, NOW),
    ).toMatchObject({ sent: 2 });
    expect(recipientsOf()).toEqual(["anna@contoso.test", SHARED].sort());
    // The switches stay where the workspace left them.
    expect((await currentDb.query.tenants.findFirst())?.leakAlerts).toBe(false);
    expect(
      (await currentDb.query.notificationAddresses.findFirst())?.leakAlerts,
    ).toBe(false);
  });

  it("leaves out a shared address nobody confirmed", async () => {
    await seedMember("anna@contoso.test", { role: "owner" });
    await seedSharedAddress({
      email: null,
      verifiedAt: null,
      pendingEmail: SHARED,
    });
    await seedFinding("Disabled account keeps a license");

    expect(await currentFindingsRecipients(tenant.id)).toEqual([
      "anna@contoso.test",
    ]);
  });

  it("goes out twice in a row and never collides with a sync alert", async () => {
    await seedMember("anna@contoso.test", { role: "owner" });
    await seedFinding("Disabled account keeps a license");
    // The alert an earlier sync already delivered for this exact moment.
    await currentDb.insert(schema.emailDeliveries).values({
      tenantId: tenant.id,
      job: "leak",
      periodKey: NOW.toISOString(),
      recipient: "anna@contoso.test",
      status: "sent",
      sentAt: NOW,
    });

    expect(await sendCurrentFindings(tenant, NOW)).toMatchObject({ sent: 1 });
    expect(await sendCurrentFindings(tenant, NOW)).toMatchObject({ sent: 1 });

    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    const keys = (await currentDb.query.emailDeliveries.findMany()).map(
      (r) => r.periodKey,
    );
    expect(new Set(keys).size).toBe(3);
    expect(keys.filter((k) => k.startsWith("requested-"))).toHaveLength(2);
  });

  it("sends nothing for a demo workspace", async () => {
    await seedMember("anna@contoso.test", { role: "owner" });
    await seedFinding("Disabled account keeps a license");

    expect(
      await sendCurrentFindings({ ...tenant, isDemo: true }, NOW),
    ).toMatchObject({ reason: "email-off", sent: 0 });
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("reports that there is nobody to send to", async () => {
    await seedFinding("Disabled account keeps a license");

    expect(await sendCurrentFindings(tenant, NOW)).toMatchObject({
      reason: "no-recipients",
      findings: 1,
      sent: 0,
    });
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});
