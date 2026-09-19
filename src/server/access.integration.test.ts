import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Session } from "~/server/auth";
import * as schema from "~/server/db/schema";

/**
 * Sign-in resolution and the claim-by-email flow against a real Drizzle/PGlite
 * database (fresh per test, schema generated from the Drizzle definitions).
 * Only the request surface is stubbed: the session, cookies, after() and the
 * mail transport. The rate limiter, the entitlement lookup and every query run
 * for real.
 *
 * The cases are written from the attacker's side first: what a token from
 * another tenant, a forwarded mail or a stale cookie can NOT do.
 */

let currentDb: ReturnType<typeof makeDb>;
let session: Session | null = null;
let workspaceCookie: string | undefined;
const afterTasks: (() => unknown)[] = [];

type SentMail = { to: string[]; subject: string; html: string };
const sent: SentMail[] = [];
let mailEnabled = true;
const joinRequestNotice = vi.fn(() => Promise.resolve());
const domainJoinedNotice = vi.fn(() => Promise.resolve());

vi.mock("~/env", () => ({
  env: { NODE_ENV: "test", AUTH_SECRET: "test-secret-test-secret" },
  billingEnabled: () => true,
  isDemoMode: () => false,
  siteUrl: () => "https://app.example",
  signInPath: () => "/sign-in",
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

vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      get: () => (workspaceCookie ? { value: workspaceCookie } : undefined),
    }),
  headers: () => Promise.resolve(new Headers({ "x-real-ip": "203.0.113.7" })),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));
vi.mock("next/server", () => ({
  after: (task: () => unknown) => {
    afterTasks.push(task);
  },
}));
vi.mock("~/server/auth", () => ({ auth: () => Promise.resolve(session) }));
vi.mock("~/server/demo/seed", () => ({
  ensureDemoWorkspace: () => Promise.resolve(),
}));
vi.mock("~/server/workspaceEmail", () => ({
  sendJoinRequestNotice: joinRequestNotice,
  sendDomainJoinedNotice: domainJoinedNotice,
}));
vi.mock("~/server/email", () => ({
  emailEnabled: () => mailEnabled,
  sendEmail: (mail: SentMail) => {
    sent.push(mail);
    return Promise.resolve(true);
  },
  membershipClaimHtml: (args: { claimUrl: string }) => args.claimUrl,
}));

const { apiAccess, pendingClaimFor } = await import("./access");
const { requestClaim, redeemClaim } = await import("./membershipClaims");

// --- DB harness --------------------------------------------------------------

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

beforeEach(async () => {
  const client = new PGlite();
  for (const stmt of await schemaDdl()) await client.exec(stmt);
  currentDb = makeDb(client);
  session = null;
  workspaceCookie = undefined;
  afterTasks.length = 0;
  sent.length = 0;
  mailEnabled = true;
  joinRequestNotice.mockClear();
  domainJoinedNotice.mockClear();
});

// --- fixtures ----------------------------------------------------------------

const VICTIM_EMAIL = "vera@victim.example";
const VICTIM_LEGACY_ID = "user_vera";
const VICTIM_OID = "00000000-0000-4000-8000-00000000000a";
const VICTIM_TID = "aaaaaaaa-0000-4000-8000-000000000001";
const ATTACKER_OID = "00000000-0000-4000-8000-00000000000e";
const ATTACKER_TID = "eeeeeeee-0000-4000-8000-000000000002";

const tenantId = (n: number) =>
  `11111111-1111-1111-1111-${String(n).padStart(12, "0")}`;

const sessionOf = (
  user: Partial<Session["user"]> & { oid: string; tid: string },
): Session => ({
  user: {
    upn: user.email ?? "",
    name: "",
    email: null,
    isDemo: false,
    emailProven: false,
    ...user,
  },
});

/** Vera signing in with her own Microsoft account. */
const victimSession = (emailProven: boolean): Session =>
  sessionOf({
    oid: VICTIM_OID,
    tid: VICTIM_TID,
    upn: VICTIM_EMAIL,
    email: VICTIM_EMAIL,
    name: "Vera Victim",
    emailProven,
  });

/**
 * THE ATTACK: an admin of another tenant sets a user's mail attribute to the
 * victim's address and signs in. The token is genuine, the email claim says
 * vera@victim.example, and xms_edov is absent (or false): unproven.
 */
