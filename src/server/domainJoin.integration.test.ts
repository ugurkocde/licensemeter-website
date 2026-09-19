import { PGlite } from "@electric-sql/pglite";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "~/server/db";
import * as schema from "~/server/db/schema";
import {
  approveJoinRequestRow,
  declineJoinRequestRow,
  holdsJoinableDomain,
  pendingJoinRequests,
  pendingJoinRequestsOf,
  provisionForSignIn,
  type SignInIdentity,
} from "~/server/domainJoin";
import type { DomainJoinMode } from "~/server/types";

/**
 * Domain join against a real Drizzle/PGlite database (fresh per test, schema
 * generated from the Drizzle definitions), so the unique index, the CHECK
 * constraints and the transactions run with genuine Postgres semantics.
 */

let cachedDdl: string[] | null = null;
const schemaDdl = async (): Promise<string[]> => {
  cachedDdl ??= await generateMigration(
    generateDrizzleJson({}),
    generateDrizzleJson(schema),
  );
  return cachedDdl;
};

let db: Db;

beforeEach(async () => {
  const client = new PGlite();
  for (const stmt of await schemaDdl()) await client.exec(stmt);
  db = drizzle(client, { schema }) as unknown as Db;
});

const ACME_TID = "aaaaaaaa-0000-4000-8000-000000000001";
const OTHER_TID = "bbbbbbbb-0000-4000-8000-000000000002";
const OWNER_OID = "00000000-0000-4000-8000-0000000000a1";
const CASEY_OID = "00000000-0000-4000-8000-0000000000c1";
const MALLORY_OID = "00000000-0000-4000-8000-0000000000e1";

const OWNER: SignInIdentity = {
  oid: OWNER_OID,
  tid: ACME_TID,
  email: "owner@acme.com",
  emailVerified: true,
  name: "Olivia Owner",
};
const COLLEAGUE: SignInIdentity = {
  oid: CASEY_OID,
  tid: ACME_TID,
  email: "casey@acme.com",
  emailVerified: true,
  name: "Casey Colleague",
};

/** First person from acme.com: creates the workspace that holds the domain. */
const seedDomainWorkspace = async (mode: DomainJoinMode) => {
  await provisionForSignIn(db, OWNER);
  const [tenant] = await db
    .select()
    .from(schema.tenants)
    .where(eq(schema.tenants.domain, "acme.com"));
  await db
    .update(schema.tenants)
    .set({ domainJoinMode: mode })
    .where(eq(schema.tenants.id, tenant!.id));
  const [owner] = await db
    .select()
    .from(schema.memberships)
    .where(eq(schema.memberships.tenantId, tenant!.id));
  return { tenantId: tenant!.id, ownerMembershipId: owner!.id };
};

const membershipsOf = (oid: string) =>
  db
    .select({
      tenantId: schema.memberships.tenantId,
      role: schema.memberships.role,
    })
    .from(schema.memberships)
    .where(eq(schema.memberships.oid, oid));

const auditActions = async (tenantId: string) =>
  (
    await db
      .select({ action: schema.auditLog.action })
      .from(schema.auditLog)
      .where(eq(schema.auditLog.tenantId, tenantId))
  ).map((r) => r.action);

describe("first sign-in from a domain", () => {
  it("creates the domain's workspace with approval as the default", async () => {
    const result = await provisionForSignIn(db, OWNER);
    expect(result).toEqual({
      provisioned: true,
      createdWorkspace: true,
      outcome: { kind: "none" },
    });
    const [tenant] = await db.select().from(schema.tenants);
    expect(tenant).toMatchObject({
      domain: "acme.com",
      domainJoinMode: "approval",
    });
    expect(await holdsJoinableDomain(db, tenant!)).toBe(true);
  });

  it("gives consumer and unproven addresses a workspace without a domain", async () => {
    await provisionForSignIn(db, { ...OWNER, email: "someone@gmail.com" });
    await provisionForSignIn(db, {
      ...COLLEAGUE,
      email: "casey@acme.com",
      emailVerified: false,
    });
    const tenants = await db.select().from(schema.tenants);
    expect(tenants.map((t) => t.domain)).toEqual([null, null]);
    expect(await holdsJoinableDomain(db, tenants[0]!)).toBe(false);
  });
});

