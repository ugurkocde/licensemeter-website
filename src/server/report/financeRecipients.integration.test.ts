import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AccessContext, FeatureAccess } from "~/server/access";
import * as schema from "~/server/db/schema";
import type * as EmailModule from "~/server/email";
import { entitlementOf, type Feature, type Plan } from "~/server/entitlement";
import {
  freshDb,
  seedProPlan,
  seedTenant,
  type TestDb,
} from "~/server/mcp/testHarness";
import {
  makeMembershipUnsubToken,
  makeRecipientUnsubToken,
  makeSharedUnsubToken,
} from "~/server/unsubToken";
import { pdfText } from "./pdfText.test-helper";

/**
 * Finance recipients of the monthly executive report and the share-link
 * actions, on a real database: who may create and revoke, the demo guards,
 * the cap of five, the email confirmation, the unsubscribe token domain and
 * the monthly delivery. Only access, the Resend call and ops are stubbed.
 */

const SECRET = "test-secret-test-secret-test-secret";
let currentDb: TestDb;
let tenant: schema.TenantRow;
let member: { role: "viewer" | "admin" | "owner"; plan: Plan; isDemo: boolean };

type SendArgs = {
  to: string[];
  subject: string;
  html: string;
  headers?: Record<string, string>;
  attachments?: { filename: string; content: string }[];
};
let receipts = 0;
const sendMock = vi.fn((_args: SendArgs) =>
  Promise.resolve({ id: `re_${++receipts}` }),
);
const notifyOpsMock = vi.fn((_text: string, _opts?: unknown) =>
  Promise.resolve(),
);

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("~/env", () => ({
  env: { NODE_ENV: "test", AUTH_SECRET: "test-secret-test-secret-test-secret" },
  byoConnectorEnabled: () => true,
  billingEnabled: () => true,
  siteUrl: () => "https://licensemeter.test",
}));
vi.mock("~/server/db", async () => {
  const { createTenantDb } = await import("~/server/db/tenant");
  return {
    db: createTenantDb(
      new Proxy(
        {},
        {
          get: (_t, prop) =>
            (currentDb as unknown as Record<string | symbol, unknown>)[prop],
        },
      ),
    ),
    schema,
  };
});
vi.mock("~/server/email", async (original) => ({
  ...(await original<typeof EmailModule>()),
  emailEnabled: () => true,
  sendEmail: (args: SendArgs) => sendMock(args).then(() => true),
  sendEmailWithReceipt: (args: SendArgs) => sendMock(args),
}));
vi.mock("~/server/ops", () => ({
  notifyOps: (text: string, opts?: unknown) => notifyOpsMock(text, opts),
}));

const RANK = { viewer: 0, admin: 1, owner: 2 } as const;
const entitlement = () =>
  entitlementOf({
    tenant: { isDemo: member.isDemo },
    record:
      member.plan === "free"
        ? null
        : {
            plan: member.plan,
            source: "polar",
            status: "active",
            trialEnd: null,
            currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
            cancelAtPeriodEnd: false,
          },
    covered: true,
    billingEnabled: true,
    now: new Date(),
  });
const context = (): AccessContext =>
  ({
    user: {
      oid: "oid-admin",
      tid: "",
      upn: "admin@contoso.example",
      name: "Admin",
      isDemo: member.isDemo,
    },
    tenant: { ...tenant, isDemo: member.isDemo },
    membership: { id: "m1", role: member.role, email: "admin@contoso.example" },
    entitlement: entitlement(),
    workspaces: [],
  }) as unknown as AccessContext;
vi.mock("~/server/access", () => ({
  apiAccess: async (minRole: keyof typeof RANK) =>
    RANK[member.role] >= RANK[minRole] ? context() : null,
  apiFeatureAccess: async (
    feature: Feature,
    minRole: keyof typeof RANK,
  ): Promise<FeatureAccess> => {
    if (RANK[member.role] < RANK[minRole])
      return { ctx: null, denied: "unauthorized" };
    return entitlement().features[feature]
      ? { ctx: context(), denied: null }
      : { ctx: null, denied: "featureRequired", feature, plan: "pro" };
  },
}));

