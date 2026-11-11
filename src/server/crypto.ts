import { env } from "~/env";
import {
  decryptWithKeys,
  deriveKey,
  encryptWithKey,
  secretAad,
} from "./cryptoCore";

export { secretAad };

/**
 * AES-256-GCM for third-party connector credentials at rest: the Adobe client
 * secret, every SaaS connector secret (Zoom / Atlassian / Salesforce / OpenAI /
 * Anthropic), and the Microsoft BYO client secret / certificate private key.
 *
 * The key is derived from DATA_ENCRYPTION_KEY, which production requires (see
 * env.js) and which must differ from AUTH_SECRET, so a leak of the session
 * signing secret does not expose stored credentials.
 *
 * The earlier scheme derived the key from AUTH_SECRET. That key is used only
 * outside production, or in production while ENCRYPTION_LEGACY_FALLBACK=true
 * until the daily retention job has re-encrypted the old secrets
 * (src/server/secretMigration.ts; scripts/reencrypt-connector-secrets.ts does
 * the same from a trusted machine).
 *
 * Each ciphertext is bound to its context via AES-GCM Additional Authenticated
 * Data (AAD), `${tenantId}:${provider}:${column}` (see secretAad), so a secret
 * stored for one tenant/provider/column cannot be decrypted as another.
 */

/** Whether the AUTH_SECRET-derived key may still be used. */
export const legacyKeyAllowed = (): boolean =>
  env.NODE_ENV !== "production" || env.ENCRYPTION_LEGACY_FALLBACK === "true";

/** Active key for new writes. */
const primaryKey = (): Buffer => {
  if (env.DATA_ENCRYPTION_KEY) return deriveKey(env.DATA_ENCRYPTION_KEY);
  if (legacyKeyAllowed()) return deriveKey(env.AUTH_SECRET);
  throw new Error("DATA_ENCRYPTION_KEY is required in production");
};

/**
 * Legacy AUTH_SECRET-derived key, tried only as a decrypt fallback when a
 * DISTINCT DATA_ENCRYPTION_KEY is configured and the legacy key is allowed.
 */
const legacyKey = (): Buffer | null =>
  env.DATA_ENCRYPTION_KEY &&
  env.DATA_ENCRYPTION_KEY !== env.AUTH_SECRET &&
  legacyKeyAllowed()
    ? deriveKey(env.AUTH_SECRET)
    : null;

export const encryptSecret = (plain: string, aad: string): string =>
  encryptWithKey(plain, aad, primaryKey());

export const decryptSecret = (enc: string, aad: string): string =>
  decryptWithKeys(
    enc,
    aad,
    [primaryKey(), legacyKey()].filter((k): k is Buffer => k !== null),
  );
