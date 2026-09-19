import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "~/server/db/schema";
import type * as EmailModule from "~/server/email";

/**
 * Digest and report orchestration against a real Drizzle/PGlite database.
 * Only what leaves the process is stubbed: the Resend call (sendEmail), ops
 * notifications and the PDF renderer. Templates, recipient rules, the ledger
 * and the unsubscribe tokens are the real thing.
 */

let currentDb: ReturnType<typeof makeDb>;

type SendArgs = {
  to: string[];
  subject: string;
  html: string;
  headers?: Record<string, string>;
  attachments?: { filename: string; content: string }[];
  idempotencyKey?: string;
};
const sendEmailMock = vi.fn((_args: SendArgs) => Promise.resolve(true));
const notifyOpsMock = vi.fn((_text: string, _opts?: unknown) =>
  Promise.resolve(),
);
const renderPdfMock = vi.fn((_tenantId: string) =>
  Promise.resolve({
    filename: "report.pdf",
    buffer: Buffer.from("pdf"),
    monthlySpendCents: 100_000,
    monthlyWasteCents: 25_000,
    openFindings: 1,
  }),
);

vi.mock("~/env", () => ({
  env: { NODE_ENV: "test", AUTH_SECRET: "test-secret-test-secret-test-secret" },
  siteUrl: () => "https://licensemeter.test",
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
  sendEmail: (args: SendArgs) => sendEmailMock(args),
}));

vi.mock("~/server/ops", () => ({
  notifyOps: (text: string, opts?: unknown) => notifyOpsMock(text, opts),
}));

vi.mock("~/server/report/renderReport", () => ({
  renderWasteReportPdf: (tenantId: string) => renderPdfMock(tenantId),
}));

const { runDigestJob, runReportJob } = await import("~/server/scheduledEmails");
const { verifyMembershipUnsubToken } = await import("~/server/unsubToken");

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
const NOW = new Date("2026-09-14T06:00:00Z");

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

const seedFinding = async (tenantId = TENANT_ID) =>
  currentDb.insert(schema.findings).values({
    tenantId,
    dedupeKey: `inactive_user|u1|sku-e3|${tenantId}`,
    rule: "disabled_account_with_license",
    title: "Disabled account keeps a license",
    monthlyImpactCents: 2300,
    firstSeenAt: new Date(NOW.getTime() - 24 * 60 * 60 * 1000),
  });

const recipientsOf = (): string[] =>
  sendEmailMock.mock.calls.map(([args]) => args.to.join(",")).sort();

beforeEach(async () => {
  const client = new PGlite();
  for (const stmt of await schemaDdl()) await client.exec(stmt);
  currentDb = makeDb(client);
  sendEmailMock.mockReset();
  sendEmailMock.mockImplementation(() => Promise.resolve(true));
  notifyOpsMock.mockClear();
  renderPdfMock.mockClear();
  await currentDb
    .insert(schema.tenants)
    .values({ id: TENANT_ID, name: "Acme", monthlyReport: true });
});