describe("approval mode", () => {
  it("files exactly one pending request across two sign-ins", async () => {
    const { tenantId } = await seedDomainWorkspace("approval");
    const allowRequest = vi.fn(() => Promise.resolve(true));

    const first = await provisionForSignIn(db, COLLEAGUE, { allowRequest });
    const second = await provisionForSignIn(db, COLLEAGUE, { allowRequest });

    expect(first.outcome.kind).toBe("requested");
    // Only the sign-in that created the row reports it, so admins get one mail.
    expect(second.outcome.kind).toBe("none");
    expect(allowRequest).toHaveBeenCalledTimes(1);
    const requests = await pendingJoinRequests(db, tenantId);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      email: "casey@acme.com",
      oid: CASEY_OID,
      tid: ACME_TID,
      workosUserId: null,
      status: "pending",
    });
    expect(await auditActions(tenantId)).toEqual(["member_join_requested"]);
  });

  it("keeps the requester unblocked with a workspace that holds no domain", async () => {
    const { tenantId } = await seedDomainWorkspace("approval");
    const result = await provisionForSignIn(db, COLLEAGUE);

    expect(result.provisioned).toBe(true);
    const own = await membershipsOf(CASEY_OID);
    expect(own).toHaveLength(1);
    expect(own[0]!.role).toBe("owner");
    expect(own[0]!.tenantId).not.toBe(tenantId);
    const [ownTenant] = await db
      .select()
      .from(schema.tenants)
      .where(eq(schema.tenants.id, own[0]!.tenantId));
    expect(ownTenant!.domain).toBeNull();
    expect(await holdsJoinableDomain(db, ownTenant!)).toBe(false);
    expect(await pendingJoinRequestsOf(db, CASEY_OID)).toEqual([
      { id: expect.any(String) as string, tenantName: "acme.com" },
    ]);
  });

  it("files nothing when the rate limit refuses", async () => {
    const { tenantId } = await seedDomainWorkspace("approval");
    const result = await provisionForSignIn(db, COLLEAGUE, {
      allowRequest: () => Promise.resolve(false),
    });
    expect(result).toEqual({
      provisioned: true,
      createdWorkspace: true,
      outcome: { kind: "none" },
    });
    expect(await pendingJoinRequests(db, tenantId)).toHaveLength(0);
  });

  it("does not request again after a decline", async () => {
    const { tenantId, ownerMembershipId } =
      await seedDomainWorkspace("approval");
    const first = await provisionForSignIn(db, COLLEAGUE);
    if (first.outcome.kind !== "requested") throw new Error("expected request");

    const declined = await declineJoinRequestRow(db, {
      tenantId,
      requestId: first.outcome.requestId,
      decidedByMembershipId: ownerMembershipId,
    });
    expect(declined).toMatchObject({ status: "done", changed: true });

    const again = await provisionForSignIn(db, COLLEAGUE);
    expect(again.outcome.kind).toBe("none");
    expect(await pendingJoinRequests(db, tenantId)).toHaveLength(0);
    const all = await db.select().from(schema.joinRequests);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({
      status: "declined",
      decidedByMembershipId: ownerMembershipId,
    });
    expect(await pendingJoinRequestsOf(db, CASEY_OID)).toEqual([]);
  });
});

describe("auto mode", () => {
  it("joins as viewer, audits it and creates no second workspace", async () => {
    const { tenantId } = await seedDomainWorkspace("auto");
    const result = await provisionForSignIn(db, COLLEAGUE);

    expect(result.provisioned).toBe(true);
    expect(result.outcome.kind).toBe("joined");
    expect(await membershipsOf(CASEY_OID)).toEqual([
      { tenantId, role: "viewer" },
    ]);
    expect(await db.select().from(schema.tenants)).toHaveLength(1);
    expect(await auditActions(tenantId)).toEqual(["member_domain_joined"]);
  });

  it("does not let a removed member walk back in", async () => {
    const { tenantId } = await seedDomainWorkspace("auto");
    await provisionForSignIn(db, COLLEAGUE);
    await db
      .delete(schema.memberships)
      .where(
        and(
          eq(schema.memberships.tenantId, tenantId),
          eq(schema.memberships.oid, CASEY_OID),
        ),
      );

    const again = await provisionForSignIn(db, COLLEAGUE);
    expect(again.outcome.kind).toBe("none");
    const own = await membershipsOf(CASEY_OID);
    expect(own).toHaveLength(1);
    expect(own[0]!.tenantId).not.toBe(tenantId);
  });

  it("resets an expired invite to viewer instead of inheriting its role", async () => {
    const { tenantId } = await seedDomainWorkspace("auto");
    await db.insert(schema.memberships).values({
      tenantId,
      email: "Casey@acme.com",
      role: "admin",
      createdAt: new Date("2020-01-01T00:00:00Z"),
    });
    await provisionForSignIn(db, COLLEAGUE);
    expect(await membershipsOf(CASEY_OID)).toEqual([
      { tenantId, role: "viewer" },
    ]);
  });
});

