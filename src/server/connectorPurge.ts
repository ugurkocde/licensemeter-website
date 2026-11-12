import { and, eq, inArray, like, or, sql } from "drizzle-orm";

import { ALL_RULES, MICROSOFT_RULES } from "~/lib/rules";
import { db } from "~/server/db";
import {
  adobeConnections,
  adobeUsers,
  aiSpendDaily,
  findings,
  meteringConnections,
  msConnections,
  saasConnections,
  saasSeats,
  snapshots,
  tenants,
  tenantSkus,
  tenantUsers,
} from "~/server/db/schema";
import type { SaasProvider, WasteRuleId } from "~/server/types";

/**
 * What disconnecting a connector removes, and the lock that keeps a sync or
 * an analysis from writing a disconnected source's data back.
 *
 * What a disconnect removes is defined once, per source:
 * - Microsoft: the connection, the metering connection, the synced users,
 *   licenses and history snapshots, the usage signals and aggregates stored on
 *   the workspace, and the findings of the Microsoft rules. Customer-entered
 *   prices stay.
 * - Adobe: the connection, the synced users and the Adobe findings.
 * - A SaaS provider: the connection, its seats and daily spend, and the
 *   findings raised from its seats.
 *
 * A sync reads a source over minutes and writes afterwards, and an analysis
 * reads stored rows and writes findings. Both could otherwise write data of a
 * source that was disconnected in between. So every disconnect, every write of
 * synced source data and every analysis runs in a transaction that holds a
 * per-workspace advisory lock, and a sync writes a source's data only if the
 * source is still connected with the same identity it read from (its token).
 *
 * Connecting a source (every connect flow and the metering enable route) takes
 * the same lock and regenerates the connection's generation.
 */

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Queryable = typeof db | Tx;

