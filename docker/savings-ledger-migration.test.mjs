import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  const replacementConstraint =
    "savings_ledger_replaces_entry_id_savings_ledger_id_fk";
  const { rows: dockerConstraints } = await client.query(
    "SELECT conname FROM pg_constraint WHERE conrelid = 'savings_ledger'::regclass",
  );
  assert.ok(
    dockerConstraints.some((row) => row.conname === replacementConstraint),
  );
  const productColumn = async () =>
    (
      await client.query(
        "SELECT data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'savings_ledger' AND column_name = 'product'",
      )
    ).rows;
  const productShape = [{ data_type: "text", is_nullable: "YES" }];
  assert.deepEqual(await productColumn(), productShape);
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
  // Also upgrade the earlier hosted shape without replacing its table.
  await client.exec(
    "ALTER TABLE savings_ledger DROP COLUMN replaces_entry_id, DROP COLUMN product",
  );
  await client.exec("GRANT SELECT ON savings_ledger TO anon, authenticated");
  await applyHosted();
  assert.deepEqual(await productColumn(), productShape);
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
  assert.deepEqual(await productColumn(), productShape);
  const { rows: constraints } = await client.query(
    "SELECT conname, convalidated FROM pg_constraint WHERE conrelid = 'savings_ledger'::regclass OR conname = 'findings_resolution_reason_check'",
  );
  for (const name of [
    "findings_resolution_reason_check",
    "savings_ledger_tenant_id_tenants_id_fk",
    "savings_ledger_finding_id_findings_id_fk",
    "savings_ledger_seats_positive",
    replacementConstraint,
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
  const [{ id: original }] = (
    await client.query(
      "INSERT INTO savings_ledger (tenant_id, finding_id, rule, vendor, seats, monthly_cents, reason, currency, realized_at) VALUES ($1, $2, 'shelfware', 'Microsoft', 2, 200, 'seats_reduced', 'EUR', now()) RETURNING id",
      [tenant, finding],
    )
  ).rows;
  await client.query(
    "INSERT INTO savings_ledger (tenant_id, finding_id, replaces_entry_id, rule, vendor, seats, monthly_cents, reason, currency, realized_at) VALUES ($1, $2, $3, 'shelfware', 'Microsoft', 1, 100, 'seats_reduced', 'EUR', now())",
    [tenant, finding, original],
  );
  await client.exec("SET ROLE licensemeter_tenant");
  assert.equal(
    (await client.query("SELECT id FROM savings_ledger")).rows.length,
    0,
  );
  await client.query("SELECT set_config('app.tenant_id', $1, false)", [tenant]);
  assert.equal(
    (await client.query("SELECT id FROM savings_ledger")).rows.length,
    2,
  );
  await client.exec("RESET ROLE");
  await client.query("DELETE FROM savings_ledger WHERE id = $1", [original]);
  assert.deepEqual(
    (await client.query("SELECT replaces_entry_id FROM savings_ledger")).rows,
    [{ replaces_entry_id: null }],
  );
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

test("existing 0021 installation upgrades cleanly to 0022_savings_ledger", async (t) => {
  const client = new PGlite();
  t.after(() => client.close());
  const folder = "docker/migrations";
  const journal = JSON.parse(
    await readFile(`${folder}/meta/_journal.json`, "utf8"),
  );
  const old = await mkdtemp(join(tmpdir(), "savings-ledger-upgrade-"));
  t.after(() => rm(old, { recursive: true, force: true }));
  await mkdir(join(old, "meta"));
  const entries = journal.entries.filter((entry) => entry.idx < 22);
  await writeFile(
    join(old, "meta/_journal.json"),
    JSON.stringify({ ...journal, entries }),
  );
  for (const entry of entries) {
    await cp(`${folder}/${entry.tag}.sql`, join(old, `${entry.tag}.sql`));
  }
  const db = drizzle(client);
  await migrate(db, { migrationsFolder: old });
  await migrate(db, { migrationsFolder: folder });
  await migrate(db, { migrationsFolder: folder });

  const { rows: columns } = await client.query(
    "SELECT table_name, column_name FROM information_schema.columns WHERE (table_name = 'tenants' AND column_name = 'usage_report_unavailable') OR (table_name = 'consent_states' AND column_name = 'kind') OR (table_name = 'findings' AND column_name = 'resolution_reason') ORDER BY table_name, column_name",
  );
  assert.deepEqual(columns, [
    { table_name: "consent_states", column_name: "kind" },
    { table_name: "findings", column_name: "resolution_reason" },
    { table_name: "tenants", column_name: "usage_report_unavailable" },
  ]);
  const { rows: ledger } = await client.query(
    "SELECT to_regclass('public.savings_ledger') AS table_name",
  );
  assert.equal(ledger[0].table_name, "savings_ledger");
});
