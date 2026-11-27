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
      "SELECT table_name, column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND ((table_name = 'memberships' AND column_name = 'renewal_opt_out') OR (table_name = 'notification_addresses' AND column_name = 'renewal_alerts')) ORDER BY table_name, column_name",
    )
  ).rows;

const jobCheckOf = async (client) =>
  (
    await client.query(
      "SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'public.email_deliveries'::regclass AND conname = 'email_deliveries_job_check'",
    )
  ).rows.map((row) => row.def);

const ROLES =
  "CREATE ROLE licensemeter_app; CREATE ROLE licensemeter_tenant; CREATE ROLE anon; CREATE ROLE authenticated";

const insertDelivery = (client, tenantId, job, periodKey) =>
  client.query(
    "INSERT INTO email_deliveries (tenant_id, job, period_key, recipient, status) VALUES ($1, $2, $3, 'a@contoso.test', 'sent')",
    [tenantId, job, periodKey],
  );

test("self-host migration and hosted script produce the same renewal alert schema", async (t) => {
  const docker = new PGlite();
  t.after(() => docker.close());
  await docker.exec(ROLES);
  await migrate(drizzle(docker), { migrationsFolder: "docker/migrations" });
  const dockerColumns = await columnsOf(docker);
  assert.equal(dockerColumns.length, 2);
  const dockerCheck = await jobCheckOf(docker);
  assert.equal(dockerCheck.length, 1);
  assert.match(dockerCheck[0], /'renewal'/);

  // A hosted database before this release: undo what 0024 added, then run
  // the standalone script twice to prove it is idempotent.
  const hosted = await readFile("scripts/db-add-renewal-alerts.sql", "utf8");
  await docker.exec(
    "ALTER TABLE memberships DROP COLUMN renewal_opt_out; ALTER TABLE notification_addresses DROP COLUMN renewal_alerts; ALTER TABLE email_deliveries DROP CONSTRAINT email_deliveries_job_check; ALTER TABLE email_deliveries ADD CONSTRAINT email_deliveries_job_check CHECK (job in ('digest', 'report', 'leak'));",
  );
  await docker.exec(hosted);
  await docker.exec(hosted);
  assert.deepEqual(await columnsOf(docker), dockerColumns);
  assert.deepEqual(await jobCheckOf(docker), dockerCheck);
});

test("hosted script keeps existing rows and their values", async (t) => {
  const client = new PGlite();
  t.after(() => client.close());
  await client.exec(ROLES);
  await migrate(drizzle(client), { migrationsFolder: "docker/migrations" });
  await client.exec(
    "ALTER TABLE memberships DROP COLUMN renewal_opt_out; ALTER TABLE notification_addresses DROP COLUMN renewal_alerts; ALTER TABLE email_deliveries DROP CONSTRAINT email_deliveries_job_check; ALTER TABLE email_deliveries ADD CONSTRAINT email_deliveries_job_check CHECK (job in ('digest', 'report', 'leak'));",
  );
  const [tenant] = (
    await client.query(
      "INSERT INTO tenants (name) VALUES ('Existing') RETURNING id",
    )
  ).rows;
  await client.query(
    "INSERT INTO memberships (tenant_id, email, role, digest_opt_out) VALUES ($1, 'a@contoso.test', 'admin', true)",
    [tenant.id],
  );
  await client.query(
    "INSERT INTO notification_addresses (tenant_id, email, digest, report, leak_alerts) VALUES ($1, 'team@contoso.test', false, true, false)",
    [tenant.id],
  );
  await insertDelivery(client, tenant.id, "digest", "2026-W48");
  await insertDelivery(client, tenant.id, "leak", "2026-11-27T06:00:00.000Z");

  const hosted = await readFile("scripts/db-add-renewal-alerts.sql", "utf8");
  await client.exec(hosted);
  await client.exec(hosted);

  assert.deepEqual(
    (
      await client.query(
        "SELECT digest_opt_out, report_opt_out, renewal_opt_out FROM memberships",
      )
    ).rows,
    [{ digest_opt_out: true, report_opt_out: false, renewal_opt_out: false }],
  );
  assert.deepEqual(
    (
      await client.query(
        "SELECT digest, report, leak_alerts, renewal_alerts FROM notification_addresses",
      )
    ).rows,
    [{ digest: false, report: true, leak_alerts: false, renewal_alerts: true }],
  );
  assert.deepEqual(
    (
      await client.query(
        "SELECT job, period_key FROM email_deliveries ORDER BY job",
      )
    ).rows,
    [
      { job: "digest", period_key: "2026-W48" },
      { job: "leak", period_key: "2026-11-27T06:00:00.000Z" },
    ],
  );
});

