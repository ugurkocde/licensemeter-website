import { and, desc, eq, inArray, sql } from "drizzle-orm";

import {
  APP_AUTH_ERROR_PATTERN,
  isConnectorCredentialError,
} from "~/lib/msAuthError";
import { db } from "~/server/db";
import { syncRuns } from "~/server/db/schema";

/**
 * Why a managed Microsoft connection lost access, for the connector page.
 * "consent": the tenant side (enterprise app removed, consent revoked), fixed
 * by granting admin consent again. "connector": LicenseMeter's own connector
 * credential was rejected, which consent cannot fix. "unknown": no failed run
 * carries an authentication error any more, so no remedy is suggested.
 */
export type AccessLossCause = "consent" | "connector" | "unknown";

export type AccessLoss = {
  cause: AccessLossCause;
  /** When the figures were last refreshed: the newest completed run. */
  lastSyncedAt: Date | null;
};

/**
 * Reads the evidence for a managed connection whose lastVerifyError is set.
 * The cause comes from the newest failed run that has an authentication
 * error, not simply the newest failed run: a later failure for another
 * reason (a network error at the token endpoint) leaves lastVerifyError in
 * place but says nothing about why access was lost. The date ignores
 * lastVerifiedAt, which a fresh consent moves before any data is pulled.
 */
export const loadAccessLoss = async (tenantId: string): Promise<AccessLoss> => {
  const [synced, authFailure] = await Promise.all([
    db.query.syncRuns.findFirst({
      where: and(
        eq(syncRuns.tenantId, tenantId),
        inArray(syncRuns.status, ["success", "partial"]),
      ),
      orderBy: desc(syncRuns.startedAt),
      columns: { finishedAt: true },
    }),
    db.query.syncRuns.findFirst({
      where: and(
        eq(syncRuns.tenantId, tenantId),
        eq(syncRuns.status, "failed"),
        sql`${syncRuns.error} ~* ${APP_AUTH_ERROR_PATTERN}`,
      ),
      orderBy: desc(syncRuns.startedAt),
      columns: { error: true },
    }),
  ]);
  return {
    lastSyncedAt: synced?.finishedAt ?? null,
    cause: !authFailure
      ? "unknown"
      : isConnectorCredentialError(authFailure.error)
        ? "connector"
        : "consent",
  };
};
