import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

const columnsOf = async (client) =>
  (
    await client.query(
      "SELECT table_name, column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND ((table_name = 'tenants' AND column_name IN ('renewal_alerts', 'renewal_buffer_pct')) OR (table_name = 'vendor_renewals' AND column_name IN ('sku_ids', 'target_seats')) OR table_name = 'renewal_sku_terms') ORDER BY table_name, column_name",
    )
  ).rows;

const policiesOf = async (client) =>
  (
    await client.query(
      "SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'renewal_sku_terms' ORDER BY policyname",
    )
  ).rows.map((row) => row.policyname);

const constraintsOf = async (client) =>
  (
    await client.query(
      "SELECT conname FROM pg_constraint WHERE conname IN ('tenants_renewal_buffer_pct_range', 'vendor_renewals_target_seats_nonneg', 'renewal_sku_terms_term_check', 'renewal_sku_terms_tenant_id_tenants_id_fk', 'renewal_sku_terms_tenant_id_sku_id_pk') ORDER BY conname",
    )
  ).rows.map((row) => row.conname);

const ROLES =
  "CREATE ROLE licensemeter_app; CREATE ROLE licensemeter_tenant; CREATE ROLE anon; CREATE ROLE authenticated";

test("self-host migration and hosted script produce the same renewal plan schema", async (t) => {
  const docker = new PGlite();
  t.after(() => docker.close());
  await docker.exec(ROLES);
  await migrate(drizzle(docker), { migrationsFolder: "docker/migrations" });
  const dockerColumns = await columnsOf(docker);
  assert.equal(dockerColumns.length, 9);
  assert.deepEqual(await policiesOf(docker), ["app_all", "tenant_isolation"]);
  assert.equal((await constraintsOf(docker)).length, 5);

  // A hosted database before this release: drop what 0023 added, then run
  // the standalone script twice to prove it is idempotent.
  const hosted = await readFile("scripts/db-add-renewal-plan.sql", "utf8");
  await docker.exec(
    "DROP TABLE renewal_sku_terms; ALTER TABLE tenants DROP COLUMN renewal_alerts, DROP COLUMN renewal_buffer_pct; ALTER TABLE vendor_renewals DROP COLUMN sku_ids, DROP COLUMN target_seats;",
  );
  await docker.exec(hosted);
  await docker.exec(hosted);
  assert.deepEqual(await columnsOf(docker), dockerColumns);
  assert.deepEqual(await policiesOf(docker), ["app_all", "tenant_isolation"]);
  assert.equal((await constraintsOf(docker)).length, 5);
  for (const role of ["anon", "authenticated"]) {
    const { rows } = await docker.query(
      "SELECT has_table_privilege($1, 'renewal_sku_terms', 'SELECT') AS allowed",
      [role],
    );
    assert.equal(rows[0].allowed, false);
  }
});

test("renewal plan columns default safely and enforce their ranges and tenant isolation", async (t) => {
  const client = new PGlite();
  t.after(() => client.close());
  await client.exec(ROLES);
  await migrate(drizzle(client), { migrationsFolder: "docker/migrations" });
  const [tenant] = (
    await client.query(
      "INSERT INTO tenants (name) VALUES ('Workspace') RETURNING id, renewal_alerts, renewal_buffer_pct",
    )
  ).rows;
  assert.equal(tenant.renewal_alerts, true);
  assert.equal(tenant.renewal_buffer_pct, 5);
  await assert.rejects(
    client.query("UPDATE tenants SET renewal_buffer_pct = 51 WHERE id = $1", [
      tenant.id,
    ]),
  );
  await assert.rejects(
    client.query("UPDATE tenants SET renewal_buffer_pct = -1 WHERE id = $1", [
      tenant.id,
    ]),
  );
  await client.query(
    "UPDATE tenants SET renewal_buffer_pct = 50 WHERE id = $1",
    [tenant.id],
  );

  const [renewal] = (
    await client.query(
      "INSERT INTO vendor_renewals (tenant_id, vendor, contract_name, renewal_date) VALUES ($1, 'Microsoft', 'EA', '2027-01-01') RETURNING sku_ids, target_seats",
      [tenant.id],
    )
  ).rows;
  assert.deepEqual(renewal.sku_ids, []);
  assert.equal(renewal.target_seats, null);
  await assert.rejects(
    client.query(
      "INSERT INTO vendor_renewals (tenant_id, vendor, contract_name, renewal_date, target_seats) VALUES ($1, 'Adobe', 'VIP', '2027-01-01', -1)",
      [tenant.id],
    ),
  );

  await client.query(
    "INSERT INTO renewal_sku_terms (tenant_id, sku_id, term) VALUES ($1, 'sku-1', 'monthly')",
    [tenant.id],
  );
  const [term] = (
    await client.query("SELECT monthly_alerts FROM renewal_sku_terms")
  ).rows;
  assert.equal(term.monthly_alerts, false);
  await assert.rejects(
    client.query(
      "INSERT INTO renewal_sku_terms (tenant_id, sku_id, term) VALUES ($1, 'sku-2', 'quarterly')",
      [tenant.id],
    ),
  );

  await client.exec("SET ROLE licensemeter_tenant");
  assert.equal(
    (await client.query("SELECT sku_id FROM renewal_sku_terms")).rows.length,
    0,
  );
  await client.query("SELECT set_config('app.tenant_id', $1, false)", [
    tenant.id,
  ]);
  assert.equal(
    (await client.query("SELECT sku_id FROM renewal_sku_terms")).rows.length,
    1,
  );
  await client.exec("RESET ROLE");
  await client.query("DELETE FROM tenants WHERE id = $1", [tenant.id]);
  assert.equal(
    (await client.query("SELECT sku_id FROM renewal_sku_terms")).rows.length,
    0,
  );
});

test("existing 0022 installation upgrades cleanly to 0023_renewal_plan", async (t) => {
  const client = new PGlite();
  t.after(() => client.close());
  const folder = "docker/migrations";
  const journal = JSON.parse(
    await readFile(`${folder}/meta/_journal.json`, "utf8"),
  );
  const old = await mkdtemp(join(tmpdir(), "renewal-plan-upgrade-"));
  t.after(() => rm(old, { recursive: true, force: true }));
  await mkdir(join(old, "meta"));
  const entries = journal.entries.filter((entry) => entry.idx < 23);
  await writeFile(
    join(old, "meta/_journal.json"),
    JSON.stringify({ ...journal, entries }),
  );
  for (const entry of entries) {
    await cp(`${folder}/${entry.tag}.sql`, join(old, `${entry.tag}.sql`));
  }
  const db = drizzle(client);
  await migrate(db, { migrationsFolder: old });
  await client.query("INSERT INTO tenants (name) VALUES ('Existing')");
  await migrate(db, { migrationsFolder: folder });
  await migrate(db, { migrationsFolder: folder });
  const { rows } = await client.query(
    "SELECT renewal_alerts, renewal_buffer_pct FROM tenants",
  );
  assert.deepEqual(rows, [{ renewal_alerts: true, renewal_buffer_pct: 5 }]);
  assert.equal((await columnsOf(client)).length, 9);
});
