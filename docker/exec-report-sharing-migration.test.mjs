import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

const TABLES = ["report_recipients", "report_share_links"];

const columnsOf = async (client) =>
  (
    await client.query(
      "SELECT table_name, column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name IN ('report_share_links', 'report_recipients') ORDER BY table_name, column_name",
    )
  ).rows;

const policiesOf = async (client) =>
  (
    await client.query(
      "SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('report_share_links', 'report_recipients') ORDER BY tablename, policyname",
    )
  ).rows.map((row) => `${row.tablename}.${row.policyname}`);

const constraintsOf = async (client) =>
  (
    await client.query(
      "SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid IN ('public.report_share_links'::regclass, 'public.report_recipients'::regclass) ORDER BY conname",
    )
  ).rows;

const indexesOf = async (client) =>
  (
    await client.query(
      "SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename IN ('report_share_links', 'report_recipients') ORDER BY indexname",
    )
  ).rows;

const rlsOf = async (client) =>
  (
    await client.query(
      "SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('report_share_links', 'report_recipients') ORDER BY relname",
    )
  ).rows;

const jobCheck = async (client) =>
  (
    await client.query(
      "SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'email_deliveries_job_check'",
    )
  ).rows[0]?.def;

const EXPECTED_POLICIES = [
  "report_recipients.app_all",
  "report_recipients.tenant_isolation",
  "report_share_links.app_all",
  "report_share_links.tenant_isolation",
];

const ROLES =
  "CREATE ROLE licensemeter_app; CREATE ROLE licensemeter_tenant; CREATE ROLE anon; CREATE ROLE authenticated";

test("self-host migration and hosted script produce the same sharing schema", async (t) => {
  const docker = new PGlite();
  t.after(() => docker.close());
  await docker.exec(ROLES);
  await migrate(drizzle(docker), { migrationsFolder: "docker/migrations" });
  const dockerColumns = await columnsOf(docker);
  const dockerConstraints = await constraintsOf(docker);
  const dockerIndexes = await indexesOf(docker);
  assert.equal(dockerColumns.length, 25);
  assert.deepEqual(await policiesOf(docker), EXPECTED_POLICIES);
  assert.deepEqual(
    (await rlsOf(docker)).map((r) => r.relrowsecurity),
    [true, true],
  );
  assert.match(await jobCheck(docker), /'exec_report'/);

  // A hosted database before this release: drop what 0025 added and put the
  // job check back to the #189 list, then run the standalone script twice to
  // prove it is idempotent.
  const hosted = await readFile(
    "scripts/db-add-exec-report-sharing.sql",
    "utf8",
  );
  await docker.exec(
    `DROP TABLE report_share_links; DROP TABLE report_recipients;
     ALTER TABLE email_deliveries DROP CONSTRAINT email_deliveries_job_check;
     ALTER TABLE email_deliveries ADD CONSTRAINT email_deliveries_job_check CHECK (job in ('digest', 'report', 'leak', 'renewal'));`,
  );
  const [tenant] = (
    await docker.query(
      "INSERT INTO tenants (name) VALUES ('Hosted') RETURNING id",
    )
  ).rows;
  await docker.query(
    "INSERT INTO email_deliveries (tenant_id, job, period_key, recipient, status) VALUES ($1, 'renewal', 'k', 'a@b.example', 'sent')",
    [tenant.id],
  );
  await docker.exec(hosted);
  await docker.exec(hosted);
  assert.deepEqual(await columnsOf(docker), dockerColumns);
  assert.deepEqual(await constraintsOf(docker), dockerConstraints);
  assert.deepEqual(await indexesOf(docker), dockerIndexes);
  assert.deepEqual(await policiesOf(docker), EXPECTED_POLICIES);
  assert.deepEqual(
    (await rlsOf(docker)).map((r) => r.relrowsecurity),
    [true, true],
  );
  assert.match(await jobCheck(docker), /'exec_report'/);
  assert.match(await jobCheck(docker), /'renewal'/);
  // The existing delivery row survived unchanged.
  const { rows } = await docker.query(
    "SELECT job, status FROM email_deliveries",
  );
  assert.deepEqual(rows, [{ job: "renewal", status: "sent" }]);
  for (const role of ["anon", "authenticated"]) {
    for (const table of TABLES) {
      const { rows: grant } = await docker.query(
        "SELECT has_table_privilege($1, $2, 'SELECT') AS allowed",
        [role, table],
      );
      assert.equal(grant[0].allowed, false, `${role} on ${table}`);
    }
  }
});

