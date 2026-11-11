import { env } from "~/env";
import { legacyKeyAllowed } from "~/server/crypto";
import { deriveKey } from "~/server/cryptoCore";
import { db } from "~/server/db";
import {
  reencryptSecrets,
  type ReencryptionResult,
} from "~/server/secretReencryption";

/**
 * Moves connector secrets still encrypted with the AUTH_SECRET-derived key to
 * the DATA_ENCRYPTION_KEY key, from the daily retention job. The service holds
 * both values, so no operator has to handle them. It uses the old key under
 * the same rule as the app's own reads (legacyKeyAllowed: in production only
 * while ENCRYPTION_LEGACY_FALLBACK=true), so removing the flag retires the old
 * key everywhere. Skipped without a distinct DATA_ENCRYPTION_KEY. Once every
 * secret is current it changes nothing.
 */
export const migrateLegacySecrets = async (): Promise<
  ReencryptionResult | { skipped: "noDistinctKey" | "legacyKeyNotAllowed" }
> => {
  if (!env.DATA_ENCRYPTION_KEY || env.DATA_ENCRYPTION_KEY === env.AUTH_SECRET)
    return { skipped: "noDistinctKey" };
  if (!legacyKeyAllowed()) return { skipped: "legacyKeyNotAllowed" };
  return reencryptSecrets(
    db,
    {
      oldKey: deriveKey(env.AUTH_SECRET),
      newKey: deriveKey(env.DATA_ENCRYPTION_KEY),
    },
    { dryRun: false },
  );
};