const attackerSession = (extra: Partial<Session["user"]> = {}): Session =>
  sessionOf({
    oid: ATTACKER_OID,
    tid: ATTACKER_TID,
    upn: "mallory@attacker.example",
    email: VICTIM_EMAIL,
    name: "Mallory",
    ...extra,
  });

/** Two workspaces Vera got before sign-in moved to Entra, one of them paid. */
async function seedLegacyVictim(
  overrides: Partial<typeof schema.memberships.$inferInsert> = {},
) {
  const created = [
    new Date("2026-01-01T00:00:00Z"),
    new Date("2026-02-01T00:00:00Z"),
  ];
  for (const n of [1, 2]) {
    await currentDb.insert(schema.tenants).values({
      id: tenantId(n),
      name: `Victim ${n}`,
      createdAt: created[n - 1],
    });
  }
  await currentDb.insert(schema.memberships).values([
    {
      tenantId: tenantId(1),
      email: "Vera@Victim.example",
      role: "owner",
      workosUserId: VICTIM_LEGACY_ID,
      createdAt: created[0],
      ...overrides,
    },
    {
      tenantId: tenantId(2),
      email: VICTIM_EMAIL,
      role: "admin",
      workosUserId: VICTIM_LEGACY_ID,
      createdAt: created[1],
      ...overrides,
    },
  ]);
  await currentDb.insert(schema.entitlements).values({
    tenantId: tenantId(1),
    plan: "pro",
    source: "polar",
    status: "active",
    currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
  });
  await currentDb.insert(schema.dpaAcceptances).values({
    tenantId: tenantId(1),
    version: "1.2",
    language: "en",
    acceptedByKey: VICTIM_LEGACY_ID,
    acceptedByEmail: VICTIM_EMAIL,
  });
  await currentDb.insert(schema.apiTokens).values({
    tenantId: tenantId(1),
    name: "MCP",
    tokenHash: "hash-1",
    tokenPrefix: "lm_abc",
    createdByKey: VICTIM_LEGACY_ID,
  });
}

const victimRows = () =>
  currentDb
    .select()
    .from(schema.memberships)
    .where(eq(schema.memberships.workosUserId, VICTIM_LEGACY_ID));

const tokenFromMail = (mail: SentMail): string =>
  new URL(mail.html).searchParams.get("token")!;

// --- linking by proven email ---------------------------------------------------

describe("a legacy member whose email is proven", () => {
  it("is linked on sign-in and keeps workspaces, roles, plan, DPA record and API tokens", async () => {
    await seedLegacyVictim();
    session = victimSession(true);

    const ctx = await apiAccess();

    expect(ctx).not.toBeNull();
    expect(ctx!.user.oid).toBe(VICTIM_OID);
    // Oldest workspace is active; both are listed with their roles.
    expect(ctx!.tenant.id).toBe(tenantId(1));
    expect(ctx!.membership.role).toBe("owner");
    expect(ctx!.workspaces.map((w) => [w.id, w.role])).toEqual([
      [tenantId(1), "owner"],
      [tenantId(2), "admin"],
    ]);
    expect(ctx!.entitlement.plan).toBe("pro");

    const rows = await victimRows();
    expect(rows.map((r) => r.oid)).toEqual([VICTIM_OID, VICTIM_OID]);
    // Nothing was provisioned and nothing tenant-scoped moved.
    expect(await currentDb.select().from(schema.tenants)).toHaveLength(2);
    expect(await currentDb.select().from(schema.dpaAcceptances)).toHaveLength(
      1,
    );
    expect(await currentDb.select().from(schema.apiTokens)).toHaveLength(1);
    const audit = await currentDb.select().from(schema.auditLog);
    expect(audit.map((a) => a.action)).toEqual([
      "member_identity_linked",
      "member_identity_linked",
    ]);
    expect(audit[0]!.detail).toEqual({ via: "proven_email" });
    expect(await pendingClaimFor(session)).toBe(false);

    // The second request is a plain object id match.
    const again = await apiAccess();
    expect(again!.workspaces).toHaveLength(2);
    expect(await currentDb.select().from(schema.auditLog)).toHaveLength(2);
  });

  it("links nothing when the membership already belongs to a different object id", async () => {
    await seedLegacyVictim({ oid: "00000000-0000-4000-8000-0000000000ff" });
    session = victimSession(true);

    const ctx = await apiAccess();

    const rows = await victimRows();
    expect(rows.map((r) => r.oid)).toEqual([
      "00000000-0000-4000-8000-0000000000ff",
      "00000000-0000-4000-8000-0000000000ff",
    ]);
    expect(ctx!.workspaces.map((w) => w.id)).not.toContain(tenantId(1));
    expect(ctx!.workspaces.map((w) => w.id)).not.toContain(tenantId(2));
    expect(await pendingClaimFor(session)).toBe(false);
  });
});