describe("off mode", () => {
  it("neither joins nor requests, and the newcomer cannot take the domain", async () => {
    const { tenantId } = await seedDomainWorkspace("off");
    const result = await provisionForSignIn(db, COLLEAGUE);

    expect(result).toEqual({
      provisioned: true,
      createdWorkspace: true,
      outcome: { kind: "none" },
    });
    expect(await db.select().from(schema.joinRequests)).toHaveLength(0);
    expect(await auditActions(tenantId)).toEqual([]);
    const own = await membershipsOf(CASEY_OID);
    expect(own).toHaveLength(1);
    expect(own[0]!.tenantId).not.toBe(tenantId);
    const holders = await db
      .select()
      .from(schema.tenants)
      .where(eq(schema.tenants.domain, "acme.com"));
    expect(holders.map((t) => t.id)).toEqual([tenantId]);
  });
});

describe("approving a request", () => {
  it("links a viewer membership and is idempotent on a double click", async () => {
    const { tenantId, ownerMembershipId } =
      await seedDomainWorkspace("approval");
    const filed = await provisionForSignIn(db, COLLEAGUE);
    if (filed.outcome.kind !== "requested") throw new Error("expected request");
    const args = {
      tenantId,
      requestId: filed.outcome.requestId,
      decidedByMembershipId: ownerMembershipId,
    };

    const [first, second] = await Promise.all([
      approveJoinRequestRow(db, args),
      approveJoinRequestRow(db, args),
    ]);
    const third = await approveJoinRequestRow(db, args);

    expect(
      [first, second].filter((r) => "changed" in r && r.changed),
    ).toHaveLength(1);
    expect(third).toMatchObject({ status: "done", changed: false });
    const inWorkspace = (await membershipsOf(CASEY_OID)).filter(
      (m) => m.tenantId === tenantId,
    );
    expect(inWorkspace).toEqual([{ tenantId, role: "viewer" }]);
    expect(await pendingJoinRequests(db, tenantId)).toHaveLength(0);
    // A decided request cannot flip.
    expect(await declineJoinRequestRow(db, args)).toEqual({
      status: "conflict",
      current: "approved",
    });
  });

  it("refuses a request that belongs to another workspace", async () => {
    const { tenantId } = await seedDomainWorkspace("approval");
    const filed = await provisionForSignIn(db, COLLEAGUE);
    if (filed.outcome.kind !== "requested") throw new Error("expected request");

    // An admin of an unrelated workspace guesses the request id.
    await provisionForSignIn(db, {
      oid: MALLORY_OID,
      tid: OTHER_TID,
      email: "mallory@other.example",
      emailVerified: true,
      name: null,
    });
    const [other] = await db
      .select()
      .from(schema.memberships)
      .where(eq(schema.memberships.oid, MALLORY_OID));

    const result = await approveJoinRequestRow(db, {
      tenantId: other!.tenantId,
      requestId: filed.outcome.requestId,
      decidedByMembershipId: other!.id,
    });

    expect(result).toEqual({ status: "not_found" });
    expect(await pendingJoinRequests(db, tenantId)).toHaveLength(1);
    const casey = await membershipsOf(CASEY_OID);
    expect(casey.map((m) => m.tenantId)).not.toContain(tenantId);
    expect(casey.map((m) => m.tenantId)).not.toContain(other!.tenantId);
  });
});

describe("an unproven email", () => {
  it("never reaches the workspace that holds the domain it names", async () => {
    const { tenantId } = await seedDomainWorkspace("auto");
    // Another tenant's admin set a user's mail attribute to an acme.com address.
    const result = await provisionForSignIn(db, {
      oid: MALLORY_OID,
      tid: OTHER_TID,
      email: "casey@acme.com",
      emailVerified: false,
      name: "Mallory",
    });

    expect(result).toEqual({
      provisioned: true,
      createdWorkspace: true,
      outcome: { kind: "none" },
    });
    const own = await membershipsOf(MALLORY_OID);
    expect(own).toHaveLength(1);
    expect(own[0]).toMatchObject({ role: "owner" });
    expect(own[0]!.tenantId).not.toBe(tenantId);
    expect(await db.select().from(schema.joinRequests)).toHaveLength(0);
    expect(await auditActions(tenantId)).toEqual([]);
  });
});

