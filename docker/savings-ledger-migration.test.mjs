import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

test("self-host migration and hosted script can coexist and preserve ledger retention and tenant policies", async (t) => {
  const client = new PGlite();
  t.after(() => client.close());
  await client.exec(
    "CREATE ROLE licensemeter_app; CREATE ROLE licensemeter_tenant; CREATE ROLE anon; CREATE ROLE authenticated",
  );
  await migrate(drizzle(client), { migrationsFolder: "docker/migrations" });
  const hosted = await readFile("scripts/db-add-savings-ledger.sql", "utf8");
  const indexAt = hosted.indexOf("CREATE INDEX CONCURRENTLY");
  assert.ok(indexAt > hosted.indexOf("COMMIT;"));
  const [schemaSql, checkSql] = hosted.slice(0, indexAt).split("COMMIT;");
  const validateAt = checkSql.indexOf("ALTER TABLE public.findings VALIDATE");
  const applyHosted = async () => {
    await client.exec(`${schemaSql}COMMIT;`);
    await client.exec(checkSql.slice(0, validateAt));
    await client.exec(checkSql.slice(validateAt));
    // Execute separately from the transaction and the validation, as on Postgres.
    await client.exec(hosted.slice(indexAt));
  };
  await client.exec("GRANT SELECT ON savings_ledger TO anon, authenticated");
  await applyHosted();
  for (const role of ["anon", "authenticated"]) {
    const { rows } = await client.query(
      "SELECT has_table_privilege($1, 'savings_ledger', 'SELECT') AS allowed",
      [role],
    );
    assert.equal(rows[0].allowed, false);
  }

  await client.exec(
    "DROP TABLE savings_ledger; DROP INDEX findings_tenant_resolved_at_idx; ALTER TABLE findings DROP COLUMN resolution_reason;",
  );
  await applyHosted();
  await applyHosted();
  const { rows: constraints } = await client.query(
    "SELECT conname, convalidated FROM pg_constraint WHERE conrelid = 'savings_ledger'::regclass OR conname = 'findings_resolution_reason_check'",
  );
  for (const name of [
    "findings_resolution_reason_check",
    "savings_ledger_tenant_id_tenants_id_fk",
    "savings_ledger_finding_id_findings_id_fk",
    "savings_ledger_seats_positive",
  ]) {
    assert.equal(
      constraints.find((constraint) => constraint.conname === name)
        ?.convalidated,
      true,
    );
  }
  const [{ id: tenant }] = (
    await client.query(
      "INSERT INTO tenants (name) VALUES ('Workspace') RETURNING id",
    )
  ).rows;
  const [{ id: finding, resolution_reason: reason }] = (
    await client.query(
      "INSERT INTO findings (tenant_id, dedupe_key, rule, title, status) VALUES ($1, 'fixture', 'shelfware', 'Idle seats', 'resolved') RETURNING id, resolution_reason",
      [tenant],
    )
  ).rows;
  assert.equal(reason, null);
  await client.query(
    "INSERT INTO savings_ledger (tenant_id, finding_id, rule, vendor, seats, monthly_cents, reason, currency, realized_at) VALUES ($1, $2, 'shelfware', 'Microsoft', 1, 100, 'seats_reduced', 'EUR', now())",
    [tenant, finding],
  );
  await client.exec("SET ROLE licensemeter_tenant");
  assert.equal(
    (await client.query("SELECT id FROM savings_ledger")).rows.length,
    0,
  );
  await client.query("SELECT set_config('app.tenant_id', $1, false)", [tenant]);
  assert.equal(
    (await client.query("SELECT id FROM savings_ledger")).rows.length,
    1,
  );
  await client.exec("RESET ROLE");
  await client.query("DELETE FROM findings WHERE id = $1", [finding]);
  assert.equal(
    (await client.query("SELECT finding_id FROM savings_ledger")).rows[0]
      .finding_id,
    null,
  );
  await client.query("DELETE FROM tenants WHERE id = $1", [tenant]);
  assert.equal(
    (await client.query("SELECT id FROM savings_ledger")).rows.length,
    0,
  );
});
