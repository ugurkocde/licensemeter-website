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
 * Key derived from AUTH_SECRET via HKDF so no extra key material is managed;
 * rotating AUTH_SECRET invalidates stored secrets (documented trade-off:
 * customers simply re-enter the credential).
 *
 * Each ciphertext is bound to its context via AES-GCM Additional Authenticated
 * Data (AAD): the canonical scheme is `${tenantId}:${provider}:${column}` (see
 * secretAad). The exact same AAD must be supplied at the matching encrypt and
 * decrypt site or GCM authentication fails on final(). This makes a ciphertext
 * non-portable: a secret stored for one tenant/provider/column cannot be
 * decrypted as another (defends against row-swap / confused-deputy attacks).
 */
const key = (): Buffer =>
  Buffer.from(
    hkdfSync("sha256", env.AUTH_SECRET, "licensemeter-adobe", "secret-v1", 32),
  );

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
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${ct.toString("base64")}`;
};

export const decryptSecret = (enc: string, aad: string): string => {
  const [iv, tag, ct] = enc.split(".");
  if (!iv || !tag || !ct) throw new Error("Malformed encrypted secret");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(iv, "base64"),
  );
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ct, "base64")),
    decipher.final(),
  ]).toString("utf8");
};
