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
