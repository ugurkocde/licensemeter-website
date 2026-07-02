import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "node:crypto";

import { env } from "~/env";

/**
 * AES-256-GCM for third-party connector credentials at rest: the Adobe client
 * secret, every SaaS connector secret (Zoom / Atlassian / Salesforce / OpenAI /
 * Anthropic), and the Microsoft BYO client secret / certificate private key.
 *
 * Key derived via HKDF from DATA_ENCRYPTION_KEY when set, else AUTH_SECRET. A
 * dedicated DATA_ENCRYPTION_KEY separates the data-at-rest key from the session
 * signing secret, so leaking one does not compromise the other and AUTH_SECRET
 * can be rotated without re-encrypting stored credentials. When DATA_ENCRYPTION_KEY
 * is unset the derivation is byte-identical to the previous AUTH_SECRET-only
 * scheme, so existing ciphertext decrypts with no migration.
 *
 * Each ciphertext is bound to its context via AES-GCM Additional Authenticated
 * Data (AAD): the canonical scheme is `${tenantId}:${provider}:${column}` (see
 * secretAad). The exact same AAD must be supplied at the matching encrypt and
 * decrypt site or GCM authentication fails on final(). This makes a ciphertext
 * non-portable: a secret stored for one tenant/provider/column cannot be
 * decrypted as another (defends against row-swap / confused-deputy attacks).
 */
const deriveKey = (secret: string): Buffer =>
  Buffer.from(hkdfSync("sha256", secret, "licensemeter-adobe", "secret-v1", 32));

/** Active key for new writes: dedicated DATA_ENCRYPTION_KEY or AUTH_SECRET. */
const primaryKey = (): Buffer =>
  deriveKey(env.DATA_ENCRYPTION_KEY ?? env.AUTH_SECRET);

/**
 * Legacy AUTH_SECRET-derived key, tried only as a decrypt fallback when a
 * DISTINCT DATA_ENCRYPTION_KEY is configured. This lets a rotation re-point new
 * writes to the new key while ciphertext still encrypted under AUTH_SECRET keeps
 * decrypting, so existing rows can be re-encrypted lazily rather than all at once.
 */
const legacyKey = (): Buffer | null =>
  env.DATA_ENCRYPTION_KEY && env.DATA_ENCRYPTION_KEY !== env.AUTH_SECRET
    ? deriveKey(env.AUTH_SECRET)
    : null;

/**
 * Canonical AAD for a stored connector secret. `tenantId` is the workspace UUID,
 * `provider` a stable provider identifier ("adobe", "microsoft", or the SaaS
 * provider slug), and `column` the DB column the ciphertext lives in
 * ("clientSecretEnc" / "secretEnc"). Both the encrypt and decrypt site must
 * reconstruct this identically.
 */
export const secretAad = (
  tenantId: string,
  provider: string,
  column: string,
): string => `${tenantId}:${provider}:${column}`;

export const encryptSecret = (plain: string, aad: string): string => {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", primaryKey(), iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${ct.toString("base64")}`;
};

export const decryptSecret = (enc: string, aad: string): string => {
  const [iv, tag, ct] = enc.split(".");
  if (!iv || !tag || !ct) throw new Error("Malformed encrypted secret");
  const ivBuf = Buffer.from(iv, "base64");
  const tagBuf = Buffer.from(tag, "base64");
  const ctBuf = Buffer.from(ct, "base64");
  // Try the active key, then the legacy AUTH_SECRET key (only present mid-rotation).
  // A wrong AAD or tampered ciphertext fails GCM auth on final() for every key,
  // so this still throws on genuine mismatches - it only bridges a key rotation.
  const keys = [primaryKey(), legacyKey()].filter(
    (k): k is Buffer => k !== null,
  );
  let lastErr: unknown = new Error("Failed to decrypt secret");
  for (const k of keys) {
    try {
      const decipher = createDecipheriv("aes-256-gcm", k, ivBuf);
      decipher.setAAD(Buffer.from(aad, "utf8"));
      decipher.setAuthTag(tagBuf);
      return Buffer.concat([
        decipher.update(ctBuf),
        decipher.final(),
      ]).toString("utf8");
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Failed to decrypt secret");
};