describe("join by Microsoft tenant", () => {
  /** A workspace connected to the acme tenant, holding no email domain. */
  const seedTenantWorkspace = async (mode: DomainJoinMode) => {
    const [tenant] = await db
      .insert(schema.tenants)
      .values({ name: "Acme", tid: ACME_TID, domainJoinMode: mode })
      .returning();
    await db.insert(schema.memberships).values({
      tenantId: tenant!.id,
      oid: OWNER_OID,
      email: OWNER.email,
      role: "owner",
    });
    return tenant!;
  };
  // The token proves the tid; the email does not have to be proven at all.
  const SAME_TENANT: SignInIdentity = { ...COLLEAGUE, emailVerified: false };

  it("joins a colleague from the same tenant in auto mode", async () => {
    const tenant = await seedTenantWorkspace("auto");
    expect(await holdsJoinableDomain(db, tenant)).toBe(true);

    const result = await provisionForSignIn(db, SAME_TENANT);

    expect(result.outcome.kind).toBe("joined");
    expect(await membershipsOf(CASEY_OID)).toEqual([
      { tenantId: tenant.id, role: "viewer" },
    ]);
    expect(await db.select().from(schema.tenants)).toHaveLength(1);
  });

  it("files a request in approval mode and keeps the domain with the organization", async () => {
    const tenant = await seedTenantWorkspace("approval");
    const result = await provisionForSignIn(db, COLLEAGUE);

    expect(result.outcome).toMatchObject({ kind: "requested" });
    const own = await membershipsOf(CASEY_OID);
    expect(own).toHaveLength(1);
    expect(own[0]!.tenantId).not.toBe(tenant.id);
    // The organization already has a workspace, so the newcomer's own one
    // does not claim acme.com.
    const [ownTenant] = await db
      .select()
      .from(schema.tenants)
      .where(eq(schema.tenants.id, own[0]!.tenantId));
    expect(ownTenant!.domain).toBeNull();
  });

  it("prefers the tenant match over the email domain", async () => {
    await seedDomainWorkspace("auto");
    // Casey's account lives in another tenant that has its own workspace.
    const [theirs] = await db
      .insert(schema.tenants)
      .values({ name: "Other", tid: OTHER_TID, domainJoinMode: "auto" })
      .returning();
    const result = await provisionForSignIn(db, {
      ...COLLEAGUE,
      tid: OTHER_TID,
    });
    expect(result.outcome).toMatchObject({
      kind: "joined",
      tenant: { id: theirs!.id },
    });
  });

  it("does nothing for a different tenant or in off mode", async () => {
    const tenant = await seedTenantWorkspace("off");
    await provisionForSignIn(db, SAME_TENANT);
    await provisionForSignIn(db, {
      ...SAME_TENANT,
      oid: MALLORY_OID,
      tid: OTHER_TID,
    });
    const members = await db
      .select()
      .from(schema.memberships)
      .where(eq(schema.memberships.tenantId, tenant.id));
    expect(members).toHaveLength(1);
    expect(await db.select().from(schema.joinRequests)).toHaveLength(0);
  });

  it("never matches the demo workspace", async () => {
    await db.insert(schema.tenants).values({
      name: "Demo",
      tid: ACME_TID,
      isDemo: true,
      domainJoinMode: "auto",
    });
    const result = await provisionForSignIn(db, SAME_TENANT);
    expect(result.outcome.kind).toBe("none");
  });
});