describe("runDigestJob", () => {
  it("sends one message per admin, once, and respects the opt-out", async () => {
    const anna = await seedMember("anna@contoso.test", { role: "owner" });
    await seedMember("ben@contoso.test");
    await seedMember("carl@contoso.test", { digestOptOut: true });
    await seedMember("viewer@contoso.test", { role: "viewer" });
    await seedMember("pending@contoso.test", { oid: null });
    await seedFinding();

    const first = await runDigestJob({ now: NOW });
    expect(first).toEqual({
      tenants: 1,
      sent: 2,
      skippedAlreadySent: 0,
      skippedOptedOut: 1,
      failed: 0,
      unprocessedTenants: 0,
    });

    const second = await runDigestJob({ now: NOW });
    expect(second).toMatchObject({ sent: 0, skippedAlreadySent: 2, failed: 0 });

    // Two sends in total across both runs, each to exactly one address.
    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    expect(recipientsOf()).toEqual(["anna@contoso.test", "ben@contoso.test"]);
    expect(notifyOpsMock).not.toHaveBeenCalled();

    const annaCall = sendEmailMock.mock.calls
      .map(([args]) => args)
      .find((args) => args.to[0] === "anna@contoso.test")!;
    const unsub = annaCall.headers?.["List-Unsubscribe"] ?? "";
    expect(annaCall.headers?.["List-Unsubscribe-Post"]).toBe(
      "List-Unsubscribe=One-Click",
    );
    const url = new URL(unsub.slice(1, -1));
    expect(url.pathname).toBe("/api/unsubscribe");
    expect(url.searchParams.get("m")).toBe(anna.id);
    expect(url.searchParams.get("j")).toBe("digest");
    expect(
      verifyMembershipUnsubToken(
        anna.id,
        "digest",
        url.searchParams.get("t") ?? "",
        "test-secret-test-secret-test-secret",
      ),
    ).toBe(true);
    expect(annaCall.html).toContain(
      "You get this because you are an admin of Acme.",
    );
    expect(annaCall.html).toContain("Unsubscribe from the weekly digest");
    expect(annaCall.html).toContain(
      "https://licensemeter.test/sign-in?returnTo=%2Fapp%2Fsettings",
    );
    expect(annaCall.html).not.toContain("ben@contoso.test");
    expect(annaCall.idempotencyKey).toMatch(
      /^licensemeter-digest-[0-9a-f]{64}$/,
    );

    const rows = await currentDb.query.emailDeliveries.findMany();
    expect(
      rows.map((r) => [r.recipient, r.status, r.periodKey]).sort(),
    ).toEqual([
      ["anna@contoso.test", "sent", "2026-W38"],
      ["ben@contoso.test", "sent", "2026-W38"],
    ]);
  });

  it("sends again in the next week", async () => {
    await seedMember("anna@contoso.test");
    await seedFinding();
    await runDigestJob({ now: NOW });
    await runDigestJob({ now: new Date("2026-09-21T06:00:00Z") });
    expect(sendEmailMock).toHaveBeenCalledTimes(2);
  });

  it("isolates a failing recipient and retries only that one", async () => {
    await seedMember("anna@contoso.test");
    await seedMember("bad@contoso.test");
    await seedFinding();
    sendEmailMock.mockImplementation((args) =>
      args.to[0] === "bad@contoso.test"
        ? Promise.reject(new Error("Resend responded 422"))
        : Promise.resolve(true),
    );

    const first = await runDigestJob({ now: NOW });
    expect(first).toMatchObject({ sent: 1, failed: 1 });
    expect(notifyOpsMock).toHaveBeenCalledTimes(1);
    expect(notifyOpsMock.mock.calls[0]?.[1]).toMatchObject({
      key: "digest:incomplete",
    });

    sendEmailMock.mockImplementation(() => Promise.resolve(true));
    const second = await runDigestJob({ now: NOW });
    expect(second).toMatchObject({ sent: 1, skippedAlreadySent: 1, failed: 0 });
    expect(recipientsOf()).toEqual([
      "anna@contoso.test",
      "bad@contoso.test",
      "bad@contoso.test",
    ]);
  });

  it("writes no ledger rows when there is nothing to report", async () => {
    // No open findings and no recent sync: the tenant is skipped.
    await seedMember("anna@contoso.test");
    const totals = await runDigestJob({ now: NOW });
    expect(totals).toMatchObject({ tenants: 1, sent: 0, skippedOptedOut: 0 });
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(await currentDb.query.emailDeliveries.findMany()).toHaveLength(0);
  });

  it("skips demo tenants", async () => {
    await currentDb
      .update(schema.tenants)
      .set({ isDemo: true })
      .where(eq(schema.tenants.id, TENANT_ID));
    await seedMember("anna@contoso.test");
    await seedFinding();
    expect(await runDigestJob({ now: NOW })).toMatchObject({ tenants: 0 });
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("stops starting tenants when the budget is used up", async () => {
    const SECOND = "22222222-2222-2222-2222-222222222222";
    await currentDb.insert(schema.tenants).values({ id: SECOND, name: "Beta" });
    await seedMember("anna@contoso.test");
    await seedMember("bea@beta.test", { tenantId: SECOND });
    await seedFinding();
    await seedFinding(SECOND);

    // The clock jumps past the budget after the first tenant started.
    const ticks = [0, 0, 300_000];
    const clock = () => ticks.shift() ?? 300_000;
    const first = await runDigestJob({ now: NOW, clock });
    expect(first).toMatchObject({ tenants: 2, sent: 1, unprocessedTenants: 1 });
    expect(notifyOpsMock).toHaveBeenCalledTimes(1);

    // Running it again finishes the remainder without a duplicate.
    const second = await runDigestJob({ now: NOW });
    expect(second).toMatchObject({
      sent: 1,
      skippedAlreadySent: 1,
      unprocessedTenants: 0,
    });
    expect(recipientsOf()).toEqual(["anna@contoso.test", "bea@beta.test"]);
  });
});

describe("runReportJob", () => {
  it("renders the PDF once, attaches it per recipient, and never resends", async () => {
    await seedMember("anna@contoso.test");
    await seedMember("ben@contoso.test");
    await seedMember("carl@contoso.test", { reportOptOut: true });
    await seedFinding();

    const runAt = new Date("2026-10-01T07:00:00Z");
    const first = await runReportJob({ now: runAt });
    expect(first).toMatchObject({ sent: 2, skippedOptedOut: 1, failed: 0 });
    expect(renderPdfMock).toHaveBeenCalledTimes(1);
    for (const [args] of sendEmailMock.mock.calls) {
      expect(args.to).toHaveLength(1);
      expect(args.attachments).toEqual([
        {
          filename: "report.pdf",
          content: Buffer.from("pdf").toString("base64"),
        },
      ]);
      expect(args.html).toContain("Unsubscribe from the monthly report");
    }

    const second = await runReportJob({ now: runAt });
    expect(second).toMatchObject({ sent: 0, skippedAlreadySent: 2 });
    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    // Nothing left to send: no second render either.
    expect(renderPdfMock).toHaveBeenCalledTimes(1);

    const rows = await currentDb.query.emailDeliveries.findMany();
    expect(new Set(rows.map((r) => r.periodKey))).toEqual(new Set(["2026-09"]));
  });

  it("leaves out workspaces that did not turn the report on", async () => {
    await currentDb
      .update(schema.tenants)
      .set({ monthlyReport: false })
      .where(eq(schema.tenants.id, TENANT_ID));
    await seedMember("anna@contoso.test");
    await seedFinding();
    expect(await runReportJob({ now: NOW })).toMatchObject({ tenants: 0 });
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("prunes ledger rows older than 400 days", async () => {
    await currentDb.insert(schema.emailDeliveries).values({
      tenantId: TENANT_ID,
      job: "digest",
      periodKey: "2025-W01",
      recipient: "old@contoso.test",
      status: "sent",
      createdAt: new Date(NOW.getTime() - 500 * 24 * 60 * 60 * 1000),
    });
    await runReportJob({ now: NOW });
    expect(await currentDb.query.emailDeliveries.findMany()).toHaveLength(0);
  });
});
