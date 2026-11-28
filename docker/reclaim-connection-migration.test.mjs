import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

const TABLES = ["reclaim_connections", "reclaim_consent_states"];
const IN = TABLES.map((t) => `'${t}'`).join(", ");

const columnsOf = async (client) =>
  (
    await client.query(
      `SELECT table_name, column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name IN (${IN}) ORDER BY table_name, column_name`,
    )
  ).rows;

const policiesOf = async (client) =>
  (
    await client.query(
      `SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public' AND tablename IN (${IN}) ORDER BY tablename, policyname`,
    )
  ).rows.map((row) => `${row.tablename}.${row.policyname}`);

const constraintsOf = async (client) =>
  (
    await client.query(
      "SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid IN ('public.reclaim_connections'::regclass, 'public.reclaim_consent_states'::regclass) ORDER BY conname",
    )
  ).rows;

const rlsOf = async (client) =>
  (
    await client.query(
      `SELECT relname, relrowsecurity FROM pg_class WHERE relname IN (${IN}) ORDER BY relname`,
    )
  ).rows.map((r) => r.relrowsecurity);

const EXPECTED_POLICIES = [
  "reclaim_connections.app_all",
  "reclaim_connections.tenant_isolation",
  "reclaim_consent_states.app_all",
  "reclaim_consent_states.tenant_isolation",
];

const ROLES =
  "CREATE ROLE licensemeter_app; CREATE ROLE licensemeter_tenant; CREATE ROLE anon; CREATE ROLE authenticated";

test("self-host migration and hosted script produce the same reclaim schema", async (t) => {
  const docker = new PGlite();
  t.after(() => docker.close());
  await docker.exec(ROLES);
  await migrate(drizzle(docker), { migrationsFolder: "docker/migrations" });
  const dockerColumns = await columnsOf(docker);
  const dockerConstraints = await constraintsOf(docker);
  assert.equal(dockerColumns.length, 20);
  assert.deepEqual(await policiesOf(docker), EXPECTED_POLICIES);
  assert.deepEqual(await rlsOf(docker), [true, true]);

  // A hosted database before this release: drop what 0026 added, then run
  // the standalone script twice to prove it is idempotent.
  const hosted = await readFile(
    "scripts/db-add-reclaim-connection.sql",
    "utf8",
  );
  await docker.exec(
    "DROP TABLE reclaim_consent_states; DROP TABLE reclaim_connections;",
  );
  await docker.exec(hosted);
  await docker.exec(hosted);
  assert.deepEqual(await columnsOf(docker), dockerColumns);
  assert.deepEqual(await constraintsOf(docker), dockerConstraints);
  assert.deepEqual(await policiesOf(docker), EXPECTED_POLICIES);
  assert.deepEqual(await rlsOf(docker), [true, true]);
  for (const role of ["anon", "authenticated"]) {
    for (const table of TABLES) {
      const { rows } = await docker.query(
        "SELECT has_table_privilege($1, $2, 'SELECT') AS allowed",
        [role, table],
      );
      assert.equal(rows[0].allowed, false, `${role} on ${table}`);
    }
  }
});

test("reclaim connection constraints hold and stay tenant isolated", async (t) => {
  const client = new PGlite();
  t.after(() => client.close());
  await client.exec(ROLES);
  await migrate(drizzle(client), { migrationsFolder: "docker/migrations" });
  const [tenant, other] = (
    await client.query(
      "INSERT INTO tenants (name) VALUES ('Workspace'), ('Other') RETURNING id",
    )
  ).rows;
  const insert = (tenantId, cols, values) =>
    client.query(
      `INSERT INTO reclaim_connections (tenant_id, tid, ${cols.join(", ")}) VALUES ($1, 'tid', ${values.map((_, i) => `$${i + 2}`).join(", ")}) RETURNING id, approval_mode`,
      [tenantId, ...values],
    );
  const [managed] = (await insert(tenant.id, ["mode"], ["managed"])).rows;
  assert.equal(managed.approval_mode, "two_person");
  // A managed row never carries a credential, a BYO row always does.
  await assert.rejects(
    insert(other.id, ["mode", "app_client_id"], ["managed", "app"]),
  );
  await assert.rejects(insert(other.id, ["mode"], ["byo"]));
  await assert.rejects(insert(other.id, ["mode"], ["write"]));
  await assert.rejects(
    insert(other.id, ["mode", "approval_mode"], ["managed", "nobody"]),
  );
  await insert(
    other.id,
    ["mode", "app_client_id", "cred_type", "secret_enc"],
    ["byo", "app", "secret", "enc"],
  );
  await client.query(
    "INSERT INTO reclaim_consent_states (state, tenant_id, connection_id, oid, tid) VALUES (gen_random_uuid(), $1, $2, 'oid', 'tid')",
    [tenant.id, managed.id],
  );

  await client.exec("SET ROLE licensemeter_tenant");
  for (const table of TABLES) {
    assert.equal(
      (await client.query(`SELECT tenant_id FROM ${table}`)).rows.length,
      0,
      `${table} hidden without a tenant`,
    );
  }
  await client.query("SELECT set_config('app.tenant_id', $1, false)", [
    tenant.id,
  ]);
  assert.equal(
    (await client.query("SELECT id FROM reclaim_connections")).rows.length,
    1,
  );
  await client.exec("RESET ROLE");
  // Deleting the connection drops its pending consent states.
  await client.query("DELETE FROM reclaim_connections WHERE tenant_id = $1", [
    tenant.id,
  ]);
  assert.equal(
    (await client.query("SELECT state FROM reclaim_consent_states")).rows
      .length,
    0,
  );
});

test("existing 0025 installation upgrades cleanly to 0026", async (t) => {
  const client = new PGlite();
  t.after(() => client.close());
  const folder = "docker/migrations";
  const journal = JSON.parse(
    await readFile(`${folder}/meta/_journal.json`, "utf8"),
  );
  const old = await mkdtemp(join(tmpdir(), "reclaim-connection-upgrade-"));
  t.after(() => rm(old, { recursive: true, force: true }));
  await mkdir(join(old, "meta"));
  const entries = journal.entries.filter((entry) => entry.idx < 26);
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
  assert.equal((await columnsOf(client)).length, 20);
  assert.equal(
    (await client.query("SELECT name FROM tenants")).rows[0].name,
    "Existing",
  );
});
