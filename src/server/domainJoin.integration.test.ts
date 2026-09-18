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

const OWNER: SignInIdentity = {
  email: "owner@acme.com",
  emailVerified: true,
  workosUserId: "user_owner",
  name: "Olivia Owner",
};
const COLLEAGUE: SignInIdentity = {
  email: "casey@acme.com",
  emailVerified: true,
  workosUserId: "user_casey",
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

const membershipsOf = (workosUserId: string) =>
  db
    .select({
      tenantId: schema.memberships.tenantId,
      role: schema.memberships.role,
    })
    .from(schema.memberships)
    .where(eq(schema.memberships.workosUserId, workosUserId));

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
    expect(result).toEqual({ provisioned: true, outcome: { kind: "none" } });
    const [tenant] = await db.select().from(schema.tenants);
    expect(tenant).toMatchObject({
      domain: "acme.com",
      domainJoinMode: "approval",
    });
    expect(await holdsJoinableDomain(db, tenant!)).toBe(true);
  });

  it("gives consumer and unverified addresses a workspace without a domain", async () => {
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
      workosUserId: "user_casey",
      status: "pending",
    });
    expect(await auditActions(tenantId)).toEqual(["member_join_requested"]);
  });

  it("keeps the requester unblocked with a workspace that holds no domain", async () => {
    const { tenantId } = await seedDomainWorkspace("approval");
    const result = await provisionForSignIn(db, COLLEAGUE);

    expect(result.provisioned).toBe(true);
    const own = await membershipsOf("user_casey");
    expect(own).toHaveLength(1);
    expect(own[0]!.role).toBe("owner");
    expect(own[0]!.tenantId).not.toBe(tenantId);
    const [ownTenant] = await db
      .select()
      .from(schema.tenants)
      .where(eq(schema.tenants.id, own[0]!.tenantId));
    expect(ownTenant!.domain).toBeNull();
    expect(await holdsJoinableDomain(db, ownTenant!)).toBe(false);
    expect(await pendingJoinRequestsOf(db, "user_casey")).toEqual([
      { id: expect.any(String) as string, tenantName: "acme.com" },
    ]);
  });

  it("files nothing when the rate limit refuses", async () => {
    const { tenantId } = await seedDomainWorkspace("approval");
    const result = await provisionForSignIn(db, COLLEAGUE, {
      allowRequest: () => Promise.resolve(false),
    });
    expect(result).toEqual({ provisioned: true, outcome: { kind: "none" } });
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
    expect(await pendingJoinRequestsOf(db, "user_casey")).toEqual([]);
  });
});

describe("auto mode", () => {
  it("joins as viewer, audits it and creates no second workspace", async () => {
    const { tenantId } = await seedDomainWorkspace("auto");
    const result = await provisionForSignIn(db, COLLEAGUE);

    expect(result.provisioned).toBe(true);
    expect(result.outcome.kind).toBe("joined");
    expect(await membershipsOf("user_casey")).toEqual([
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
          eq(schema.memberships.workosUserId, "user_casey"),
        ),
      );

    const again = await provisionForSignIn(db, COLLEAGUE);
    expect(again.outcome.kind).toBe("none");
    const own = await membershipsOf("user_casey");
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
    expect(await membershipsOf("user_casey")).toEqual([
      { tenantId, role: "viewer" },
    ]);
  });
});

describe("off mode", () => {
  it("neither joins nor requests, and the newcomer cannot take the domain", async () => {
    const { tenantId } = await seedDomainWorkspace("off");
    const result = await provisionForSignIn(db, COLLEAGUE);

    expect(result).toEqual({ provisioned: true, outcome: { kind: "none" } });
    expect(await db.select().from(schema.joinRequests)).toHaveLength(0);
    expect(await auditActions(tenantId)).toEqual([]);
    const own = await membershipsOf("user_casey");
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
    const inWorkspace = (await membershipsOf("user_casey")).filter(
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
      email: "mallory@other.example",
      emailVerified: true,
      workosUserId: "user_mallory",
      name: null,
    });
    const [other] = await db
      .select()
      .from(schema.memberships)
      .where(eq(schema.memberships.workosUserId, "user_mallory"));

    const result = await approveJoinRequestRow(db, {
      tenantId: other!.tenantId,
      requestId: filed.outcome.requestId,
      decidedByMembershipId: other!.id,
    });

    expect(result).toEqual({ status: "not_found" });
    expect(await pendingJoinRequests(db, tenantId)).toHaveLength(1);
    const casey = await membershipsOf("user_casey");
    expect(casey.map((m) => m.tenantId)).not.toContain(tenantId);
    expect(casey.map((m) => m.tenantId)).not.toContain(other!.tenantId);
  });
});
