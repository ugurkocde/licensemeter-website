import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "node:crypto";

/**
 * Key-agnostic AES-256-GCM primitives for connector credentials at rest. This
 * module reads no environment so the re-encryption script can use it with
 * explicit keys; the app goes through crypto.ts, which picks the keys.
 *
 * Ciphertext format: `${iv}.${tag}.${ct}`, each base64, with a random 12-byte
 * IV and the AAD bound to tenant, provider and column (see secretAad).
 */

/** HKDF-SHA256 derivation shared by every key source; unchanged since v1. */
export const deriveKey = (secret: string): Buffer =>
  Buffer.from(
    hkdfSync("sha256", secret, "licensemeter-adobe", "secret-v1", 32),
  );

/**
 * Canonical AAD for a stored connector secret. `tenantId` is the workspace UUID,
 * `provider` a stable provider identifier ("adobe", "microsoft", or the SaaS
 * provider slug), and `column` the drizzle column name the ciphertext lives in
 * ("clientSecretEnc" / "secretEnc"). Encrypt and decrypt sites must build it
 * identically, or GCM authentication fails.
 */
export const secretAad = (
  tenantId: string,
  provider: string,
  column: string,
): string => `${tenantId}:${provider}:${column}`;

export const encryptWithKey = (
  plain: string,
  aad: string,
  key: Buffer,
): string => {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${ct.toString("base64")}`;
};

/**
 * Decrypts with the first key that authenticates. A wrong AAD or a tampered
 * ciphertext fails GCM authentication for every key, so this still throws on
 * genuine mismatches.
 */
export const decryptWithKeys = (
  enc: string,
  aad: string,
  keys: readonly Buffer[],
): string => {
  const [iv, tag, ct] = enc.split(".");
  if (!iv || !tag || !ct) throw new Error("Malformed encrypted secret");
  const ivBuf = Buffer.from(iv, "base64");
  const tagBuf = Buffer.from(tag, "base64");
  const ctBuf = Buffer.from(ct, "base64");
  let lastErr: unknown = new Error("Failed to decrypt secret");
  for (const k of keys) {
    try {
      const decipher = createDecipheriv("aes-256-gcm", k, ivBuf);
      decipher.setAAD(Buffer.from(aad, "utf8"));
      decipher.setAuthTag(tagBuf);
      return Buffer.concat([decipher.update(ctBuf), decipher.final()]).toString(
        "utf8",
      );
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error("Failed to decrypt secret");
};