describe("rows that belong to someone else", () => {
  it("does not take over a membership another person holds under the same address", async () => {
    const { tenantId } = await seedDomainWorkspace("auto");
    await db.insert(schema.memberships).values({
      tenantId,
      oid: MALLORY_OID,
      email: "casey@acme.com",
      role: "admin",
    });

    const result = await provisionForSignIn(db, COLLEAGUE);

    expect(result.outcome.kind).toBe("none");
    const own = await membershipsOf(CASEY_OID);
    expect(own.map((m) => m.tenantId)).not.toContain(tenantId);
    const [kept] = await membershipsOf(MALLORY_OID);
    expect(kept).toEqual({ tenantId, role: "admin" });
  });

  it("leaves an unlinked legacy member's row alone", async () => {
    const { tenantId } = await seedDomainWorkspace("auto");
    await db.insert(schema.memberships).values({
      tenantId,
      workosUserId: "user_casey",
      email: "casey@acme.com",
      role: "admin",
    });

    const result = await provisionForSignIn(db, {
      ...COLLEAGUE,
      emailVerified: false,
    });

    expect(result.outcome.kind).toBe("none");
    const [row] = await db
      .select()
      .from(schema.memberships)
      .where(eq(schema.memberships.workosUserId, "user_casey"));
    expect(row).toMatchObject({ oid: null, role: "admin" });
  });

  it("honours a decision recorded before sign-in moved to Entra, for a proven email only", async () => {
    const { tenantId } = await seedDomainWorkspace("approval");
    await db.insert(schema.joinRequests).values({
      tenantId,
      email: "casey@acme.com",
      workosUserId: "user_casey",
      status: "declined",
      decidedAt: new Date(),
    });

    const proven = await provisionForSignIn(db, COLLEAGUE);
    expect(proven.outcome.kind).toBe("none");
    expect(await db.select().from(schema.joinRequests)).toHaveLength(1);
  });

  it("approves a request from before the move as a legacy membership", async () => {
    const { tenantId, ownerMembershipId } =
      await seedDomainWorkspace("approval");
    const [legacy] = await db
      .insert(schema.joinRequests)
      .values({
        tenantId,
        email: "casey@acme.com",
        workosUserId: "user_casey",
      })
      .returning();

    const result = await approveJoinRequestRow(db, {
      tenantId,
      requestId: legacy!.id,
      decidedByMembershipId: ownerMembershipId,
    });

    expect(result).toMatchObject({ status: "done", changed: true });
    const [row] = await db
      .select()
      .from(schema.memberships)
      .where(eq(schema.memberships.workosUserId, "user_casey"));
    expect(row).toMatchObject({ tenantId, oid: null, role: "viewer" });
  });
});

describe("approving when the address is taken", () => {
  it("writes nothing and leaves the request pending", async () => {
    const { tenantId, ownerMembershipId } =
      await seedDomainWorkspace("approval");
    const filed = await provisionForSignIn(db, COLLEAGUE);
    if (filed.outcome.kind !== "requested") throw new Error("expected request");
    // Between the request and the approval someone else got that address.
    await db.insert(schema.memberships).values({
      tenantId,
      oid: MALLORY_OID,
      email: "casey@acme.com",
      role: "admin",
    });

    const result = await approveJoinRequestRow(db, {
      tenantId,
      requestId: filed.outcome.requestId,
      decidedByMembershipId: ownerMembershipId,
    });

    expect(result).toEqual({ status: "address_taken" });
    expect(await pendingJoinRequests(db, tenantId)).toHaveLength(1);
    const casey = await membershipsOf(CASEY_OID);
    expect(casey.map((m) => m.tenantId)).not.toContain(tenantId);
    expect(await membershipsOf(MALLORY_OID)).toEqual([
      { tenantId, role: "admin" },
    ]);
  });
});

describe("concurrent first sign-ins", () => {
  it("create exactly one workspace for the same person", async () => {
    const results = await Promise.all(
      Array.from({ length: 6 }, () => provisionForSignIn(db, OWNER)),
    );

    expect(results.every((r) => r.provisioned)).toBe(true);
    // Exactly one of the racing sign-ins created the workspace, so the
    // onboarding email that keys off this flag goes out once.
    expect(results.filter((r) => r.createdWorkspace)).toHaveLength(1);
    expect(await db.select().from(schema.tenants)).toHaveLength(1);
    expect(await membershipsOf(OWNER_OID)).toHaveLength(1);
  });

  it("gives two different people from one new domain one workspace each, and the domain to one", async () => {
    await Promise.all([
      provisionForSignIn(db, OWNER),
      provisionForSignIn(db, { ...COLLEAGUE, tid: OTHER_TID }),
    ]);
    const tenants = await db.select().from(schema.tenants);
    expect(tenants).toHaveLength(2);
    expect(tenants.filter((t) => t.domain === "acme.com")).toHaveLength(1);
  });
});
