/**
 * One-time migration of stored connector secrets from the key derived from
 * AUTH_SECRET to the key derived from DATA_ENCRYPTION_KEY.
 *
 * Covers ms_connections.secret_enc, adobe_connections.client_secret_enc and
 * saas_connections.secret_enc. Idempotent: a secret that already decrypts with
 * the new key is left unchanged, so the script can run again safely.
 *
 * Everything runs in one transaction with the rows locked. Before COMMIT every
 * stored secret is decrypted again with the new key alone; if any row fails,
 * or any row is readable with neither key, the transaction rolls back and
 * nothing changes. Output is counts only, never secret values.
 *
 *   DATABASE_URL=... AUTH_SECRET=... DATA_ENCRYPTION_KEY=... \
 *     npx tsx scripts/reencrypt-connector-secrets.ts --dry-run
 *
 * Without --dry-run the changes are committed. Exit code 0 on success (or a
 * clean dry run), 1 on any error or rollback.
 */
import postgres from "postgres";

import { deriveKey } from "../src/server/cryptoCore";
import { resolvePostgresSsl } from "../src/server/db/ssl";
import {
  SECRET_COLUMNS,
  planReencryption,
  readableWithKey,
  type SecretColumn,
  type StoredSecret,
} from "../src/server/secretReencryption";

class DryRun extends Error {}

type Counts = {
  total: number;
  current: number;
  migrate: number;
  unreadable: number;
};

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
};

const main = async (): Promise<void> => {
  const dryRun = process.argv.includes("--dry-run");
  const databaseUrl = required("DATABASE_URL");
  const authSecret = required("AUTH_SECRET");
  const dataKey = required("DATA_ENCRYPTION_KEY");
  if (dataKey.length < 32)
    throw new Error("DATA_ENCRYPTION_KEY must be at least 32 characters");
  if (dataKey === authSecret)
    throw new Error("DATA_ENCRYPTION_KEY must differ from AUTH_SECRET");

  const oldKey = deriveKey(authSecret);
  const newKey = deriveKey(dataKey);
  // TLS is required unless SELF_HOSTED=true (a self-hosted install's bundled
  // database has no TLS); localhost is always allowed.
  const ssl = resolvePostgresSsl(databaseUrl, {
    enforce: process.env.SELF_HOSTED !== "true",
  });
  const sql = postgres(databaseUrl, {
    max: 1,
    prepare: false,
    ...(ssl ? { ssl } : {}),
  });

  const readRows = async (
    tx: postgres.TransactionSql,
    column: SecretColumn,
    lock: boolean,
  ): Promise<StoredSecret[]> => {
    const providerColumn =
      typeof column.provider === "string" ? null : column.provider.fromColumn;
    const rows = await tx<
      { tenant_id: string; provider: string | null; value: string }[]
    >`
      select tenant_id::text as tenant_id,
             ${providerColumn ? tx(providerColumn) : tx`null`}::text as provider,
             ${tx(column.column)} as value
        from ${tx(column.table)}
       where ${tx(column.column)} is not null
       ${lock ? tx`for update` : tx``}
    `;
    return rows.map((r) => ({
      tenantId: r.tenant_id,
      provider:
        typeof column.provider === "string" ? column.provider : r.provider!,
      value: r.value,
    }));
  };

  const report: Record<string, Counts> = {};
  try {
    await sql.begin(async (tx) => {
      const updates: {
        column: SecretColumn;
        row: StoredSecret;
        value: string;
      }[] = [];
      const unreadable: string[] = [];

      for (const column of SECRET_COLUMNS) {
        const counts: Counts = {
          total: 0,
          current: 0,
          migrate: 0,
          unreadable: 0,
        };
        for (const row of await readRows(tx, column, true)) {
          counts.total++;
          const plan = planReencryption(column, row, oldKey, newKey);
          counts[plan.status]++;
          if (plan.status === "migrate")
            updates.push({ column, row, value: plan.value });
          if (plan.status === "unreadable")
            unreadable.push(`${column.table} tenant ${row.tenantId}`);
        }
        report[`${column.table}.${column.column}`] = counts;
      }

      console.table(report);
      if (unreadable.length > 0) {
        throw new Error(
          `Aborted: ${unreadable.length} secret(s) decrypt with neither key (${unreadable.join(", ")}). Nothing was changed.`,
        );
      }
      if (dryRun) throw new DryRun();

      for (const { column, row, value } of updates) {
        const result = await tx`
          update ${tx(column.table)}
             set ${tx(column.column)} = ${value}
           where tenant_id = ${row.tenantId}::uuid
             ${(column.keyColumns as readonly string[]).includes("provider") ? tx`and provider = ${row.provider}` : tx``}
             and ${tx(column.column)} = ${row.value}
        `;
        if (result.count !== 1)
          throw new Error(
            `Aborted: expected one updated row in ${column.table} for tenant ${row.tenantId}, got ${result.count}. Nothing was changed.`,
          );
      }

      // Verify before COMMIT: every stored secret must now decrypt with the
      // new key alone.
      for (const column of SECRET_COLUMNS) {
        for (const row of await readRows(tx, column, false)) {
          if (!readableWithKey(column, row, newKey))
            throw new Error(
              `Aborted: ${column.table} tenant ${row.tenantId} does not decrypt with DATA_ENCRYPTION_KEY after re-encryption. Nothing was changed.`,
            );
        }
      }
      console.log(
        `Verified every stored secret with DATA_ENCRYPTION_KEY. Re-encrypted ${updates.length}; committing.`,
      );
    });
  } catch (err) {
    if (err instanceof DryRun) {
      console.log("Dry run: no changes were made.");
      return;
    }
    throw err;
  } finally {
    await sql.end({ timeout: 5 });
  }
};

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : "Migration failed");
    process.exit(1);
  });
