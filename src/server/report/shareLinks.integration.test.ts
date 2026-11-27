import { createHash } from "node:crypto";

import { eq } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "~/server/db/schema";
import { entitlementOf } from "~/server/entitlement";
import {
  freshDb,
  seedProPlan,
  seedTenant,
  type TestDb,
} from "~/server/mcp/testHarness";
import { pdfPages, pdfText } from "./pdfText.test-helper";

/**
 * CFO share links end to end on a real database: how tokens are stored, the
 * public /r/[token] page and its PDF route, the single 404, the rate limit,
 * and how live and snapshot links behave once the plan is cancelled.
 */

let currentDb: TestDb;
let tenant: schema.TenantRow;
let requestHeaders = new Headers({ "x-real-ip": "203.0.113.7" });

vi.mock("server-only", () => ({}));
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
vi.mock("next/headers", () => ({ headers: async () => requestHeaders }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const {
  createShareLink,
  findActiveShareLink,
  hashShareToken,
  listShareLinks,
  MAX_ACTIVE_LINKS,
  revokeShareLink,
} = await import("./shareLinks");
const { loadPublicReport, PUBLIC_LIMITS } = await import("./publicReport");
const { loadExecutiveSummary } = await import("./executiveData");
const { default: SharedReportPage } = await import("~/app/r/[token]/page");
const { GET: publicPdf } =
  await import("~/app/api/reports/public/[token]/pdf/route");

const E3 = "05e9a617-0261-4cee-bb44-138d3ef5d965";
const DAY = 86_400_000;
const PII = [
  "Alice Wonderland",
  "alice.wonderland@contoso.example",
  "Bob Builder",
  "bob.builder@contoso.example",
  "aaaaaaaa-1111-4222-8333-444444444444",
  "oid-of-the-admin",
  "admin@contoso.example",
] as const;

const proEntitlement = () =>
  entitlementOf({
    tenant: { isDemo: false },
    record: {
      plan: "pro",
      source: "polar",
      status: "active",
      trialEnd: null,
      currentPeriodEnd: new Date(Date.now() + 30 * DAY),
      cancelAtPeriodEnd: false,
    },
    covered: true,
    billingEnabled: true,
    now: new Date(),
  });

const seedData = async (t: schema.TenantRow) => {
  await currentDb.insert(schema.tenantSkus).values({
    tenantId: t.id,
    skuId: E3,
    skuPartNumber: "SPE_E3",
    displayName: "Microsoft 365 E3",
    prepaidEnabled: 100,
    consumedUnits: 90,
    nextLifecycleAt: new Date(Date.now() + 40 * DAY),
  });
  await currentDb
    .insert(schema.priceBook)
    .values({ tenantId: t.id, skuId: E3, monthlyPriceCents: 3_600 });
  const licenses = [
    { skuId: E3, name: "Microsoft 365 E3", monthlyPriceCents: 3_600 },
  ];
  await currentDb.insert(schema.findings).values([
    {
      tenantId: t.id,
      dedupeKey: "inactive|a",
      rule: "inactive_90d",
      graphUserId: PII[4],
      title: `Inactive for 120 days: ${PII[0]}`,
      monthlyImpactCents: 3_600,
      detail: { upn: PII[1], displayName: PII[0], licenses },
    },
    {
      tenantId: t.id,
      dedupeKey: "disabled|b",
      rule: "disabled_account_with_license",
      graphUserId: "user-b",
      title: `Disabled account still licensed: ${PII[2]}`,
      monthlyImpactCents: 3_600,
      detail: { upn: PII[3], displayName: PII[2], licenses },
    },
  ]);
  await currentDb.insert(schema.memberships).values({
    tenantId: t.id,
    email: PII[6],
    oid: PII[5],
    role: "owner",
  });
};

const newLink = async (
  mode: "live" | "snapshot",
  overrides: { tenantId?: string; ttlDays?: 7 | 30 | 90; now?: Date } = {},
) => {
  const tenantId = overrides.tenantId ?? tenant.id;
  const now = overrides.now ?? new Date();
  const snapshot =
    mode === "snapshot"
      ? {
          version: 1 as const,
          summary: await loadExecutiveSummary(
            (await currentDb.query.tenants.findFirst({
              where: eq(schema.tenants.id, tenantId),
            }))!,
            proEntitlement(),
            now,
          ),
          branding: null,
        }
      : undefined;
  const created = await createShareLink(
    {
      tenantId,
      label: `CFO ${mode}`,
      mode,
      ttlDays: overrides.ttlDays ?? 30,
      createdByKey: PII[5],
      snapshot,
    },
    now,
  );
  if (!created.ok) throw new Error(created.error);
  return created;
};

const renderPage = async (token: string) =>
  renderToStaticMarkup(
    await SharedReportPage({ params: Promise.resolve({ token }) }),
  );

const pdfResponse = (token: string) =>
  publicPdf(
    new Request(`https://licensemeter.test/api/reports/public/${token}/pdf`, {
      headers: requestHeaders,
    }),
    { params: Promise.resolve({ token }) },
  );

const expectNoPii = (text: string) => {
  for (const value of PII) expect(text).not.toContain(value);
  expect(text).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.-]+/);
};

