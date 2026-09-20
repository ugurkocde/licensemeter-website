import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "~/server/db/schema";
import {
  makeMembershipUnsubToken,
  makeSharedUnsubToken,
  makeUnsubToken,
} from "~/server/unsubToken";

const SECRET = "test-secret-test-secret-test-secret";

let currentDb: ReturnType<typeof makeDb>;

vi.mock("~/env", () => ({
  env: { NODE_ENV: "test", AUTH_SECRET: "test-secret-test-secret-test-secret" },
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

const { GET, POST } = await import("./route");

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
const OTHER_ID = "22222222-2222-2222-2222-222222222222";
const MEMBERSHIP_ID = "33333333-3333-4333-8333-333333333333";
const SHARED = "it-licenses@contoso.test";

const request = (query: string, method: "GET" | "POST" = "GET") =>
  new NextRequest(`https://licensemeter.test/api/unsubscribe?${query}`, {
    method,
  });

const memberQuery = (
  job: "digest" | "report",
  token = makeMembershipUnsubToken(MEMBERSHIP_ID, job, SECRET),
  membershipId = MEMBERSHIP_ID,
) => `m=${membershipId}&j=${job}&t=${token}`;

const sharedQuery = (
  job: "digest" | "report",
  tenantId = TENANT_ID,
  token = makeSharedUnsubToken(tenantId, job, SECRET),
) => `w=${tenantId}&j=${job}&t=${token}`;

const sharedAddress = async (tenantId = TENANT_ID) =>
  currentDb.query.notificationAddresses.findFirst({
    where: eq(schema.notificationAddresses.tenantId, tenantId),
  });

const membership = async () =>
  currentDb.query.memberships.findFirst({
    where: eq(schema.memberships.id, MEMBERSHIP_ID),
  });

beforeEach(async () => {
  const client = new PGlite();
  for (const stmt of await schemaDdl()) await client.exec(stmt);
  currentDb = makeDb(client);
  await currentDb
    .insert(schema.tenants)
    .values({ id: TENANT_ID, name: "Acme" });
  await currentDb.insert(schema.memberships).values({
    id: MEMBERSHIP_ID,
    tenantId: TENANT_ID,
    email: "anna@contoso.test",
    oid: "oid-anna",
    role: "admin",
  });
  await currentDb.insert(schema.tenants).values({ id: OTHER_ID, name: "Beta" });
  await currentDb.insert(schema.notificationAddresses).values([
    { tenantId: TENANT_ID, email: SHARED, verifiedAt: new Date() },
    { tenantId: OTHER_ID, email: SHARED, verifiedAt: new Date() },
  ]);
});

describe("membership unsubscribe links", () => {
  it("GET names the workspace and the email type without changing anything", async () => {
    const res = await GET(request(memberQuery("digest")));
    const html = await res.text();
    expect(html).toContain("Unsubscribe from the weekly digest");
    expect(html).toContain("Acme");
    expect(html).toContain('<form method="post"');
    expect((await membership())?.digestOptOut).toBe(false);
  });

  it("POST sets only the opt-out of the signed job, without a session", async () => {
    const res = await POST(request(memberQuery("report"), "POST"));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("You are unsubscribed");
    const row = await membership();
    expect(row?.reportOptOut).toBe(true);
    expect(row?.digestOptOut).toBe(false);
  });

  it("is idempotent", async () => {
    await POST(request(memberQuery("digest"), "POST"));
    const again = await POST(request(memberQuery("digest"), "POST"));
    expect(await again.text()).toContain("You are unsubscribed");
    expect((await membership())?.digestOptOut).toBe(true);
  });

  it("rejects a token signed for the other job", async () => {
    const digestToken = makeMembershipUnsubToken(
      MEMBERSHIP_ID,
      "digest",
      SECRET,
    );
    const res = await POST(request(memberQuery("report", digestToken), "POST"));
    expect(await res.text()).toContain("This link is not valid");
    expect((await membership())?.reportOptOut).toBe(false);
  });

  it("answers every invalid link the same way, existing membership or not", async () => {
    const unknown = "99999999-9999-4999-8999-999999999999";
    const bodies = await Promise.all(
      [
        memberQuery("digest", "forged"),
        memberQuery("digest", "forged", unknown),
        `m=not-a-uuid&j=digest&t=x`,
        `m=${MEMBERSHIP_ID}&j=welcome&t=x`,
      ].map(async (q) => (await POST(request(q, "POST"))).text()),
    );
    expect(new Set(bodies).size).toBe(1);
    expect(bodies[0]).toContain("This link is not valid");
    expect((await membership())?.digestOptOut).toBe(false);
  });

  it("does not reveal that a membership is gone behind a valid token", async () => {
    await currentDb
      .delete(schema.memberships)
      .where(eq(schema.memberships.id, MEMBERSHIP_ID));
    const res = await POST(request(memberQuery("digest"), "POST"));
    const html = await res.text();
    expect(html).toContain("You are unsubscribed");
    expect(html).toContain("this workspace");
  });
});

describe("legacy email unsubscribe links", () => {
  it("still unsubscribes a signup by address", async () => {
    await currentDb
      .insert(schema.emailSignups)
      .values({ email: "Lead@Example.com" });
    const e = Buffer.from("lead@example.com").toString("base64url");
    const t = makeUnsubToken("lead@example.com", SECRET);
    const res = await POST(request(`e=${e}&t=${t}`, "POST"));
    expect(await res.text()).toContain("You are unsubscribed");
    const row = await currentDb.query.emailSignups.findFirst();
    expect(row?.unsubscribedAt).toBeInstanceOf(Date);
  });
});

describe("shared address unsubscribe links", () => {
  it("GET names the workspace and the email type without changing anything", async () => {
    const res = await GET(request(sharedQuery("digest")));
    const html = await res.text();
    expect(html).toContain("Unsubscribe from the weekly digest");
    expect(html).toContain("Acme");
    expect(html).toContain('<form method="post"');
    expect(await sharedAddress()).toMatchObject({ digest: true });
  });

  it("POST turns off exactly one job, for one workspace", async () => {
    const res = await POST(request(sharedQuery("report"), "POST"));
    expect(await res.text()).toContain("You are unsubscribed");
    expect(await sharedAddress()).toMatchObject({
      report: false,
      digest: true,
      leakAlerts: true,
    });
    // The same address in another workspace keeps its mail.
    expect(await sharedAddress(OTHER_ID)).toMatchObject({ report: true });
    // Nobody's membership is touched by a shared link.
    expect(await membership()).toMatchObject({
      digestOptOut: false,
      reportOptOut: false,
    });
  });

  it("rejects a membership token used as a shared token", async () => {
    const memberToken = makeMembershipUnsubToken(
      MEMBERSHIP_ID,
      "digest",
      SECRET,
    );
    const res = await POST(
      request(sharedQuery("digest", TENANT_ID, memberToken), "POST"),
    );
    expect(await res.text()).toContain("This link is not valid");
    expect(await sharedAddress()).toMatchObject({ digest: true });
  });

  it("does not reveal that the address is gone behind a valid token", async () => {
    await currentDb
      .delete(schema.notificationAddresses)
      .where(eq(schema.notificationAddresses.tenantId, TENANT_ID));
    const res = await POST(request(sharedQuery("digest"), "POST"));
    expect(await res.text()).toContain("You are unsubscribed");
  });
});
