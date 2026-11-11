import { and, eq, isNotNull } from "drizzle-orm";

import { decryptWithKeys, encryptWithKey, secretAad } from "./cryptoCore";
import type { Db } from "./db";
import { adobeConnections, msConnections, saasConnections } from "./db/schema";
import type { SaasProvider } from "./types";

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

/* ------------------------------------------------- Transactional migration */

/**
 * Per-column read and write of the stored secrets, through the Drizzle schema
 * so the same code runs on Postgres (production, the script) and PGlite
 * (tests). A write matches the old ciphertext, so a value changed by a
 * concurrent save is never overwritten.
 */
type SecretTarget = {
  column: SecretColumn;
  read: (tx: Db, lock: boolean) => Promise<StoredSecret[]>;
  write: (tx: Db, row: StoredSecret, value: string) => Promise<number>;
};

const TARGETS: SecretTarget[] = [
  {
    column: SECRET_COLUMNS[0],
    read: async (tx, lock) => {
      const q = tx
        .select({
          tenantId: msConnections.tenantId,
          value: msConnections.secretEnc,
        })
        .from(msConnections)
        .where(isNotNull(msConnections.secretEnc));
      const rows = lock ? await q.for("update") : await q;
      return rows.map((r) => ({
        tenantId: r.tenantId,
        provider: "microsoft",
        value: r.value!,
      }));
    },
    write: async (tx, row, value) =>
      (
        await tx
          .update(msConnections)
          .set({ secretEnc: value })
          .where(
            and(
              eq(msConnections.tenantId, row.tenantId),
              eq(msConnections.secretEnc, row.value),
            ),
          )
          .returning({ tenantId: msConnections.tenantId })
      ).length,
  },
  {
    column: SECRET_COLUMNS[1],
    read: async (tx, lock) => {
      const q = tx
        .select({
          tenantId: adobeConnections.tenantId,
          value: adobeConnections.clientSecretEnc,
        })
        .from(adobeConnections);
      const rows = lock ? await q.for("update") : await q;
      return rows.map((r) => ({ ...r, provider: "adobe" }));
    },
    write: async (tx, row, value) =>
      (
        await tx
          .update(adobeConnections)
          .set({ clientSecretEnc: value })
          .where(
            and(
              eq(adobeConnections.tenantId, row.tenantId),
              eq(adobeConnections.clientSecretEnc, row.value),
            ),
          )
          .returning({ tenantId: adobeConnections.tenantId })
      ).length,
  },
  {
    column: SECRET_COLUMNS[2],
    read: async (tx, lock) => {
      const q = tx
        .select({
          tenantId: saasConnections.tenantId,
          provider: saasConnections.provider,
          value: saasConnections.secretEnc,
        })
        .from(saasConnections);
      return lock ? await q.for("update") : await q;
    },
    write: async (tx, row, value) =>
      (
        await tx
          .update(saasConnections)
          .set({ secretEnc: value })
          .where(
            and(
              eq(saasConnections.tenantId, row.tenantId),
              eq(saasConnections.provider, row.provider as SaasProvider),
              eq(saasConnections.secretEnc, row.value),
            ),
          )
          .returning({ tenantId: saasConnections.tenantId })
      ).length,
  },
];

export type ReencryptionCounts = {
  total: number;
  current: number;
  migrate: number;
  unreadable: number;
};

export type ReencryptionResult = {
  dryRun: boolean;
  reencrypted: number;
  columns: Record<string, ReencryptionCounts>;
};

/** A migration that rolled back; its message names tables and tenant ids only. */
export class ReencryptionAborted extends Error {}

class DryRun extends Error {}

/**
 * Re-encrypts every stored connector secret that still uses the old key, in
 * one transaction with the rows locked. Idempotent: a secret that already
 * decrypts with the new key is left as it is. Aborts, changing nothing, when a
 * secret decrypts with neither key or a re-encrypted row fails to decrypt with
 * the new key alone before COMMIT. A dry run counts and rolls back.
 */
export const reencryptSecrets = async (
  database: Db,
  keys: { oldKey: Buffer; newKey: Buffer },
  { dryRun }: { dryRun: boolean },
): Promise<ReencryptionResult> => {
  const columns: Record<string, ReencryptionCounts> = {};
  let reencrypted = 0;
  try {
    await database.transaction(async (tx) => {
      const updates: {
        target: SecretTarget;
        row: StoredSecret;
        value: string;
      }[] = [];
      const unreadable: string[] = [];

      for (const target of TARGETS) {
        const counts: ReencryptionCounts = {
          total: 0,
          current: 0,
          migrate: 0,
          unreadable: 0,
        };
        for (const row of await target.read(tx, true)) {
          counts.total++;
          const plan = planReencryption(
            target.column,
            row,
            keys.oldKey,
            keys.newKey,
          );
          counts[plan.status]++;
          if (plan.status === "migrate")
            updates.push({ target, row, value: plan.value });
          if (plan.status === "unreadable")
            unreadable.push(`${target.column.table} tenant ${row.tenantId}`);
        }
        columns[`${target.column.table}.${target.column.column}`] = counts;
      }

      if (unreadable.length > 0) {
        throw new ReencryptionAborted(
          `Aborted: ${unreadable.length} secret(s) decrypt with neither key (${unreadable.join(", ")}). Nothing was changed.`,
        );
      }
      if (dryRun) throw new DryRun();

      for (const { target, row, value } of updates) {
        const count = await target.write(tx, row, value);
        if (count !== 1)
          throw new ReencryptionAborted(
            `Aborted: expected one updated row in ${target.column.table} for tenant ${row.tenantId}, got ${count}. Nothing was changed.`,
          );
      }

      // Verify before COMMIT: every stored secret must now decrypt with the
      // new key alone.
      for (const target of TARGETS) {
        for (const row of await target.read(tx, false)) {
          if (!readableWithKey(target.column, row, keys.newKey))
            throw new ReencryptionAborted(
              `Aborted: ${target.column.table} tenant ${row.tenantId} does not decrypt with the new key after re-encryption. Nothing was changed.`,
            );
        }
      }
      reencrypted = updates.length;
    });
  } catch (err) {
    if (err instanceof DryRun) return { dryRun: true, reencrypted: 0, columns };
    throw err;
  }
  return { dryRun, reencrypted, columns };
};
