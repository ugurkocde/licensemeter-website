import { eq } from "drizzle-orm";

import { decryptSecret, secretAad } from "~/server/crypto";
import { db } from "~/server/db";
import { reclaimConnections } from "~/server/db/schema";
import type { ReclaimCredential } from "./graph";

export type ReclaimConnectionRow = typeof reclaimConnections.$inferSelect;

/** AAD of the stored BYO credential: bound to this workspace and column. */
export const reclaimSecretAad = (tenantId: string) =>
  secretAad(tenantId, "reclaim", "secretEnc");

export const loadReclaimConnection = async (
  tenantId: string,
): Promise<ReclaimConnectionRow | null> =>
  (await db.query.reclaimConnections.findFirst({
    where: eq(reclaimConnections.tenantId, tenantId),
  })) ?? null;

/**
 * Whether the workspace can write licenses right now: consent proven, and for
 * the tenant that is still connected to the workspace.
 */
export const reclaimReady = (
  connection: ReclaimConnectionRow | null,
  workspaceTid: string | null,
): connection is ReclaimConnectionRow & { consentedAt: Date } =>
  Boolean(
    connection?.consentedAt &&
    connection.tid.toLowerCase() === workspaceTid?.toLowerCase(),
  );

/** The reclaim credential of a connection row, decrypting a BYO secret. */
export function reclaimCredentialOf(
  connection: ReclaimConnectionRow,
): ReclaimCredential {
  if (connection.mode === "managed")
    return { mode: "managed", tid: connection.tid };
  if (!connection.appClientId || !connection.secretEnc || !connection.credType)
    throw new Error("Incomplete BYO reclaim connection");
  const material = decryptSecret(
    connection.secretEnc,
    reclaimSecretAad(connection.tenantId),
  );
  if (connection.credType === "secret")
    return {
      mode: "byo",
      credType: "secret",
      tid: connection.tid,
      clientId: connection.appClientId,
      secret: material,
    };
  if (!connection.certThumbprint)
    throw new Error("BYO reclaim certificate is missing its thumbprint");
  return {
    mode: "byo",
    credType: "cert",
    tid: connection.tid,
    clientId: connection.appClientId,
    privateKey: material,
    thumbprint: connection.certThumbprint,
  };
}
