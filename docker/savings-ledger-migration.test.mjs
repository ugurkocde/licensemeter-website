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
    "CREATE ROLE licensemeter_app; CREATE ROLE licensemeter_tenant",
  );
  await migrate(drizzle(client), { migrationsFolder: "docker/migrations" });
  const hosted = await readFile("scripts/db-add-savings-ledger.sql", "utf8");
  await client.exec(hosted);
  await client.exec(hosted);
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
    "INSERT INTO savings_ledger (tenant_id, finding_id, rule, vendor, monthly_cents, reason, currency, realized_at) VALUES ($1, $2, 'shelfware', 'Microsoft', 100, 'seats_reduced', 'EUR', now())",
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
