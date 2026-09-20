import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, mkdir, cp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

const folder = "docker/migrations";
const upgrade = await readFile(
  `${folder}/0011_retire_legacy_identity.sql`,
  "utf8",
);
const journal = JSON.parse(
  await readFile(`${folder}/meta/_journal.json`, "utf8"),
);

async function baseline(t) {
  const client = new PGlite();
  t.after(() => client.close());
  const old = await mkdtemp(join(tmpdir(), "identity-migration-"));
  t.after(() => rm(old, { recursive: true, force: true }));
  await mkdir(join(old, "meta"));
  const { writeFile } = await import("node:fs/promises");
  const entries = journal.entries.filter((entry) => entry.idx < 10);
  await writeFile(
    join(old, "meta/_journal.json"),
    JSON.stringify({ ...journal, entries }),
  );
  for (const entry of entries)
    await cp(`${folder}/${entry.tag}.sql`, join(old, `${entry.tag}.sql`));
  const db = drizzle(client);
  await migrate(db, { migrationsFolder: old });
  const tenant = (
    await client.query(
      "INSERT INTO tenants (name) VALUES ('Upgrade test') RETURNING id",
    )
  ).rows[0].id;
  return { client, db, tenant };
}

test("fresh installations and repeated migration runs have only Microsoft identity fields", async (t) => {
  const client = new PGlite();
  t.after(() => client.close());
  const db = drizzle(client);
  await migrate(db, { migrationsFolder: folder });
  await migrate(db, { migrationsFolder: folder });
  assert.equal(
    (
      await client.query(
        "SELECT column_name FROM information_schema.columns WHERE column_name LIKE '%workos%'",
      )
    ).rows.length,
    0,
  );
  assert.equal(
    (
      await client.query(
        "SELECT to_regclass('membership_claims') AS table_name",
      )
    ).rows[0].table_name,
    null,
  );
});

for (const [name, fixture, message] of [
  [
    "unmapped membership",
    "INSERT INTO memberships (tenant_id, email, role, workos_user_id) VALUES ($1, 'member@example.test', 'owner', 'old-member')",
    "Unmapped memberships remain",
  ],
  [
    "unmapped MSP owner",
    "INSERT INTO msp_accounts (id, owner_workos_user_id) VALUES ($1, 'old-owner')",
    "Unmapped MSP owners remain",
  ],
  [
    "pending request without Microsoft identity",
    "INSERT INTO join_requests (tenant_id, email, workos_user_id) VALUES ($1, 'member@example.test', 'old-member')",
    "Pending requests without Microsoft identities remain",
  ],
]) {
  test(`upgrade refuses ${name} without dropping fields or claim tokens`, async (t) => {
    const { client, db, tenant } = await baseline(t);
    await client.query(fixture, [tenant]);
    await client.exec(
      "INSERT INTO membership_claims (email, token_hash, requested_by_oid, requested_by_tid, expires_at) VALUES ('member@example.test', 'hash', 'oid', 'tid', now() + interval '1 hour')",
    );
    await assert.rejects(migrate(db, { migrationsFolder: folder }), (err) => {
      assert.match(String(err.cause ?? err), new RegExp(message));
      return true;
    });
    assert.equal(
      (await client.query("SELECT count(*)::int AS n FROM membership_claims"))
        .rows[0].n,
      1,
    );
    assert.equal(
      (
        await client.query(
          "SELECT count(*)::int AS n FROM information_schema.columns WHERE column_name LIKE '%workos%'",
        )
      ).rows[0].n,
      5,
    );
    assert.equal(
      (
        await client.query(
          "SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations",
        )
      ).rows[0].n,
      10,
    );
  });
}

test("upgrade retains linked memberships, MSP ownership, paid access and historical records", async (t) => {
  const { client, db, tenant } = await baseline(t);
  await client.query(
    "INSERT INTO msp_accounts (id, owner_workos_user_id, owner_oid) VALUES ($1, 'old-owner', 'ms-owner')",
    [tenant],
  );
  await client.query(
    "UPDATE tenants SET msp_account_id = $1, workos_org_id = 'old-org' WHERE id = $1",
    [tenant],
  );
  await client.query(
    "INSERT INTO memberships (tenant_id, email, role, oid, workos_user_id) VALUES ($1, 'owner@example.test', 'owner', 'ms-owner', 'old-owner'), ($1, 'invite@example.test', 'admin', NULL, NULL)",
    [tenant],
  );
  await client.query(
    "INSERT INTO entitlements (msp_account_id, plan, source, status, quantity) VALUES ($1, 'msp', 'polar', 'active', 5)",
    [tenant],
  );
  await client.query(
    "INSERT INTO join_requests (tenant_id, email, workos_user_id, status) VALUES ($1, 'old@example.test', 'old-declined', 'declined')",
    [tenant],
  );
  await client.query(
    "INSERT INTO dpa_acceptances (tenant_id, version, language, accepted_by_key, accepted_by_email) VALUES ($1, '1.2', 'en', 'old-owner', 'owner@example.test')",
    [tenant],
  );
  await migrate(db, { migrationsFolder: folder });
  await migrate(db, { migrationsFolder: folder });
  assert.deepEqual(
    (await client.query("SELECT oid, role FROM memberships ORDER BY email"))
      .rows,
    [
      { oid: null, role: "admin" },
      { oid: "ms-owner", role: "owner" },
    ],
  );
  assert.deepEqual(
    (await client.query("SELECT owner_oid FROM msp_accounts")).rows,
    [{ owner_oid: "ms-owner" }],
  );
  assert.deepEqual(
    (await client.query("SELECT msp_account_id FROM tenants")).rows,
    [{ msp_account_id: tenant }],
  );
  assert.deepEqual(
    (await client.query("SELECT plan, status, quantity FROM entitlements"))
      .rows,
    [{ plan: "msp", status: "active", quantity: 5 }],
  );
  assert.deepEqual(
    (await client.query("SELECT accepted_by_key FROM dpa_acceptances")).rows,
    [{ accepted_by_key: "old-owner" }],
  );
  assert.deepEqual(
    (await client.query("SELECT status FROM join_requests")).rows,
    [{ status: "declined" }],
  );
});

test("hosted upgrade uses the same guarded SQL in an explicit transaction", async () => {
  const hosted = await readFile(
    "scripts/db-retire-legacy-identity.sql",
    "utf8",
  );
  assert.equal(
    hosted.slice(hosted.indexOf("BEGIN;\n")),
    `BEGIN;\n${upgrade}COMMIT;\n`,
  );
});
