import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AccessContext } from "~/server/access";
import * as schema from "~/server/db/schema";
import type * as EmailModule from "~/server/email";
import { freshDb, seedTenant, type TestDb } from "~/server/mcp/testHarness";

/**
 * Who may run the two email recovery actions, and what they do to the
 * database. The real guards of ~/server/actions run against a real database;
 * only the access layer and the Resend call are fixtures.
 */

let currentDb: TestDb;
let tenant: schema.TenantRow;
let other: schema.TenantRow;
let member: { role: "viewer" | "admin" | "owner"; isDemo: boolean };

type SendArgs = { to: string[]; subject: string; html: string };
let receipts = 0;
const sendEmailMock = vi.fn((_args: SendArgs) =>
  Promise.resolve({ id: `re_${++receipts}` }),
);

vi.mock("~/env", () => ({
  env: { NODE_ENV: "test", AUTH_SECRET: "test-secret-test-secret-test-secret" },
  byoConnectorEnabled: () => true,
  siteUrl: () => "https://licensemeter.test",
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

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

// The currency action's server-only ECB client is outside this suite.
vi.mock("~/server/exchangeRates", () => ({
  fetchEcbReferenceRates: vi.fn(() =>
    Promise.resolve({ asOf: "2026-07-09", perEur: { EUR: 1 } }),
  ),
}));

const RANK = { viewer: 0, admin: 1, owner: 2 } as const;

vi.mock("~/server/access", () => ({
  apiAccess: async (minRole: keyof typeof RANK) =>
    RANK[member.role] >= RANK[minRole]
      ? ({
          user: { oid: "user_1", tid: "", upn: "a@a.example", name: "A" },
          tenant: { ...tenant, isDemo: member.isDemo },
          membership: { id: "m1", role: member.role, email: "a@a.example" },
          workspaces: [],
        } as unknown as AccessContext)
      : null,
}));

const { removeEmailBlock, sendCurrentFindingsEmail } =
  await import("~/server/actions");

const BLOCKED = "blocked@contoso.test";

const seedLeak = () =>
  currentDb.insert(schema.findings).values({
    tenantId: tenant.id,
    dedupeKey: `leak|${tenant.id}`,
    rule: "disabled_account_with_license",
    title: "Disabled account keeps a license",
    monthlyImpactCents: 2300,
  });

const seedAdmin = () =>
  currentDb.insert(schema.memberships).values({
    tenantId: tenant.id,
    email: "anna@contoso.test",
    oid: "oid-anna",
    role: "owner",
  });

const seedBlock = (tenantId: string) =>
  currentDb
    .insert(schema.emailBlocks)
    .values({ tenantId, email: BLOCKED, reason: "bounced" });

beforeEach(async () => {
  currentDb = await freshDb();
  tenant = await seedTenant(currentDb, 1, { name: "Acme" });
  other = await seedTenant(currentDb, 2, { name: "Beta" });
  member = { role: "admin", isDemo: false };
  sendEmailMock.mockClear();
});

describe("sendCurrentFindingsEmail", () => {
  it("mails the open leaks and records what it did", async () => {
    await seedAdmin();
    await seedLeak();

    const res = await sendCurrentFindingsEmail();
    expect(res.ok).toBe(true);
    expect(res.summary).toMatchObject({ findings: 1, sent: 1, failed: 0 });
    expect(sendEmailMock.mock.calls[0]?.[0].to).toEqual(["anna@contoso.test"]);

    const [entry] = await currentDb.query.auditLog.findMany();
    expect(entry).toMatchObject({
      action: "current_findings_sent",
      detail: { findings: 1, sent: 1, skippedBlocked: 0, failed: 0 },
    });
  });

  it("reports an empty workspace instead of failing", async () => {
    await seedAdmin();

    const res = await sendCurrentFindingsEmail();
    expect(res).toMatchObject({ ok: true });
    expect(res.summary?.reason).toBe("no-findings");
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("stops after three requested sends a day", async () => {
    await seedAdmin();
    await seedLeak();

    for (let i = 0; i < 3; i++) {
      expect((await sendCurrentFindingsEmail()).ok).toBe(true);
    }
    const fourth = await sendCurrentFindingsEmail();
    expect(fourth.ok).toBe(false);
    expect(fourth.error).toContain("Too many requested emails today");
    expect(sendEmailMock).toHaveBeenCalledTimes(3);
  });
});

describe("removeEmailBlock", () => {
  it("clears one address for this workspace only", async () => {
    await seedBlock(tenant.id);
    await seedBlock(other.id);

    expect(await removeEmailBlock(` ${BLOCKED.toUpperCase()} `)).toEqual({
      ok: true,
    });

    const rows = await currentDb.query.emailBlocks.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ tenantId: other.id, email: BLOCKED });
    const [entry] = await currentDb.query.auditLog.findMany();
    expect(entry).toMatchObject({
      action: "email_block_removed",
      detail: { email: BLOCKED },
    });
  });

  it("says so when the address is not blocked here", async () => {
    await seedBlock(other.id);

    expect((await removeEmailBlock(BLOCKED)).ok).toBe(false);
    expect((await removeEmailBlock("")).ok).toBe(false);
    expect(await currentDb.query.emailBlocks.findMany()).toHaveLength(1);
  });
});

describe("who may run the recovery actions", () => {
  const attempts = async () => [
    await sendCurrentFindingsEmail(),
    await removeEmailBlock(BLOCKED),
  ];

  beforeEach(async () => {
    await seedAdmin();
    await seedLeak();
    await seedBlock(tenant.id);
  });

  it("refuses a viewer", async () => {
    member = { role: "viewer", isDemo: false };

    for (const res of await attempts()) {
      expect(res).toEqual({ ok: false, error: "Not allowed" });
    }
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(
      await currentDb.query.emailBlocks.findFirst({
        where: and(
          eq(schema.emailBlocks.tenantId, tenant.id),
          eq(schema.emailBlocks.email, BLOCKED),
        ),
      }),
    ).toBeDefined();
  });

  it("refuses an admin of the demo workspace", async () => {
    member = { role: "admin", isDemo: true };

    for (const res of await attempts()) {
      expect(res.ok).toBe(false);
      expect(res.error).toContain("demo workspace is read-only");
    }
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(await currentDb.query.emailBlocks.findMany()).toHaveLength(1);
  });
});