/** Takes the workspace's source lock for the rest of the transaction. */
export const lockSources = async (tx: Tx, tenantId: string): Promise<void> => {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`licensemeter:sources:${tenantId}`}))`,
  );
};

/** Runs fn in a transaction that holds the workspace's source lock. */
export const withSourceLock = <T>(
  tenantId: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> =>
  db.transaction(async (tx) => {
    await lockSources(tx, tenantId);
    return fn(tx);
  });

/**
 * The identity of each connected source; null (Microsoft, Adobe) or absent
 * (SaaS) when it is not connected. It includes the connection's generation,
 * which every connect and credential replacement regenerates, so any
 * disconnect and reconnect changes it, even to the same organisation.
 */
export type SourceTokens = {
  microsoft: string | null;
  adobe: string | null;
  saas: Partial<Record<SaasProvider, string>>;
};

/** A legacy managed tenant has a tid but no connection row (and no generation). */
export const microsoftToken = (
  tid: string | null,
  conn: { mode: string; tid: string; generation: string } | undefined,
): string | null =>
  conn
    ? `${conn.mode}:${conn.tid}:${conn.generation}`
    : tid
      ? `managed:${tid}`
      : null;

export const adobeToken = (
  conn: { generation: string } | undefined,
): string | null => (conn ? conn.generation : null);

export const saasToken = (conn: { generation: string }): string =>
  conn.generation;

export const readSourceTokens = async (
  q: Queryable,
  tenantId: string,
): Promise<SourceTokens> => {
  const tenant = await q.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
    columns: { tid: true },
  });
  const ms = await q.query.msConnections.findFirst({
    where: eq(msConnections.tenantId, tenantId),
    columns: { mode: true, tid: true, generation: true },
  });
  const adobe = await q.query.adobeConnections.findFirst({
    where: eq(adobeConnections.tenantId, tenantId),
    columns: { generation: true },
  });
  const saas = await q.query.saasConnections.findMany({
    where: eq(saasConnections.tenantId, tenantId),
    columns: { provider: true, generation: true },
  });
  return {
    microsoft: microsoftToken(tenant?.tid ?? null, ms),
    adobe: adobeToken(adobe),
    saas: Object.fromEntries(saas.map((c) => [c.provider, saasToken(c)])),
  };
};

export const ADOBE_RULES: WasteRuleId[] = ALL_RULES.filter((rule) =>
  rule.startsWith("adobe_"),
);
export const SAAS_RULES: WasteRuleId[] = ALL_RULES.filter((rule) =>
  rule.startsWith("saas_"),
);

export const purgeMicrosoftSource = (tenantId: string): Promise<void> =>
  withSourceLock(tenantId, async (tx) => {
    // msConnections before tenants, the same row order as the connect flows,
    // so the two cannot deadlock. All of it is one transaction, so the tid
    // binding is never released without the rest (a partial delete that left
    // tenants.tid set would let the managed fallback re-enable sync).
    await tx.delete(msConnections).where(eq(msConnections.tenantId, tenantId));
    await tx
      .delete(meteringConnections)
      .where(eq(meteringConnections.tenantId, tenantId));
    await tx
      .delete(findings)
      .where(
        and(
          eq(findings.tenantId, tenantId),
          inArray(findings.rule, MICROSOFT_RULES),
        ),
      );
    await tx.delete(tenantUsers).where(eq(tenantUsers.tenantId, tenantId));
    await tx.delete(tenantSkus).where(eq(tenantSkus.tenantId, tenantId));
    await tx.delete(snapshots).where(eq(snapshots.tenantId, tenantId));
    // The usage signals and aggregates are Microsoft data too; left behind,
    // an analysis would raise aggregate findings from them.
    await tx
      .update(tenants)
      .set({
        tid: null,
        consentedAt: null,
        activitySignal: null,
        copilotSignal: null,
        usageAggregate: null,
        copilotAggregate: null,
      })
      .where(eq(tenants.id, tenantId));
  });

export const purgeAdobeSource = (tenantId: string): Promise<void> =>
  withSourceLock(tenantId, async (tx) => {
    await tx
      .delete(adobeConnections)
      .where(eq(adobeConnections.tenantId, tenantId));
    await tx.delete(adobeUsers).where(eq(adobeUsers.tenantId, tenantId));
    await tx
      .delete(findings)
      .where(
        and(
          eq(findings.tenantId, tenantId),
          inArray(findings.rule, ADOBE_RULES),
        ),
      );
  });

export const purgeSaasSource = (
  tenantId: string,
  provider: SaasProvider,
): Promise<void> =>
  withSourceLock(tenantId, async (tx) => {
    await tx
      .delete(saasConnections)
      .where(
        and(
          eq(saasConnections.tenantId, tenantId),
          eq(saasConnections.provider, provider),
        ),
      );
    await tx
      .delete(saasSeats)
      .where(
        and(eq(saasSeats.tenantId, tenantId), eq(saasSeats.provider, provider)),
      );
    await tx
      .delete(aiSpendDaily)
      .where(
        and(
          eq(aiSpendDaily.tenantId, tenantId),
          eq(aiSpendDaily.provider, provider),
        ),
      );
    // The provider is in the finding detail, and in the dedupe key until a
    // resolved finding is pseudonymised.
    await tx
      .delete(findings)
      .where(
        and(
          eq(findings.tenantId, tenantId),
          inArray(findings.rule, SAAS_RULES),
          or(
            sql`${findings.detail}->>'provider' = ${provider}`,
            like(findings.dedupeKey, `%|${provider}:%`),
          ),
        ),
      );
  });

/**
 * For the end of a sync, under the lock: which of the findings it computed may
 * still be written, given the tokens each source was read with. A source read
 * from an import (no connection) keeps its findings only while its imported
 * seats still exist.
 */
export const currentFindingFilter = async (
  tx: Tx,
  tenantId: string,
  readWith: SourceTokens,
): Promise<
  (f: { rule: WasteRuleId; detail: Record<string, unknown> }) => boolean
> => {
  const now = await readSourceTokens(tx, tenantId);
  const seatProviders = new Set(
    (
      await tx
        .selectDistinct({ provider: saasSeats.provider })
        .from(saasSeats)
        .where(eq(saasSeats.tenantId, tenantId))
    ).map((r) => r.provider),
  );
  const microsoftOk = now.microsoft === readWith.microsoft;
  const adobeOk = now.adobe === readWith.adobe;
  return (f) => {
    if (MICROSOFT_RULES.includes(f.rule)) return microsoftOk;
    if (ADOBE_RULES.includes(f.rule)) return adobeOk;
    const provider = f.detail.provider as SaasProvider | undefined;
    if (!provider) return true;
    const token = readWith.saas[provider];
    if (token === undefined) {
      // Imported: no connection then, none now, and the seats still there.
      return now.saas[provider] === undefined && seatProviders.has(provider);
    }
    return now.saas[provider] === token;
  };
};