test("share link and recipient constraints hold and stay tenant isolated", async (t) => {
  const client = new PGlite();
  t.after(() => client.close());
  await client.exec(ROLES);
  await migrate(drizzle(client), { migrationsFolder: "docker/migrations" });
  const [tenant] = (
    await client.query(
      "INSERT INTO tenants (name) VALUES ('Workspace') RETURNING id",
    )
  ).rows;
  const insertLink = (values) =>
    client.query(
      "INSERT INTO report_share_links (tenant_id, token_hash, token_prefix, label, mode, period_key, snapshot_payload, created_by_key, expires_at) VALUES ($1, $2, 'lmr_abc', 'CFO', $3, '2026-11', $4, 'oid', now() + $5::interval) RETURNING view_count, revoked_at",
      [
        tenant.id,
        values.hash,
        values.mode,
        values.payload,
        values.ttl ?? "30 days",
      ],
    );
  const [link] = (await insertLink({ hash: "h1", mode: "live", payload: null }))
    .rows;
  assert.equal(link.view_count, 0);
  assert.equal(link.revoked_at, null);
  await insertLink({ hash: "h2", mode: "snapshot", payload: { v: 1 } });
  // A live link carries no payload, a snapshot always carries one.
  await assert.rejects(
    insertLink({ hash: "h3", mode: "live", payload: { v: 1 } }),
  );
  await assert.rejects(
    insertLink({ hash: "h4", mode: "snapshot", payload: null }),
  );
  await assert.rejects(
    insertLink({ hash: "h5", mode: "public", payload: null }),
  );
  await assert.rejects(insertLink({ hash: "h1", mode: "live", payload: null }));
  await assert.rejects(
    insertLink({ hash: "h6", mode: "live", payload: null, ttl: "-1 day" }),
  );

  const insertRecipient = (kind, email) =>
    client.query(
      "INSERT INTO report_recipients (tenant_id, kind, email) VALUES ($1, $2, $3)",
      [tenant.id, kind, email],
    );
  await insertRecipient("finance", "cfo@example.com");
  await insertRecipient("client", "cfo@example.com");
  await assert.rejects(insertRecipient("finance", "cfo@example.com"));
  await assert.rejects(insertRecipient("board", "board@example.com"));

  await client.query(
    "INSERT INTO email_deliveries (tenant_id, job, period_key, recipient, status) VALUES ($1, 'exec_report', '2026-10', 'cfo@example.com', 'claimed')",
    [tenant.id],
  );
  await assert.rejects(
    client.query(
      "INSERT INTO email_deliveries (tenant_id, job, period_key, recipient, status) VALUES ($1, 'client_report', '2026-10', 'cfo@example.com', 'claimed')",
      [tenant.id],
    ),
  );

  await client.exec("SET ROLE licensemeter_tenant");
  for (const table of TABLES) {
    assert.equal(
      (await client.query(`SELECT id FROM ${table}`)).rows.length,
      0,
      `${table} hidden without a tenant`,
    );
  }
  await client.query("SELECT set_config('app.tenant_id', $1, false)", [
    tenant.id,
  ]);
  assert.equal(
    (await client.query("SELECT id FROM report_share_links")).rows.length,
    2,
  );
  assert.equal(
    (await client.query("SELECT id FROM report_recipients")).rows.length,
    2,
  );
  await client.exec("RESET ROLE");
  await client.query("DELETE FROM tenants WHERE id = $1", [tenant.id]);
  for (const table of TABLES) {
    assert.equal(
      (await client.query(`SELECT id FROM ${table}`)).rows.length,
      0,
    );
  }
});

test("existing 0024 installation upgrades cleanly to 0025", async (t) => {
  const client = new PGlite();
  t.after(() => client.close());
  const folder = "docker/migrations";
  const journal = JSON.parse(
    await readFile(`${folder}/meta/_journal.json`, "utf8"),
  );
  const old = await mkdtemp(join(tmpdir(), "exec-report-sharing-upgrade-"));
  t.after(() => rm(old, { recursive: true, force: true }));
  await mkdir(join(old, "meta"));
  const entries = journal.entries.filter((entry) => entry.idx < 25);
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
    "INSERT INTO email_deliveries (tenant_id, job, period_key, recipient, status) VALUES ($1, 'renewal', 'k', 'a@b.example', 'sent')",
    [tenant.id],
  );
  await migrate(db, { migrationsFolder: folder });
  await migrate(db, { migrationsFolder: folder });
  assert.equal((await columnsOf(client)).length, 25);
  const { rows } = await client.query("SELECT job FROM email_deliveries");
  assert.deepEqual(rows, [{ job: "renewal" }]);
  assert.match(await jobCheck(client), /'exec_report'/);
});