const actions = await import("~/app/app/(dash)/reports/executive/actions");
const recipients = await import("./recipients");
const { createShareLink } = await import("./shareLinks");
const { runExecReportJob } = await import("./financeDelivery");
const verifyRoute = await import("~/app/api/reports/recipients/verify/route");
const unsubRoute = await import("~/app/api/unsubscribe/route");

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(values)) data.set(k, v);
  return data;
};

const tokenFromLastMail = () => {
  const html = sendMock.mock.calls.at(-1)![0].html;
  const match = /verify\?r=([0-9a-f-]{36})&amp;token=([0-9a-f]{64})/.exec(html);
  if (!match) throw new Error("no confirm link in the mail");
  return { r: match[1]!, token: match[2]! };
};

const confirm = (r: string, token: string) =>
  verifyRoute.POST(
    new Request("https://licensemeter.test/api/reports/recipients/verify", {
      method: "POST",
      body: form({ r, token }),
    }),
  );

const unsubscribe = (query: string) =>
  unsubRoute.POST(
    new NextRequest(`https://licensemeter.test/api/unsubscribe?${query}`, {
      method: "POST",
    }),
  );

const recipientRows = () =>
  currentDb.query.reportRecipients.findMany({
    where: eq(schema.reportRecipients.tenantId, tenant.id),
  });

const E3 = "05e9a617-0261-4cee-bb44-138d3ef5d965";
const seedData = async (t: schema.TenantRow) => {
  await currentDb.insert(schema.tenantSkus).values({
    tenantId: t.id,
    skuId: E3,
    skuPartNumber: "SPE_E3",
    displayName: "Microsoft 365 E3",
    prepaidEnabled: 100,
    consumedUnits: 90,
  });
  await currentDb
    .insert(schema.priceBook)
    .values({ tenantId: t.id, skuId: E3, monthlyPriceCents: 3_600 });
  await currentDb.insert(schema.findings).values({
    tenantId: t.id,
    dedupeKey: "inactive|a",
    rule: "inactive_90d",
    graphUserId: "aaaaaaaa-1111-4222-8333-444444444444",
    title: "Inactive for 120 days: Alice Wonderland",
    monthlyImpactCents: 3_600,
    detail: { upn: "alice.wonderland@contoso.example" },
  });
};

/** Adds and confirms a finance recipient through the real flow. */
const addConfirmed = async (email: string) => {
  expect(
    await actions.addFinanceRecipientAction(form({ email, name: "" })),
  ).toEqual({ ok: true });
  const { r, token } = tokenFromLastMail();
  expect((await confirm(r, token)).status).toBe(200);
  return r;
};

afterEach(async () => {
  await currentDb.$client.close();
});

beforeEach(async () => {
  currentDb = await freshDb();
  tenant = await seedTenant(currentDb, 1, { name: "Contoso GmbH" });
  member = { role: "admin", plan: "pro", isDemo: false };
  sendMock.mockClear();
  notifyOpsMock.mockClear();
});

