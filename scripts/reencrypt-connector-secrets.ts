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
 * clean dry run), 1 on any error or rollback. The hosted service runs the same
 * migration in its daily retention job (src/server/secretMigration.ts), so the
 * script is for installs that cannot wait for it or run without that job.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { deriveKey } from "../src/server/cryptoCore";
import type { Db } from "../src/server/db";
import { resolvePostgresSsl } from "../src/server/db/ssl";
import { reencryptSecrets } from "../src/server/secretReencryption";

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

  // TLS is required unless SELF_HOSTED=true (a self-hosted install's bundled
  // database has no TLS); localhost is always allowed.
  const ssl = resolvePostgresSsl(databaseUrl, {
    enforce: process.env.SELF_HOSTED !== "true",
  });
  const client = postgres(databaseUrl, {
    max: 1,
    prepare: false,
    ...(ssl ? { ssl } : {}),
  });

  try {
    const result = await reencryptSecrets(
      drizzle(client) as unknown as Db,
      { oldKey: deriveKey(authSecret), newKey: deriveKey(dataKey) },
      { dryRun },
    );
    console.table(result.columns);
    console.log(
      result.dryRun
        ? "Dry run: no changes were made."
        : `Verified every stored secret with DATA_ENCRYPTION_KEY. Re-encrypted ${result.reencrypted}; committed.`,
    );
  } finally {
    await client.end({ timeout: 5 });
  }
};

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : "Migration failed");
    process.exit(1);
  });