// --- THE ATTACK ----------------------------------------------------------------

describe("a token from another tenant carrying the victim's email", () => {
  for (const [label, user] of [
    ["xms_edov absent", {}],
    ["xms_edov false", { emailProven: false }],
    ["a cookie from before emailProven existed", { emailProven: undefined }],
    ["a non-boolean emailProven", { emailProven: "true" }],
  ] as const) {
    it(`links nothing: ${label}`, async () => {
      await seedLegacyVictim();
      session = attackerSession(user as Partial<Session["user"]>);

      const ctx = await apiAccess();

      // The attacker lands in a workspace of their own and sees nothing else.
      expect(ctx).not.toBeNull();
      expect(ctx!.workspaces).toHaveLength(1);
      expect([tenantId(1), tenantId(2)]).not.toContain(ctx!.tenant.id);
      expect(ctx!.membership.email).toBe("mallory@attacker.example");
      expect((await victimRows()).map((r) => r.oid)).toEqual([null, null]);
      const audit = await currentDb.select().from(schema.auditLog);
      expect(audit.map((a) => a.action)).not.toContain(
        "member_identity_linked",
      );
      // The UI may offer the claim mail; it answers with a boolean only.
      expect(await pendingClaimFor(session)).toBe(true);
    });
  }

  it("cannot use the invite rules on a fresh legacy row, not even with a matching UPN", async () => {
    // Created today, so an invite by UPN would still be inside its TTL.
    await seedLegacyVictim({ createdAt: new Date() });
    session = attackerSession({ upn: VICTIM_EMAIL });

    const ctx = await apiAccess();

    expect(ctx!.workspaces).toHaveLength(1);
    expect((await victimRows()).map((r) => r.oid)).toEqual([null, null]);
  });

  it("cannot pick up the victim's workspace cookie", async () => {
    await seedLegacyVictim();
    session = attackerSession();
    workspaceCookie = tenantId(1);

    const ctx = await apiAccess();
    expect(ctx!.tenant.id).not.toBe(tenantId(1));
  });

  it("gets the claim mail delivered to the victim's mailbox, and the victim's click does nothing", async () => {
    await seedLegacyVictim();
    session = attackerSession();
    await requestClaim(session);

    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toEqual([VICTIM_EMAIL]);

    // Vera opens the link in her own session: different object id and tenant.
    const token = tokenFromMail(sent[0]!);
    expect(await redeemClaim(victimSession(false), token)).toBe(false);
    expect((await victimRows()).map((r) => r.oid)).toEqual([null, null]);
  });
});

// --- claim by email ------------------------------------------------------------