describe("share link actions", () => {
  it("creates a snapshot link on Pro and stores no raw token", async () => {
    const res = await actions.createShareLinkAction(
      form({ label: "CFO review", mode: "snapshot", ttl: "30" }),
    );
    if (!res.ok) throw new Error(res.error);
    expect(res.url).toMatch(
      /^https:\/\/licensemeter\.test\/r\/lmr_[A-Za-z0-9_-]{43}$/,
    );
    const token = res.url.split("/r/")[1]!;
    const [row] = await currentDb.select().from(schema.reportShareLinks);
    expect(row!.mode).toBe("snapshot");
    expect(row!.snapshotPayload).not.toBeNull();
    expect(JSON.stringify(row)).not.toContain(token);
    const audit = await currentDb.query.auditLog.findMany();
    expect(audit.map((a) => a.action)).toContain("report_share_link_created");
    expect(JSON.stringify(audit)).not.toContain(token);
  });

  it("blocks new links on Free and for viewers, but lets an admin revoke on Free", async () => {
    const created = await createShareLink({
      tenantId: tenant.id,
      label: "Before cancel",
      mode: "live",
      ttlDays: 30,
      createdByKey: "oid-admin",
    });
    if (!created.ok) throw new Error("not created");

    member.plan = "free";
    expect(
      await actions.createShareLinkAction(
        form({ label: "After cancel", mode: "snapshot", ttl: "30" }),
      ),
    ).toEqual({ ok: false, error: expect.stringMatching(/Pro/) as string });
    expect(await actions.revokeShareLinkAction(created.link.id)).toEqual({
      ok: true,
    });

    member = { role: "viewer", plan: "pro", isDemo: false };
    expect(
      await actions.createShareLinkAction(
        form({ label: "Viewer", mode: "live", ttl: "30" }),
      ),
    ).toEqual({ ok: false, error: "Not allowed" });
    expect(await actions.revokeShareLinkAction(created.link.id)).toEqual({
      ok: false,
      error: "Not allowed",
    });
    const rows = await currentDb.select().from(schema.reportShareLinks);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.revokedAt).not.toBeNull();
  });

  it("refuses bad input and ids from another workspace", async () => {
    expect(
      await actions.createShareLinkAction(
        form({ label: "x", mode: "public", ttl: "30" }),
      ),
    ).toMatchObject({ ok: false });
    expect(
      await actions.createShareLinkAction(
        form({ label: "x", mode: "live", ttl: "365" }),
      ),
    ).toMatchObject({ ok: false });
    expect(
      await actions.createShareLinkAction(
        form({ label: " ", mode: "live", ttl: "30" }),
      ),
    ).toMatchObject({ ok: false });
    const other = await seedTenant(currentDb, 2, { name: "Other" });
    const foreign = await createShareLink({
      tenantId: other.id,
      label: "Foreign",
      mode: "live",
      ttlDays: 30,
      createdByKey: "oid",
    });
    if (!foreign.ok) throw new Error("not created");
    expect(await actions.revokeShareLinkAction(foreign.link.id)).toEqual({
      ok: false,
      error: "Link not found",
    });
    expect(await actions.revokeShareLinkAction("not-a-uuid")).toEqual({
      ok: false,
      error: "Link not found",
    });
  });
});

describe("demo workspace", () => {
  it("cannot create share links or email anyone outside it", async () => {
    member = { role: "owner", plan: "msp", isDemo: true };
    expect(
      await actions.createShareLinkAction(
        form({ label: "Demo", mode: "live", ttl: "30" }),
      ),
    ).toEqual({ ok: false, error: expect.stringMatching(/demo/i) as string });
    expect(
      await actions.addFinanceRecipientAction(
        form({ email: "cfo@contoso.example" }),
      ),
    ).toEqual({ ok: false, error: expect.stringMatching(/demo/i) as string });
    expect(sendMock).not.toHaveBeenCalled();
    expect(await currentDb.select().from(schema.reportShareLinks)).toEqual([]);
    expect(await recipientRows()).toEqual([]);
  });

  it("is never part of the monthly delivery", async () => {
    const demo = await seedTenant(currentDb, 3, { name: "Demo", isDemo: true });
    await seedData(demo);
    await currentDb.insert(schema.reportRecipients).values({
      tenantId: demo.id,
      kind: "finance",
      email: "cfo@demo.example",
      verifiedAt: new Date(),
    });
    const totals = await runExecReportJob();
    expect(totals.tenants).toBe(0);
    expect(sendMock).not.toHaveBeenCalled();
  });
});

