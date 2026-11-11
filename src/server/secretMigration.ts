import { env } from "~/env";
import { deriveKey } from "~/server/cryptoCore";
import { db } from "~/server/db";
import {
  reencryptSecrets,
  type ReencryptionResult,
} from "~/server/secretReencryption";

/**
 * Moves connector secrets still encrypted with the AUTH_SECRET-derived key to
 * the DATA_ENCRYPTION_KEY key, from the daily retention job. The service holds
 * both values, so no operator has to handle them. Skipped unless a distinct
 * DATA_ENCRYPTION_KEY is configured. Once every secret is current it changes
 * nothing; the old key only decrypts here, never for the app's own reads
 * (see legacyKeyAllowed in crypto.ts).
 */
export const migrateLegacySecrets = async (): Promise<
  ReencryptionResult | { skipped: "noDistinctKey" }
> => {
  if (!env.DATA_ENCRYPTION_KEY || env.DATA_ENCRYPTION_KEY === env.AUTH_SECRET)
    return { skipped: "noDistinctKey" };
  return reencryptSecrets(
    db,
    {
      oldKey: deriveKey(env.AUTH_SECRET),
      newKey: deriveKey(env.DATA_ENCRYPTION_KEY),
    },
    { dryRun: false },
  );
};
