import { decryptWithKeys, encryptWithKey, secretAad } from "./cryptoCore";

/**
 * Every column that stores an encrypted connector credential, with the AAD
 * parts its encrypt and decrypt sites use (actions.ts, msConnection.ts,
 * runSync.ts). `provider` is a fixed string or, for SaaS connectors, read from
 * the row's provider column.
 */
export const SECRET_COLUMNS = [
  {
    table: "ms_connections",
    column: "secret_enc",
    aadColumn: "secretEnc",
    provider: "microsoft",
    keyColumns: ["tenant_id"],
  },
  {
    table: "adobe_connections",
    column: "client_secret_enc",
    aadColumn: "clientSecretEnc",
    provider: "adobe",
    keyColumns: ["tenant_id"],
  },
  {
    table: "saas_connections",
    column: "secret_enc",
    aadColumn: "secretEnc",
    provider: { fromColumn: "provider" },
    keyColumns: ["tenant_id", "provider"],
  },
] as const;

export type SecretColumn = (typeof SECRET_COLUMNS)[number];

export type StoredSecret = {
  tenantId: string;
  provider: string;
  value: string;
};

export const aadFor = (column: SecretColumn, row: StoredSecret): string =>
  secretAad(row.tenantId, row.provider, column.aadColumn);

export type ReencryptionPlan =
  | { status: "current" }
  | { status: "migrate"; value: string }
  | { status: "unreadable" };

/**
 * Decides what to do with one stored secret. Already readable with the new
 * key: nothing (so reruns are no-ops). Readable with the old key: re-encrypt
 * under the new key and prove the result decrypts to the same plaintext.
 * Readable with neither: unreadable, which aborts the migration.
 */
export const planReencryption = (
  column: SecretColumn,
  row: StoredSecret,
  oldKey: Buffer,
  newKey: Buffer,
): ReencryptionPlan => {
  const aad = aadFor(column, row);
  try {
    decryptWithKeys(row.value, aad, [newKey]);
    return { status: "current" };
  } catch {
    // not yet migrated
  }
  let plain: string;
  try {
    plain = decryptWithKeys(row.value, aad, [oldKey]);
  } catch {
    return { status: "unreadable" };
  }
  const value = encryptWithKey(plain, aad, newKey);
  if (decryptWithKeys(value, aad, [newKey]) !== plain) {
    throw new Error("Re-encrypted secret failed verification");
  }
  return { status: "migrate", value };
};

/** True when the stored value decrypts with the new key alone. */
export const readableWithKey = (
  column: SecretColumn,
  row: StoredSecret,
  key: Buffer,
): boolean => {
  try {
    decryptWithKeys(row.value, aadFor(column, row), [key]);
    return true;
  } catch {
    return false;
  }
};