describe("finance recipients", () => {
  it("sends nothing to an address until it confirms, then confirms once", async () => {
    expect(
      await actions.addFinanceRecipientAction(
        form({ email: " CFO@Contoso.Example ", name: "Chief Financial" }),
      ),
    ).toEqual({ ok: true });
    expect(sendMock).toHaveBeenCalledTimes(1);
    const mail = sendMock.mock.calls[0]![0];
    expect(mail.to).toEqual(["cfo@contoso.example"]);
    const [pending] = await recipientRows();
    expect(pending!.email).toBe("cfo@contoso.example");
    expect(pending!.verifiedAt).toBeNull();
    const { r, token } = tokenFromLastMail();
    // Only the hash of the confirmation token is stored.
    expect(JSON.stringify(pending)).not.toContain(token);
    expect(pending!.verifyTokenHash).toHaveLength(64);

    // A GET (mail scanner) changes nothing.
    const get = verifyRoute.GET(
      new Request(
        `https://licensemeter.test/api/reports/recipients/verify?r=${r}&token=${token}`,
      ),
    );
    expect(get.status).toBe(200);
    expect((await recipientRows())[0]!.verifiedAt).toBeNull();

    expect((await confirm(r, "0".repeat(64))).status).toBe(400);
    expect((await confirm(r, token)).status).toBe(200);
    const [verified] = await recipientRows();
    expect(verified!.verifiedAt).not.toBeNull();
    expect(verified!.verifyTokenHash).toBeNull();
    // The link works once.
    expect((await confirm(r, token)).status).toBe(400);
    const audit = await currentDb.query.auditLog.findMany();
    expect(audit.map((a) => a.action)).toEqual(
      expect.arrayContaining([
        "report_recipient_requested",
        "report_recipient_verified",
      ]),
    );
  });

  it("refuses an expired confirmation link", async () => {
    await actions.addFinanceRecipientAction(
      form({ email: "cfo@contoso.example" }),
    );
    const { r, token } = tokenFromLastMail();
    await currentDb
      .update(schema.reportRecipients)
      .set({ verifyExpiresAt: new Date(Date.now() - 1000) });
    expect((await confirm(r, token)).status).toBe(400);
    expect((await recipientRows())[0]!.verifiedAt).toBeNull();
  });

  it("caps a workspace at five finance recipients", async () => {
    for (let i = 1; i <= recipients.MAX_RECIPIENTS_PER_KIND; i++) {
      expect(
        await actions.addFinanceRecipientAction(
          form({ email: `finance${i}@contoso.example` }),
        ),
      ).toEqual({ ok: true });
    }
    // The confirmation limiter allows five a day; clear it to reach the cap.
    await currentDb.delete(schema.rateLimits);
    expect(
      await actions.addFinanceRecipientAction(
        form({ email: "finance6@contoso.example" }),
      ),
    ).toEqual({
      ok: false,
      error: expect.stringMatching(/5 finance/) as string,
    });
    expect(await recipientRows()).toHaveLength(5);
    // Asking again for an address on the list is not a new recipient.
    expect(
      await actions.addFinanceRecipientAction(
        form({ email: "finance1@contoso.example" }),
      ),
    ).toEqual({ ok: true });
    expect(await recipientRows()).toHaveLength(5);
    // Another kind has its own five.
    const client = await recipients.upsertRecipient({
      tenantId: tenant.id,
      kind: "client",
      email: "client@partner.example",
      name: null,
    });
    expect(client.ok).toBe(true);
  });

  it("rate limits confirmation emails per workspace", async () => {
    for (let i = 0; i < 5; i++) {
      await actions.addFinanceRecipientAction(
        form({ email: "cfo@contoso.example" }),
      );
    }
    expect(
      await actions.addFinanceRecipientAction(
        form({ email: "cfo@contoso.example" }),
      ),
    ).toEqual({
      ok: false,
      error: expect.stringMatching(/Too many/) as string,
    });
    expect(sendMock).toHaveBeenCalledTimes(5);
  });

  it("needs Pro to add, but removing works on Free", async () => {
    const id = await addConfirmed("cfo@contoso.example");
    member.plan = "free";
    expect(
      await actions.addFinanceRecipientAction(
        form({ email: "other@contoso.example" }),
      ),
    ).toEqual({ ok: false, error: expect.stringMatching(/Pro/) as string });
    expect(await actions.resendFinanceRecipientAction(id)).toMatchObject({
      ok: false,
    });
    expect(await actions.removeFinanceRecipientAction(id)).toEqual({
      ok: true,
    });
    expect(await recipientRows()).toEqual([]);
  });
});

