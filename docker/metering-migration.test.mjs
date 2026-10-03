import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp, mkdir, cp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

test("existing installation upgrades metering without changing base consent or permissions", async (t) => {
  const client = new PGlite();
  t.after(() => client.close());
  const folder = "docker/migrations";
  const journal = JSON.parse(
    await readFile(`${folder}/meta/_journal.json`, "utf8"),
  );
  const old = await mkdtemp(join(tmpdir(), "metering-upgrade-"));
  t.after(() => rm(old, { recursive: true, force: true }));
  await mkdir(join(old, "meta"));
  const entries = journal.entries.filter((entry) => entry.idx < 13);
  await writeFile(
    join(old, "meta/_journal.json"),
    JSON.stringify({ ...journal, entries }),
  );
  for (const entry of entries)
    await cp(`${folder}/${entry.tag}.sql`, join(old, `${entry.tag}.sql`));
  const db = drizzle(client);
  await migrate(db, { migrationsFolder: old });
  const tid = "11111111-1111-1111-1111-111111111111";
  const tenant = (
    await client.query(
      "INSERT INTO tenants (name, tid, consented_at) VALUES ('Migration test', $1, now()) RETURNING id",
      [tid],
    )
  ).rows[0].id;
  await migrate(db, { migrationsFolder: folder });
  await migrate(db, { migrationsFolder: folder });
  const tables = [
    "metering_connections",
    "metering_consent_states",
    "metering_devices",
    "metering_history",
  ];
  for (const table of tables)
    assert.equal(
      (await client.query(`SELECT count(*) AS n FROM ${table}`)).rows[0].n,
      0,
    );
  assert.equal(
    (await client.query("SELECT tid FROM tenants WHERE id = $1", [tenant]))
      .rows[0].tid,
    tid,
  );
  const connection = (
    await client.query(
      "INSERT INTO metering_connections (tenant_id, tid) VALUES ($1, $2) RETURNING id",
      [tenant, tid],
    )
  ).rows[0].id;
  await client.query(
    "INSERT INTO metering_consent_states (state, tenant_id, connection_id, oid, tid) VALUES (gen_random_uuid(), $1, $2, 'test-admin', $3)",
    [tenant, connection, tid],
  );
  await client.query("DELETE FROM tenants WHERE id = $1", [tenant]);
  for (const table of tables)
    assert.equal(
      (await client.query(`SELECT count(*) AS n FROM ${table}`)).rows[0].n,
      0,
    );
});

test("metering migrations enable RLS with runtime access, tenant filtering and public-role denial", async (t) => {
  const client = new PGlite();
  t.after(() => client.close());
  await client.exec(
    "CREATE ROLE licensemeter_app; CREATE ROLE licensemeter_tenant; CREATE ROLE metering_api_test;",
  );
  await migrate(drizzle(client), { migrationsFolder: "docker/migrations" });
  const first = "11111111-1111-1111-1111-111111111111";
  const second = "22222222-2222-2222-2222-222222222222";
  await client.query(
    "INSERT INTO tenants (id, name) VALUES ($1, 'First'), ($2, 'Second')",
    [first, second],
  );
  await client.query(
    "INSERT INTO metering_connections (tenant_id, tid) VALUES ($1, 'first'), ($2, 'second')",
    [first, second],
  );
  const tables = [
    "metering_connections",
    "metering_consent_states",
    "metering_devices",
    "metering_history",
  ];
  for (const table of tables) {
    assert.equal(
      (
        await client.query(
          "SELECT relrowsecurity FROM pg_class WHERE relname = $1",
          [table],
        )
      ).rows[0].relrowsecurity,
      true,
    );
    assert.equal(
      (
        await client.query(
          "SELECT count(*) AS n FROM pg_policies WHERE tablename = $1",
          [table],
        )
      ).rows[0].n,
      2,
    );
  }
  await client.exec("SET ROLE licensemeter_app;");
  assert.equal(
    (await client.query("SELECT count(*) AS n FROM metering_connections"))
      .rows[0].n,
    2,
  );
  await client.exec("RESET ROLE; SET ROLE licensemeter_tenant;");
  await client.query("SELECT set_config('app.tenant_id', $1, false)", [first]);
  assert.deepEqual(
    (await client.query("SELECT tenant_id FROM metering_connections")).rows,
    [{ tenant_id: first }],
  );
  assert.equal(
    (
      await client.query(
        "UPDATE metering_connections SET revision = 10 WHERE tenant_id = $1 RETURNING tenant_id",
        [second],
      )
    ).rows.length,
    0,
  );
  await assert.rejects(
    client.query(
      "INSERT INTO metering_history (tenant_id, connection_id, device_id, day, payload) VALUES ($1, gen_random_uuid(), 'foreign', '2026-10-03', '{}')",
      [second],
    ),
    /row-level security/,
  );
  await client.exec(
    "RESET ROLE; GRANT USAGE ON SCHEMA public TO metering_api_test; GRANT SELECT ON metering_connections TO metering_api_test; SET ROLE metering_api_test;",
  );
  assert.equal(
    (await client.query("SELECT count(*) AS n FROM metering_connections"))
      .rows[0].n,
    0,
  );
  await client.exec("RESET ROLE;");
});
