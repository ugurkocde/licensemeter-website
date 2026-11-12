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
import type { SaasProvider } from "~/server/types";

/**
 * What disconnecting one connector removes, in one place, so the disconnect
 * actions and the sync use the same definition:
 * - Microsoft: the connection, the metering connection, the synced users,
 *   licenses and history snapshots, and the findings of the Microsoft rules.
 *   Customer-entered prices stay.
 * - Adobe: the connection, the synced users and the Adobe findings.
 * - A SaaS provider: the connection, its seats and daily spend, and the
 *   findings raised from its seats.
 *
 * A sync reads its credentials when it starts, so a disconnect during a sync
 * could otherwise be followed by the sync writing what it already read. The
 * sync therefore calls purgeDisconnectedSources when it finishes: any source
 * it started with that is no longer connected is purged again, after the
 * sync's own writes, so nothing it wrote survives.
 */

const ADOBE_RULES = ALL_RULES.filter((rule) => rule.startsWith("adobe_"));
const SAAS_RULES = ALL_RULES.filter((rule) => rule.startsWith("saas_"));

export const purgeMicrosoftSource = async (tenantId: string): Promise<void> => {
  // Release the tid binding first: the managed fallback in resolveMsCredential
  // would otherwise silently re-enable sync on a partial delete.
  await db.transaction(async (tx) => {
    await tx
      .update(tenants)
      .set({ tid: null, consentedAt: null })
      .where(eq(tenants.id, tenantId));
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
  });
};

export const purgeAdobeSource = async (tenantId: string): Promise<void> => {
  await db.transaction(async (tx) => {
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
};

export const purgeSaasSource = async (
  tenantId: string,
  provider: SaasProvider,
): Promise<void> => {
  await db.transaction(async (tx) => {
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
};

/** The connected sources a sync started with. */
export type SyncSources = {
  microsoft: boolean;
  adobe: boolean;
  saas: SaasProvider[];
};

/**
 * Purges every source the sync started with that has been disconnected since.
 * Sources that were never connected (a CSV import, for example) are not
 * touched, and a source that is still connected keeps its data.
 */
export const purgeDisconnectedSources = async (
  tenantId: string,
  started: SyncSources,
): Promise<void> => {
  if (started.microsoft) {
    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, tenantId),
      columns: { tid: true },
    });
    const conn = await db.query.msConnections.findFirst({
      where: eq(msConnections.tenantId, tenantId),
      columns: { tenantId: true },
    });
    if (tenant?.tid === null && !conn) {
      await purgeMicrosoftSource(tenantId);
    }
  }
  if (started.adobe) {
    const conn = await db.query.adobeConnections.findFirst({
      where: eq(adobeConnections.tenantId, tenantId),
      columns: { tenantId: true },
    });
    if (!conn) await purgeAdobeSource(tenantId);
  }
  if (started.saas.length > 0) {
    const still = await db.query.saasConnections.findMany({
      where: eq(saasConnections.tenantId, tenantId),
      columns: { provider: true },
    });
    const connected = new Set(still.map((c) => c.provider));
    for (const provider of started.saas) {
      if (!connected.has(provider)) await purgeSaasSource(tenantId, provider);
    }
  }
};

/**
 * The sources connected right now. Demo workspaces report none, so their
 * fixture data is never purged.
 */
export const connectedSources = async (tenant: {
  id: string;
  tid: string | null;
  isDemo: boolean;
}): Promise<SyncSources> => {
  if (tenant.isDemo) return { microsoft: false, adobe: false, saas: [] };
  const [ms, adobe, saas] = await Promise.all([
    db.query.msConnections.findFirst({
      where: eq(msConnections.tenantId, tenant.id),
      columns: { tenantId: true },
    }),
    db.query.adobeConnections.findFirst({
      where: eq(adobeConnections.tenantId, tenant.id),
      columns: { tenantId: true },
    }),
    db.query.saasConnections.findMany({
      where: eq(saasConnections.tenantId, tenant.id),
      columns: { provider: true },
    }),
  ]);
  return {
    microsoft: tenant.tid !== null || ms !== undefined,
    adobe: adobe !== undefined,
    saas: saas.map((c) => c.provider),
  };
};
