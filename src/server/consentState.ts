import { and, eq, gt, isNull, lt, min, like, notExists } from "drizzle-orm";
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { appBaseUrl, env } from "~/env";
import { db } from "~/server/db";
import { isUndefinedColumn } from "~/server/db/errors";
import { consentStates, msConnections, tenants } from "~/server/db/schema";
import { notifyOps } from "~/server/ops";

export const SELF_CONSENT_TTL_MS = 15 * 60 * 1000;
export const HANDOFF_TTL_MS = 7 * 24 * 60 * 60 * 1000;
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
    .groupBy(tenants.id);
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
  // Keep pending rows through the entire recovery and detection window.
  await db
    .delete(consentStates)
    .where(lt(consentStates.createdAt, new Date(Date.now() - HANDOFF_TTL_MS)));
};

export const handoffConfigured = () =>
  Boolean(
    env.CONNECTOR_CLIENT_ID &&
    env.CONNECTOR_CLIENT_SECRET &&
    env.AUTH_MICROSOFT_ENTRA_ID_ID &&
    env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
  );

export const approvalPath = (token: string) => `/connect/approve/${token}`;

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

      const now = Date.now();
      const existing = await tx.query.consentStates.findFirst({
        where: and(
          eq(consentStates.tenantId, tenantId),
          eq(consentStates.kind, "handoff"),
          isNull(consentStates.usedAt),
          gt(consentStates.createdAt, new Date(now - HANDOFF_TTL_MS)),
        ),
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
    return result?.state;
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
export const pendingApprovalLinks = (tenantId: string) =>
  and(
    eq(consentStates.tenantId, tenantId),
    isNull(consentStates.usedAt),
    like(consentStates.state, `${HANDOFF_PREFIX}%`),
  );