/** Cancelled and past its period: Free from now on. */
const cancelPlan = async () => {
  await currentDb
    .update(schema.entitlements)
    .set({
      status: "canceled",
      currentPeriodEnd: new Date(Date.now() - DAY),
    })
    .where(eq(schema.entitlements.tenantId, tenant.id));
};

const UNKNOWN = `lmr_${"A".repeat(43)}`;

afterEach(async () => {
  await currentDb.$client.close();
});

beforeEach(async () => {
  currentDb = await freshDb();
  // A fresh IP per test, so the durable limiter starts empty.
  requestHeaders = new Headers({
    "x-real-ip": `203.0.113.${Math.floor(Math.random() * 200) + 1}`,
  });
  tenant = await seedTenant(currentDb, 1, {
    name: "Contoso GmbH",
    activitySignal: "full",
  });
  await seedProPlan(currentDb, tenant.id);
  await seedData(tenant);
});

describe("share link storage", () => {
  it("stores only the sha256 of a 256-bit token, never the token itself", async () => {
    const created = await newLink("live");
    expect(created.token).toMatch(/^lmr_[A-Za-z0-9_-]{43}$/);
    // 43 base64url characters carry 256 bits.
    expect(Buffer.from(created.token.slice(4), "base64url").length).toBe(32);
    const [row] = await currentDb.select().from(schema.reportShareLinks);
    expect(row!.tokenHash).toBe(
      createHash("sha256").update(created.token).digest("hex"),
    );
    expect(row!.tokenHash).toBe(hashShareToken(created.token));
    expect(row!.tokenPrefix).toBe(created.token.slice(0, 10));
    const stored = JSON.stringify(row);
    expect(stored).not.toContain(created.token);
    expect(stored).not.toContain(created.token.slice(10));
    // Listing never hands out the hash.
    const [listed] = await listShareLinks(tenant.id);
    expect(JSON.stringify(listed)).not.toContain(row!.tokenHash);
  });

  it("mints a different token every time", async () => {
    const a = await newLink("live");
    const b = await newLink("live");
    expect(a.token).not.toBe(b.token);
  });

  it("refuses beyond the cap of active links, but expired ones do not count", async () => {
    for (let i = 0; i < MAX_ACTIVE_LINKS; i++) await newLink("live");
    await expect(
      createShareLink({
        tenantId: tenant.id,
        label: "One too many",
        mode: "live",
        ttlDays: 30,
        createdByKey: "oid",
      }),
    ).resolves.toEqual({ ok: false, error: "limit" });
    await currentDb
      .update(schema.reportShareLinks)
      .set({
        createdAt: new Date(Date.now() - 2000),
        expiresAt: new Date(Date.now() - 1000),
      })
      .where(eq(schema.reportShareLinks.label, "CFO live"));
    await expect(newLink("live")).resolves.toMatchObject({
      token: expect.any(String) as string,
    });
  });

  it("refuses a snapshot without its payload", async () => {
    await expect(
      createShareLink({
        tenantId: tenant.id,
        label: "No payload",
        mode: "snapshot",
        ttlDays: 30,
        createdByKey: "oid",
      }),
    ).resolves.toEqual({ ok: false, error: "snapshotMissing" });
  });

  it("revokes only within the workspace that owns the link", async () => {
    const other = await seedTenant(currentDb, 2, { name: "Other" });
    const created = await newLink("live");
    expect(await revokeShareLink(other.id, created.link.id)).toBeNull();
    expect(await findActiveShareLink(created.token)).not.toBeNull();
    expect(await revokeShareLink(tenant.id, created.link.id)).toMatchObject({
      id: created.link.id,
    });
    expect(await findActiveShareLink(created.token)).toBeNull();
    // A second revoke matches nothing.
    expect(await revokeShareLink(tenant.id, created.link.id)).toBeNull();
    expect(await listShareLinks(tenant.id)).toEqual([]);
  });

  it("expires at the chosen lifetime", async () => {
    const now = new Date();
    const created = await newLink("live", { ttlDays: 7, now });
    expect(created.link.expiresAt.getTime()).toBe(now.getTime() + 7 * DAY);
    expect(
      await findActiveShareLink(
        created.token,
        new Date(now.getTime() + 7 * DAY - 1),
      ),
    ).not.toBeNull();
    expect(
      await findActiveShareLink(
        created.token,
        new Date(now.getTime() + 7 * DAY),
      ),
    ).toBeNull();
  });
});