describe("unsubscribe token domains", () => {
  it("lets a recipient link switch off only that recipient", async () => {
    const id = await addConfirmed("cfo@contoso.example");
    const [membership] = await currentDb
      .insert(schema.memberships)
      .values({
        tenantId: tenant.id,
        email: "admin@contoso.example",
        oid: "oid-admin",
        role: "admin",
      })
      .returning();
    await currentDb.insert(schema.notificationAddresses).values({
      tenantId: tenant.id,
      email: "it@contoso.example",
      verifiedAt: new Date(),
    });

    const t = makeRecipientUnsubToken(id, "finance", SECRET);
    const res = await unsubscribe(`r=${id}&k=finance&t=${t}`);
    expect(await res.text()).toContain("You are unsubscribed");
    const [row] = await recipientRows();
    expect(row!.unsubscribedAt).not.toBeNull();
    // Nothing else changed.
    const m = await currentDb.query.memberships.findFirst({
      where: eq(schema.memberships.id, membership!.id),
    });
    expect([m!.digestOptOut, m!.reportOptOut, m!.renewalOptOut]).toEqual([
      false,
      false,
      false,
    ]);
    const shared = await currentDb.query.notificationAddresses.findFirst();
    expect([shared!.digest, shared!.report, shared!.renewalAlerts]).toEqual([
      true,
      true,
      true,
    ]);
  });

  it("never accepts one domain's token for another", async () => {
    const id = await addConfirmed("cfo@contoso.example");
    const [membership] = await currentDb
      .insert(schema.memberships)
      .values({
        tenantId: tenant.id,
        email: "admin@contoso.example",
        oid: "oid-admin",
        role: "admin",
      })
      .returning();
    const mid = membership!.id;

    // Digest, report, renewal and shared tokens, even over the recipient's id,
    // do not unsubscribe the recipient.
    for (const job of ["digest", "report", "renewal"] as const) {
      for (const t of [
        makeMembershipUnsubToken(id, job, SECRET),
        makeSharedUnsubToken(id, job, SECRET),
      ]) {
        const res = await unsubscribe(`r=${id}&k=finance&t=${t}`);
        expect(await res.text()).toContain("This link is not valid");
      }
    }
    // A finance token does not serve the client kind either.
    const financeToken = makeRecipientUnsubToken(id, "finance", SECRET);
    expect(
      await (await unsubscribe(`r=${id}&k=client&t=${financeToken}`)).text(),
    ).toContain("This link is not valid");
    expect((await recipientRows())[0]!.unsubscribedAt).toBeNull();

    // And a recipient token cannot switch off a member's or the shared
    // address's digest, report or renewal reminders.
    const recipientTokenForMember = makeRecipientUnsubToken(
      mid,
      "finance",
      SECRET,
    );
    for (const job of ["digest", "report", "renewal"]) {
      for (const query of [
        `m=${mid}&j=${job}&t=${recipientTokenForMember}`,
        `w=${tenant.id}&j=${job}&t=${makeRecipientUnsubToken(tenant.id, "finance", SECRET)}`,
      ]) {
        const res = await unsubscribe(query);
        expect(await res.text()).toContain("This link is not valid");
      }
    }
    const m = await currentDb.query.memberships.findFirst({
      where: eq(schema.memberships.id, mid),
    });
    expect([m!.digestOptOut, m!.reportOptOut, m!.renewalOptOut]).toEqual([
      false,
      false,
      false,
    ]);
  });

  it("brings an unsubscribed recipient back only after a new confirmation", async () => {
    const id = await addConfirmed("cfo@contoso.example");
    const t = makeRecipientUnsubToken(id, "finance", SECRET);
    await unsubscribe(`r=${id}&k=finance&t=${t}`);
    expect(await actions.resendFinanceRecipientAction(id)).toEqual({
      ok: true,
    });
    expect((await recipientRows())[0]!.unsubscribedAt).not.toBeNull();
    const { r, token } = tokenFromLastMail();
    await confirm(r, token);
    expect((await recipientRows())[0]!.unsubscribedAt).toBeNull();
  });
});