describe("claim by email", () => {
  it("links every legacy membership of the address for the session that asked", async () => {
    await seedLegacyVictim();
    session = victimSession(false);
    expect(await pendingClaimFor(session)).toBe(true);

    await requestClaim(session);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toEqual([VICTIM_EMAIL]);
    const token = tokenFromMail(sent[0]!);

    // Only the SHA-256 is stored.
    const [stored] = await currentDb.select().from(schema.membershipClaims);
    expect(stored!.tokenHash).not.toBe(token);
    expect(stored!.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored!.email).toBe(VICTIM_EMAIL);
    expect(stored!.expiresAt.getTime() - stored!.createdAt.getTime()).toBe(
      30 * 60 * 1000,
    );

    expect(await redeemClaim(session, token)).toBe(true);
    expect((await victimRows()).map((r) => r.oid)).toEqual([
      VICTIM_OID,
      VICTIM_OID,
    ]);
    const audit = await currentDb.select().from(schema.auditLog);
    expect(audit.map((a) => a.detail)).toEqual([
      { via: "email_claim" },
      { via: "email_claim" },
    ]);
    expect(await pendingClaimFor(session)).toBe(false);

    const ctx = await apiAccess();
    expect(ctx!.workspaces.map((w) => w.id)).toContain(tenantId(1));
    expect(ctx!.workspaces.map((w) => w.id)).toContain(tenantId(2));
  });

  it("is single use", async () => {
    await seedLegacyVictim();
    session = victimSession(false);
    await requestClaim(session);
    const token = tokenFromMail(sent[0]!);

    expect(await redeemClaim(session, token)).toBe(true);
    expect(await redeemClaim(session, token)).toBe(false);
  });

  it("lets only one of two concurrent clicks win", async () => {
    await seedLegacyVictim();
    session = victimSession(false);
    await requestClaim(session);
    const token = tokenFromMail(sent[0]!);

    const results = await Promise.all([
      redeemClaim(session, token),
      redeemClaim(session, token),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("expires after 30 minutes", async () => {
    await seedLegacyVictim();
    session = victimSession(false);
    await requestClaim(session);
    const token = tokenFromMail(sent[0]!);
    await currentDb
      .update(schema.membershipClaims)
      .set({ expiresAt: new Date(Date.now() - 1000) });

    expect(await redeemClaim(session, token)).toBe(false);
    expect((await victimRows()).map((r) => r.oid)).toEqual([null, null]);
  });

  it("cannot be redeemed by a different object id or a different tenant", async () => {
    await seedLegacyVictim();
    session = victimSession(false);
    await requestClaim(session);
    const token = tokenFromMail(sent[0]!);

    expect(await redeemClaim(attackerSession(), token)).toBe(false);
    expect(
      await redeemClaim(
        sessionOf({ oid: VICTIM_OID, tid: ATTACKER_TID, email: VICTIM_EMAIL }),
        token,
      ),
    ).toBe(false);
    expect(
      await redeemClaim(
        sessionOf({ oid: ATTACKER_OID, tid: VICTIM_TID, email: VICTIM_EMAIL }),
        token,
      ),
    ).toBe(false);
    expect(await redeemClaim(null, token)).toBe(false);
    expect((await victimRows()).map((r) => r.oid)).toEqual([null, null]);
    // A refused attempt does not burn the token for its owner.
    expect(await redeemClaim(session, token)).toBe(true);
  });

  it("refuses guessed and malformed tokens", async () => {
    await seedLegacyVictim();
    session = victimSession(false);
    await requestClaim(session);
    const [stored] = await currentDb.select().from(schema.membershipClaims);

    for (const guess of [
      "",
      "x",
      stored!.tokenHash,
      "A".repeat(43),
      `${tokenFromMail(sent[0]!)}x`,
      "' or 1=1 --",
    ]) {
      expect(await redeemClaim(session, guess)).toBe(false);
    }
  });

  it("answers the same way and sends nothing when there is nothing to claim", async () => {
    session = victimSession(false);
    expect(await pendingClaimFor(session)).toBe(false);
    expect(await requestClaim(session)).toBeUndefined();
    expect(sent).toHaveLength(0);
    expect(await currentDb.select().from(schema.membershipClaims)).toHaveLength(
      0,
    );

    await seedLegacyVictim();
    expect(await requestClaim(session)).toBeUndefined();
    expect(sent).toHaveLength(1);
  });

  it("never mails an unclaimed invite or a membership that is already linked", async () => {
    await currentDb.insert(schema.tenants).values({ id: tenantId(1) });
    await currentDb.insert(schema.memberships).values({
      tenantId: tenantId(1),
      email: VICTIM_EMAIL,
      role: "admin",
    });
    await currentDb.insert(schema.tenants).values({ id: tenantId(2) });
    await currentDb.insert(schema.memberships).values({
      tenantId: tenantId(2),
      email: VICTIM_EMAIL,
      role: "admin",
      oid: VICTIM_OID,
      workosUserId: VICTIM_LEGACY_ID,
    });
    session = attackerSession();

    expect(await pendingClaimFor(session)).toBe(false);
    await requestClaim(session);
    expect(sent).toHaveLength(0);
  });

  it("is rate limited per person, per address and tenant, and per address overall", async () => {
    await seedLegacyVictim();
    session = victimSession(false);
    for (let i = 0; i < 6; i++) await requestClaim(session);
    expect(sent).toHaveLength(3);
  });

  it("does not let the identities of one foreign tenant use up the owner's budget", async () => {
    await seedLegacyVictim();
    // Mallory's tenant mints identity after identity with Vera's address.
    for (let i = 0; i < 8; i++) {
      await requestClaim(
        attackerSession({ oid: `00000000-0000-4000-8000-0000000000${10 + i}` }),
      );
    }
    expect(sent).toHaveLength(3);

    // Vera, from her own tenant, still gets her mail.
    await requestClaim(victimSession(false));
    expect(sent).toHaveLength(4);
    expect(sent[3]!.to).toEqual([VICTIM_EMAIL]);
  });

  it("caps the mail one address can be sent, whoever asks", async () => {
    await seedLegacyVictim();
    for (let t = 0; t < 6; t++) {
      for (let i = 0; i < 3; i++) {
        await requestClaim(
          attackerSession({
            oid: `00000000-0000-4000-8000-00000000${t}${i}00`,
            tid: `eeeeeeee-0000-4000-8000-00000000000${t}`,
          }),
        );
      }
    }
    expect(sent).toHaveLength(12);
  });

  it("does nothing for the demo session, a signed-out caller or without mail configured", async () => {
    await seedLegacyVictim();
    await requestClaim(null);
    await requestClaim({
      user: { ...victimSession(false).user, isDemo: true },
    });
    mailEnabled = false;
    await requestClaim(victimSession(false));

    expect(sent).toHaveLength(0);
    expect(await currentDb.select().from(schema.membershipClaims)).toHaveLength(
      0,
    );
    expect(
      await pendingClaimFor({
        user: { ...victimSession(false).user, isDemo: true },
      }),
    ).toBe(false);
    expect(await pendingClaimFor(null)).toBe(false);
  });
});

// --- invites keep their rules ----------------------------------------------------

describe("invites", () => {
  const invite = async (
    email: string,
    overrides: Partial<typeof schema.memberships.$inferInsert> = {},
    tenant: Partial<typeof schema.tenants.$inferInsert> = {},
  ) => {
    await currentDb
      .insert(schema.tenants)
      .values({ id: tenantId(1), name: "Inviter", ...tenant });
    await currentDb.insert(schema.memberships).values({
      tenantId: tenantId(1),
      email,
      role: "admin",
      ...overrides,
    });
  };

  it("are claimed from any tenant by a proven email while fresh", async () => {
    await invite("Consultant@msp.example");
    session = sessionOf({
      oid: VICTIM_OID,
      tid: VICTIM_TID,
      upn: "consultant@msp.example",
      email: "consultant@msp.example",
      emailProven: true,
    });

    const ctx = await apiAccess();

    expect(ctx!.tenant.id).toBe(tenantId(1));
    expect(ctx!.membership).toMatchObject({ oid: VICTIM_OID, role: "admin" });
  });

  it("are not claimed from another tenant by a UPN or an unproven email", async () => {
    await invite("consultant@msp.example");
    session = attackerSession({
      upn: "consultant@msp.example",
      email: "consultant@msp.example",
    });

    const ctx = await apiAccess();

    expect(ctx!.tenant.id).not.toBe(tenantId(1));
    const [row] = await currentDb
      .select()
      .from(schema.memberships)
      .where(eq(schema.memberships.tenantId, tenantId(1)));
    expect(row!.oid).toBeNull();
  });

  it("stop matching after the TTL", async () => {
    await invite("consultant@msp.example", {
      createdAt: new Date(Date.now() - 15 * 86_400_000),
    });
    session = sessionOf({
      oid: VICTIM_OID,
      tid: VICTIM_TID,
      upn: "consultant@msp.example",
      email: "consultant@msp.example",
      emailProven: true,
    });

    const ctx = await apiAccess();
    expect(ctx!.tenant.id).not.toBe(tenantId(1));
  });

  it("match the email claim only when signing in from the workspace's own tenant", async () => {
    await invite(VICTIM_EMAIL, {}, { tid: VICTIM_TID, domainJoinMode: "off" });

    session = attackerSession();
    expect((await apiAccess())!.tenant.id).not.toBe(tenantId(1));

    session = sessionOf({
      oid: VICTIM_OID,
      tid: VICTIM_TID,
      upn: "vera@victim.onmicrosoft.com",
      email: VICTIM_EMAIL,
    });
    expect((await apiAccess())!.tenant.id).toBe(tenantId(1));
  });
});

// --- provisioning ------------------------------------------------------------------

describe("first sign-in", () => {
  it("creates exactly one workspace across concurrent first requests", async () => {
    session = victimSession(true);

    const contexts = await Promise.all(
      Array.from({ length: 5 }, () => apiAccess()),
    );

    expect(await currentDb.select().from(schema.tenants)).toHaveLength(1);
    expect(new Set(contexts.map((c) => c!.tenant.id)).size).toBe(1);
    expect(contexts[0]!.membership).toMatchObject({
      oid: VICTIM_OID,
      role: "owner",
      email: VICTIM_EMAIL,
    });
    // A proven corporate address claims its domain for colleagues to find.
    expect(contexts[0]!.tenant.domain).toBe("victim.example");
  });

  it("stores an unproven person under their UPN and claims no domain", async () => {
    session = attackerSession();
    const ctx = await apiAccess();
    expect(ctx!.membership.email).toBe("mallory@attacker.example");
    expect(ctx!.tenant.domain).toBeNull();
  });

  it("welcomes the person who got their own workspace, exactly once", async () => {
    session = victimSession(true);

    await Promise.all(Array.from({ length: 5 }, () => apiAccess()));
    await apiAccess();
    for (const task of afterTasks) await task();

    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toEqual([VICTIM_EMAIL]);
    expect(sent[0]!.subject).toContain("Welcome to LicenseMeter");
    expect(sent[0]!.html).toContain("Hi Vera, the three steps");
  });

  it("sends no onboarding mail to an unproven address", async () => {
    session = attackerSession();

    const ctx = await apiAccess();
    for (const task of afterTasks) await task();

    expect(ctx!.membership.role).toBe("owner");
    expect(sent).toHaveLength(0);
  });

  it("sends no onboarding mail to a colleague who joined an existing workspace", async () => {
    await currentDb.insert(schema.tenants).values({
      id: tenantId(1),
      name: "Victim",
      domain: "victim.example",
      domainJoinMode: "auto",
    });
    session = victimSession(true);

    await apiAccess();
    for (const task of afterTasks) await task();

    expect(sent).toHaveLength(0);
  });

  it("notifies admins once about a request from their own Microsoft tenant", async () => {
    await currentDb
      .insert(schema.tenants)
      .values({ id: tenantId(1), name: "Victim", tid: VICTIM_TID });
    session = victimSession(false);

    const ctx = await apiAccess();
    await apiAccess();

    expect(ctx!.tenant.id).not.toBe(tenantId(1));
    expect(afterTasks).toHaveLength(1);
    await afterTasks[0]!();
    expect(joinRequestNotice).toHaveBeenCalledTimes(1);
    expect(domainJoinedNotice).not.toHaveBeenCalled();
    const requests = await currentDb.select().from(schema.joinRequests);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ oid: VICTIM_OID, tid: VICTIM_TID });
  });

  it("joins the workspace of the proven domain in auto mode and tells its admins", async () => {
    await currentDb.insert(schema.tenants).values({
      id: tenantId(1),
      name: "Victim",
      domain: "victim.example",
      domainJoinMode: "auto",
    });
    session = victimSession(true);

    const ctx = await apiAccess();

    expect(ctx!.tenant.id).toBe(tenantId(1));
    expect(ctx!.membership.role).toBe("viewer");
    await afterTasks[0]!();
    expect(domainJoinedNotice).toHaveBeenCalledTimes(1);
  });

  it("keeps the active workspace stable without a cookie and honours a valid one", async () => {
    for (const [n, day] of [
      [3, "2026-03-01"],
      [1, "2026-01-01"],
      [2, "2026-02-01"],
    ] as const) {
      await currentDb.insert(schema.tenants).values({
        id: tenantId(n),
        createdAt: new Date(`${day}T00:00:00Z`),
      });
      await currentDb.insert(schema.memberships).values({
        tenantId: tenantId(n),
        oid: VICTIM_OID,
        email: VICTIM_EMAIL,
      });
    }
    session = victimSession(false);

    for (let i = 0; i < 3; i++) {
      const ctx = await apiAccess();
      expect(ctx!.tenant.id).toBe(tenantId(1));
      expect(ctx!.workspaces.map((w) => w.id)).toEqual([
        tenantId(1),
        tenantId(2),
        tenantId(3),
      ]);
    }
    workspaceCookie = tenantId(3);
    expect((await apiAccess())!.tenant.id).toBe(tenantId(3));
  });

  it("resolves nothing without an Entra identity", async () => {
    session = null;
    expect(await apiAccess()).toBeNull();
    session = sessionOf({ oid: "", tid: "", email: VICTIM_EMAIL });
    expect(await apiAccess()).toBeNull();
    expect(await currentDb.select().from(schema.tenants)).toHaveLength(0);
  });
});
