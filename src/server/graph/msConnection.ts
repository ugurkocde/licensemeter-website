import { eq } from "drizzle-orm";

import { decryptSecret, secretAad } from "~/server/crypto";
import { db } from "~/server/db";
import { msConnections, type TenantRow } from "~/server/db/schema";
import { MsGraphClient, type MsCredential } from "./msGraph";

/**
 * Resolve the app-only Graph credential for a workspace from its msConnections
 * row, decrypting BYO secrets/keys. Pre-Phase-C tenants (no row yet) fall back
 * to managed using the tenant's tid, so existing managed customers keep working
 * before the backfill (Phase F). Throws when no Microsoft tenant is known at
 * all (a workspace that has never connected Microsoft).
 */
export const resolveMsCredential = async (
  tenant: TenantRow,
): Promise<MsCredential> => {
  const conn = await db.query.msConnections.findFirst({
    where: eq(msConnections.tenantId, tenant.id),
  });

  if (!conn || conn.mode === "managed") {
    const tid = conn?.tid ?? tenant.tid;
    if (!tid) {
      throw new Error(
        `Workspace ${tenant.id} has no Microsoft tenant connected`,
      );
    }
    return { mode: "managed", tid };
  }

  // BYO: every credential column must be present and self-consistent.
  if (!conn.appClientId || !conn.secretEnc || !conn.credType) {
    throw new Error(
      `Workspace ${tenant.id} has an incomplete BYO Microsoft connection`,
    );
  }
  if (conn.credType === "secret") {
    return {
      mode: "byo",
      credType: "secret",
      tid: conn.tid,
      clientId: conn.appClientId,
      secret: decryptSecret(
        conn.secretEnc,
        secretAad(conn.tenantId, "microsoft", "secretEnc"),
      ),
    };
  }
  if (!conn.certThumbprint) {
    throw new Error(
      `Workspace ${tenant.id} BYO certificate connection is missing its thumbprint`,
    );
  }
  return {
    mode: "byo",
    credType: "cert",
    tid: conn.tid,
    clientId: conn.appClientId,
    privateKey: decryptSecret(
      conn.secretEnc,
      secretAad(conn.tenantId, "microsoft", "secretEnc"),
    ),
    thumbprint: conn.certThumbprint,
  };
};

/** Build the live Graph client for a workspace's Microsoft connection. */
export const msGraphClientForTenant = async (
  tenant: TenantRow,
): Promise<MsGraphClient> =>
  new MsGraphClient(await resolveMsCredential(tenant));