describe("public share page and PDF", () => {
  it("renders a live link without any user PII and counts the view", async () => {
    const created = await newLink("live");
    const html = await renderPage(created.token);
    expect(html).toContain("Contoso GmbH");
    expect(html).toContain("Live report");
    expect(html).toContain(`/api/reports/public/${created.token}/pdf`);
    expectNoPii(html);
    const [row] = await currentDb.select().from(schema.reportShareLinks);
    expect(row!.viewCount).toBe(1);
    expect(row!.lastViewedAt).not.toBeNull();
  });

  it("serves the one-page PDF without user PII and with private headers", async () => {
    const created = await newLink("snapshot");
    const res = await pdfResponse(created.token);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(res.headers.get("Content-Disposition")).toMatch(
      /filename="licensemeter-executive-report-contoso-gmbh-\d{4}-\d{2}\.pdf"/,
    );
    const pdf = Buffer.from(await res.arrayBuffer());
    expect(pdfPages(pdf)).toHaveLength(1);
    const text = pdfText(pdf);
    expect(text).toContain("Contoso GmbH");
    expectNoPii(text);
  });

  it("answers unknown, malformed, expired and revoked links with the same 404", async () => {
    const expired = await newLink("live", {
      ttlDays: 7,
      now: new Date(Date.now() - 8 * DAY),
    });
    const revoked = await newLink("snapshot");
    await revokeShareLink(tenant.id, revoked.link.id);
    const tokens = [
      UNKNOWN,
      "not-a-token",
      `${revoked.token}x`,
      expired.token,
      revoked.token,
    ];
    const answers = [];
    for (const token of tokens) {
      await expect(renderPage(token)).rejects.toThrow("NEXT_NOT_FOUND");
      const res = await pdfResponse(token);
      answers.push({
        status: res.status,
        body: await res.text(),
        headers: [...res.headers.entries()].sort(),
      });
    }
    expect(answers[0]!.status).toBe(404);
    expect(answers[0]!.headers).toContainEqual([
      "cache-control",
      "private, no-store",
    ]);
    for (const answer of answers) expect(answer).toEqual(answers[0]);
    // Refused views are not counted.
    const rows = await currentDb.select().from(schema.reportShareLinks);
    expect(rows.every((r) => r.viewCount === 0)).toBe(true);
  });

  it("rate limits per client before looking the token up", async () => {
    for (let i = 0; i < PUBLIC_LIMITS.view.max; i++) {
      expect(
        (await loadPublicReport(UNKNOWN, requestHeaders, "view")).kind,
      ).toBe("notFound");
    }
    expect((await loadPublicReport(UNKNOWN, requestHeaders, "view")).kind).toBe(
      "rateLimited",
    );
    // A valid link is refused the same way once the client is over the limit.
    const created = await newLink("live");
    expect(
      (await loadPublicReport(created.token, requestHeaders, "view")).kind,
    ).toBe("rateLimited");
    const html = await renderPage(created.token);
    expect(html).toContain("Too many requests");
    expect(html).not.toContain("Contoso GmbH");

    for (let i = 0; i < PUBLIC_LIMITS.pdf.max; i++) {
      expect((await pdfResponse(UNKNOWN)).status).toBe(404);
    }
    const limited = await pdfResponse(created.token);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Cache-Control")).toBe("private, no-store");
    // Another client is not affected.
    requestHeaders = new Headers({ "x-real-ip": "198.51.100.1" });
    expect((await pdfResponse(created.token)).status).toBe(200);
  });

  it("refuses links of the demo workspace", async () => {
    const demo = await seedTenant(currentDb, 3, { name: "Demo", isDemo: true });
    const created = await createShareLink({
      tenantId: demo.id,
      label: "Demo",
      mode: "live",
      ttlDays: 30,
      createdByKey: "oid",
    });
    if (!created.ok) throw new Error("not created");
    await expect(renderPage(created.token)).rejects.toThrow("NEXT_NOT_FOUND");
    expect((await pdfResponse(created.token)).status).toBe(404);
  });
});

describe("after the plan is cancelled", () => {
  it("keeps a snapshot link working and blocks a live link", async () => {
    const live = await newLink("live");
    const snapshot = await newLink("snapshot");
    await cancelPlan();

    // Live data needs the plan at view time: same 404 as an unknown link.
    await expect(renderPage(live.token)).rejects.toThrow("NEXT_NOT_FOUND");
    expect((await pdfResponse(live.token)).status).toBe(404);

    const html = await renderPage(snapshot.token);
    expect(html).toContain("Contoso GmbH");
    expect(html).toContain("Snapshot from");
    expectNoPii(html);
    const pdf = await pdfResponse(snapshot.token);
    expect(pdf.status).toBe(200);
    expect(pdfText(Buffer.from(await pdf.arrayBuffer()))).toContain(
      "Contoso GmbH",
    );

    // Revoking still works on Free, and then the snapshot is gone too.
    expect(await revokeShareLink(tenant.id, snapshot.link.id)).not.toBeNull();
    await expect(renderPage(snapshot.token)).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("serves the snapshot as it was, while a live link follows the data", async () => {
    const live = await newLink("live");
    const snapshot = await newLink("snapshot");
    await currentDb
      .update(schema.findings)
      .set({ status: "resolved", resolvedAt: new Date() })
      .where(eq(schema.findings.tenantId, tenant.id));
    const frozen = await loadPublicReport(
      snapshot.token,
      requestHeaders,
      "view",
    );
    const current = await loadPublicReport(live.token, requestHeaders, "view");
    if (frozen.kind !== "ok" || current.kind !== "ok")
      throw new Error("refused");
    expect(frozen.report.summary.waste.openFindings).toBe(2);
    expect(current.report.summary.waste.openFindings).toBe(0);
  });
});
