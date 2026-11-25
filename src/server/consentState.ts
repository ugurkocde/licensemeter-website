import {
  and,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  min,
  like,
  notExists,
  or,
} from "drizzle-orm";
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { appBaseUrl, env } from "~/env";
import { db } from "~/server/db";
import { isUndefinedColumn } from "~/server/db/errors";
import {
  consentStates,
  memberships,
  msConnections,
  tenants,
} from "~/server/db/schema";
import { notifyOps } from "~/server/ops";

export const SELF_CONSENT_TTL_MS = 15 * 60 * 1000;
export const HANDOFF_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const HANDOFF_COMPLETION_MAX_AGE_SECONDS = 5 * 60;
const STALL_AGE_MS = 30 * 60 * 1000;
export const GUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HANDOFF_PREFIX = "handoff.";
export const isHandoffToken = (state: string) =>
  state.startsWith(HANDOFF_PREFIX) &&
  GUID_PATTERN.test(state.slice(HANDOFF_PREFIX.length));

type StateInput = Pick<
  typeof consentStates.$inferInsert,
  "state" | "tenantId" | "oid" | "tid" | "name" | "email"
>;

// Drizzle names every schema column in an insert. Use the old projection
// until the hosted migration has been applied.
const legacyConsentStates = pgTable("consent_states", {
  state: text("state").primaryKey(),
  tenantId: uuid("tenant_id"),
  oid: text("oid"),
  tid: text("tid"),
  email: text("email").notNull(),
  name: text("name"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  usedAt: timestamp("used_at", { withTimezone: true }),
});

export const createSelfConsentState = async (input: StateInput) => {
  try {
    await db.insert(consentStates).values(input);
  } catch (err) {
    if (!isUndefinedColumn(err)) throw err;
    await db.insert(legacyConsentStates).values(input);
  }
};

export const loadConsentState = async (state: string) => {
  const where = eq(consentStates.state, state);
  try {
    const [row] = await db.select().from(consentStates).where(where);
    return row;
  } catch (err) {
    if (!isUndefinedColumn(err)) throw err;
    if (isHandoffToken(state)) return undefined;
    const [row] = await db
      .select()
      .from(legacyConsentStates)
      .where(eq(legacyConsentStates.state, state));
    return row && { ...row, kind: "self" as const };
  }
};

const hasConnection = () =>
  db
    .select({ id: msConnections.tenantId })
    .from(msConnections)
    .where(eq(msConnections.tenantId, tenants.id));

const stallConditions = (now: number) =>
  and(
    eq(consentStates.kind, "self"),
    isNull(consentStates.usedAt),
    gt(consentStates.createdAt, new Date(now - HANDOFF_TTL_MS)),
    lt(consentStates.createdAt, new Date(now - STALL_AGE_MS)),
    isNull(tenants.tid),
    eq(tenants.isDemo, false),
    notExists(hasConnection()),
  );

/** Shared by the dashboard and the nightly sweep. Returns one stall per workspace. */
export const detectConsentStalls = async (
  tenantId?: string,
  now = Date.now(),
) => {
  const rows = await db
    .select({ tenantId: tenants.id, oldest: min(consentStates.createdAt) })
    .from(consentStates)
    .innerJoin(tenants, eq(consentStates.tenantId, tenants.id))
    .where(
      and(
        stallConditions(now),
        tenantId ? eq(tenants.id, tenantId) : undefined,
      ),
    )
    .groupBy(tenants.id)
    .catch((err: unknown) => {
      if (!isUndefinedColumn(err)) throw err;
      return [];
    });
  for (const { tenantId: id, oldest } of rows) {
    if (!oldest) continue;
    const minutes = Math.floor((now - oldest.getTime()) / 60_000);
    void notifyOps(
      `workspace ${id} generated a consent link ${minutes} min ago but no consent arrived`,
      {
        key: `consent-stall:${id}`,
        cooldownMs: HANDOFF_TTL_MS,
        logLevel: "info",
      },
    );
  }
  return rows;
};

export const sweepConsentStalls = async () => {
  await detectConsentStalls();
  await deleteExpiredConsentStates();
};

export const deleteExpiredConsentStates = (now = Date.now()) =>
  db
    .delete(consentStates)
    .where(
      and(
        lt(consentStates.createdAt, new Date(now - HANDOFF_TTL_MS)),
        or(
          isNull(consentStates.usedAt),
          lt(
            consentStates.usedAt,
            new Date(now - HANDOFF_COMPLETION_MAX_AGE_SECONDS * 1000),
          ),
        ),
      ),
    );

export const handoffConfigured = () =>
  Boolean(
    env.CONNECTOR_CLIENT_ID &&
    env.CONNECTOR_CLIENT_SECRET &&
    env.AUTH_MICROSOFT_ENTRA_ID_ID &&
    env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
  );

export const approvalPath = (token: string) => `/connect/approve/${token}`;

export const approvalLink = (token: string) =>
  new URL(approvalPath(token), appBaseUrl()).href;

export const requesterLabel = (
  { name, email }: Pick<StateInput, "name" | "email">,
  fallback: string,
) => {
  // Some sign-in profiles use the email address as the display name.
  const displayName = name?.includes("@") ? "" : (name?.trim() ?? "");
  const label = displayName || fallback;
  const domain = email.split("@").at(-1)?.trim().toLowerCase();
  return email.includes("@") && domain ? `${label} (${domain})` : label;
};

export const microsoftConsentUrl = (state: string, tid = "organizations") => {
  const url = new URL(
    `https://login.microsoftonline.com/${tid}/v2.0/adminconsent`,
  );
  url.searchParams.set("client_id", env.CONNECTOR_CLIENT_ID!);
  url.searchParams.set("scope", "https://graph.microsoft.com/.default");
  url.searchParams.set("redirect_uri", `${appBaseUrl()}/api/connect/callback`);
  url.searchParams.set("state", state);
  return url.toString();
};

export const createConsentHandoff = async (
  input: Omit<StateInput, "state" | "tenantId"> & { tenantId: string },
) => {
  if (!input.oid || !input.tid || !GUID_PATTERN.test(input.tid)) return;
  const oid = input.oid;
  const tenantId = input.tenantId;
  try {
    const result = await db.transaction(async (tx) => {
      // Serialize creation for a workspace so simultaneous clicks reuse one link.
      const [workspace] = await tx
        .select({ tid: tenants.tid, isDemo: tenants.isDemo })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .for("no key update");
      if (!workspace || workspace.tid || workspace.isDemo) return;
      const conn = await tx.query.msConnections.findFirst({
        where: eq(msConnections.tenantId, tenantId),
      });
      if (conn) return;
      const [admin] = await tx
        .select({ id: memberships.id })
        .from(memberships)
        .where(handoffRequesterAdmin(tenantId, oid))
        .for("share");
      if (!admin) return;

      const existing = await tx.query.consentStates.findFirst({
        where: liveApprovalLinks(tenantId),
      });
      if (existing) return { state: existing.state, created: false };
      const state = HANDOFF_PREFIX + crypto.randomUUID();
      await tx
        .insert(consentStates)
        .values({ ...input, state, kind: "handoff" });
      return { state, created: true };
    });
    if (result?.created) {
      void notifyOps(
        `workspace ${tenantId} created a Microsoft consent handoff link`,
        {
          key: `consent-handoff-created:${tenantId}`,
          cooldownMs: HANDOFF_TTL_MS,
          logLevel: "info",
        },
      );
    }
    return result;
  } catch (err) {
    if (!isUndefinedColumn(err)) throw err;
    return undefined;
  }
};

/** Validate a public link without revealing details for ineligible workspaces. */
export const loadPendingHandoff = async (token: string) => {
  if (!isHandoffToken(token) || !handoffConfigured()) return;
  const state = await loadConsentState(token);
  if (
    state?.kind !== "handoff" ||
    !state.tenantId ||
    !state.tid ||
    !GUID_PATTERN.test(state.tid) ||
    state.usedAt ||
    Date.now() - state.createdAt.getTime() >= HANDOFF_TTL_MS
  )
    return;
  const [workspace] = await db
    .select({ name: tenants.name, tid: tenants.tid })
    .from(tenants)
    .where(
      and(
        eq(tenants.id, state.tenantId),
        isNull(tenants.tid),
        eq(tenants.isDemo, false),
        notExists(hasConnection()),
      ),
    );
  if (workspace) return { state, workspace };
};

/** Match unspent approval links even before the kind migration. */
export const pendingApprovalLinks = (tenantId: string, oid?: string) =>
  and(
    eq(consentStates.tenantId, tenantId),
    isNull(consentStates.usedAt),
    like(consentStates.state, `${HANDOFF_PREFIX}%`),
    oid ? eq(consentStates.oid, oid) : undefined,
  );

const liveApprovalLinks = (tenantId: string) =>
  and(
    pendingApprovalLinks(tenantId),
    gt(consentStates.createdAt, new Date(Date.now() - HANDOFF_TTL_MS)),
  );

export const findApprovalLinkToken = async (tenantId: string) => {
  const [row] = await db
    .select({ state: consentStates.state })
    .from(consentStates)
    .where(liveApprovalLinks(tenantId))
    .limit(1);
  return row?.state;
};

export const handoffRequesterAdmin = (tenantId: string, oid: string) =>
  and(
    eq(memberships.tenantId, tenantId),
    eq(memberships.oid, oid),
    inArray(memberships.role, ["admin", "owner"]),
  );