test("renewal alert columns default safely and the ledger accepts renewal jobs only", async (t) => {
  const client = new PGlite();
  t.after(() => client.close());
  await client.exec(ROLES);
  await migrate(drizzle(client), { migrationsFolder: "docker/migrations" });
  const [tenant] = (
    await client.query(
      "INSERT INTO tenants (name) VALUES ('Workspace') RETURNING id, renewal_alerts",
    )
  ).rows;
  assert.equal(tenant.renewal_alerts, true);
  const [member] = (
    await client.query(
      "INSERT INTO memberships (tenant_id, email, role) VALUES ($1, 'a@contoso.test', 'admin') RETURNING renewal_opt_out",
      [tenant.id],
    )
  ).rows;
  assert.equal(member.renewal_opt_out, false);
  const [shared] = (
    await client.query(
      "INSERT INTO notification_addresses (tenant_id) VALUES ($1) RETURNING renewal_alerts",
      [tenant.id],
    )
  ).rows;
  assert.equal(shared.renewal_alerts, true);

  await insertDelivery(client, tenant.id, "renewal", "sku-1:2027-01-01:90");
  // The unique key keeps a second claim for the same threshold out.
  await assert.rejects(
    insertDelivery(client, tenant.id, "renewal", "sku-1:2027-01-01:90"),
  );
  await insertDelivery(client, tenant.id, "renewal", "sku-1:2027-01-01:60");
  await assert.rejects(
    insertDelivery(client, tenant.id, "exec_report", "2026-11"),
  );
});

test("existing 0023 installation upgrades cleanly to 0024_renewal_alerts", async (t) => {
  const client = new PGlite();
  t.after(() => client.close());
  const folder = "docker/migrations";
  const journal = JSON.parse(
    await readFile(`${folder}/meta/_journal.json`, "utf8"),
  );
  const old = await mkdtemp(join(tmpdir(), "renewal-alerts-upgrade-"));
  t.after(() => rm(old, { recursive: true, force: true }));
  await mkdir(join(old, "meta"));
  const entries = journal.entries.filter((entry) => entry.idx < 24);
  await writeFile(
    join(old, "meta/_journal.json"),
    JSON.stringify({ ...journal, entries }),
  );
  for (const entry of entries) {
    await cp(`${folder}/${entry.tag}.sql`, join(old, `${entry.tag}.sql`));
  }
  const db = drizzle(client);
  await migrate(db, { migrationsFolder: old });
  const [tenant] = (
    await client.query(
      "INSERT INTO tenants (name) VALUES ('Existing') RETURNING id",
    )
  ).rows;
  await client.query(
    "INSERT INTO memberships (tenant_id, email, role, report_opt_out) VALUES ($1, 'a@contoso.test', 'owner', true)",
    [tenant.id],
  );
  await insertDelivery(client, tenant.id, "report", "2026-10");
  await migrate(db, { migrationsFolder: folder });
  await migrate(db, { migrationsFolder: folder });
  assert.deepEqual(
    (
      await client.query(
        "SELECT report_opt_out, renewal_opt_out FROM memberships",
      )
    ).rows,
    [{ report_opt_out: true, renewal_opt_out: false }],
  );
  assert.equal(
    (await client.query("SELECT 1 FROM email_deliveries")).rows.length,
    1,
  );
  assert.equal((await columnsOf(client)).length, 2);
});