describe("monthly delivery to finance", () => {
  const NOW = new Date("2026-12-01T08:00:00Z");

  it("mails confirmed, subscribed recipients once, with the PDF and no user PII", async () => {
    await seedProPlan(currentDb, tenant.id);
    await seedData(tenant);
    const confirmed = await addConfirmed("cfo@contoso.example");
    const unsubscribed = await addConfirmed("old-cfo@contoso.example");
    await recipients.unsubscribeRecipient(unsubscribed, "finance");
    await actions.addFinanceRecipientAction(
      form({ email: "pending@contoso.example" }),
    );
    sendMock.mockClear();

    const totals = await runExecReportJob({ now: NOW });
    expect(totals).toMatchObject({ tenants: 1, sent: 1, failed: 0 });
    expect(sendMock).toHaveBeenCalledTimes(1);
    const mail = sendMock.mock.calls[0]![0];
    expect(mail.to).toEqual(["cfo@contoso.example"]);
    expect(mail.subject).toBe(
      "Executive savings report for November 2026: Contoso GmbH",
    );
    expect(mail.headers?.["List-Unsubscribe-Post"]).toBe(
      "List-Unsubscribe=One-Click",
    );
    const unsub = /<(.+)>/.exec(mail.headers!["List-Unsubscribe"]!)![1]!;
    expect(unsub).toContain(`r=${confirmed}&k=finance&t=`);
    expect(mail.html).not.toContain("/app/");
    expect(mail.attachments?.[0]?.filename).toBe(
      "licensemeter-executive-report-contoso-gmbh-2026-11.pdf",
    );
    const pdf = Buffer.from(mail.attachments![0]!.content, "base64");
    const text = pdfText(pdf);
    for (const pii of [
      "Alice Wonderland",
      "alice.wonderland@contoso.example",
      "aaaaaaaa-1111-4222-8333-444444444444",
    ]) {
      expect(text).not.toContain(pii);
      expect(mail.html).not.toContain(pii);
    }
    const [delivery] = await currentDb.select().from(schema.emailDeliveries);
    expect(delivery).toMatchObject({
      job: "exec_report",
      periodKey: "2026-11",
      status: "sent",
    });

    // Running it again sends nothing new.
    sendMock.mockClear();
    const again = await runExecReportJob({ now: NOW });
    expect(again).toMatchObject({ sent: 0, skippedAlreadySent: 1 });
    expect(sendMock).not.toHaveBeenCalled();

    // The one-click unsubscribe from the header stops next month's email.
    await unsubRoute.POST(new NextRequest(unsub, { method: "POST" }));
    const next = await runExecReportJob({
      now: new Date("2027-01-01T08:00:00Z"),
    });
    expect(next.tenants).toBe(0);
  });

  it("sends nothing once the plan has no executive report", async () => {
    await seedData(tenant);
    await currentDb.insert(schema.reportRecipients).values({
      tenantId: tenant.id,
      kind: "finance",
      email: "cfo@contoso.example",
      verifiedAt: new Date(),
    });
    const totals = await runExecReportJob({ now: NOW });
    expect(totals).toMatchObject({ tenants: 1, skippedNoPlan: 1, sent: 0 });
    expect(sendMock).not.toHaveBeenCalled();
  });
});
