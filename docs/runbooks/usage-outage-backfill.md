# Restore activity after the November 2026 usage-report outage

## Prerequisites

- The repository owner runs the production repair through the release gate.
  During development, run the tool against local fixtures or an isolated local
  restore.
- Through the release gate, apply `scripts/db-add-usage-report-unavailable.sql`
  to production, then merge and deploy [PR #176](https://github.com/ugurkocde/licensemeter-website/pull/176).
  Before applying the repair, also deploy the app version from this stack that
  shares the tenant lock with the backfill. Wait for invocations of the prior
  app version to finish.
- Use Node.js 24 and install dependencies with `npm ci --ignore-scripts`.
  Plan production execution outside the nightly `/api/cron/sync` window,
  which starts at **03:00 UTC**. Verify the nightly sync has finished if
  running later that morning.
- Keep connection strings, backups, exports, and reports private and outside
  the checkout. Use a new directory with restricted permissions.

## Get and restore the pre-outage snapshot

In the Supabase Dashboard, go to **Database > Backups** and choose the last
backup from before the outage. Pro retains seven days of daily backups, so the
2026-11-20 backup expires around **2026-11-27**, depending on the backup time.
Preserve the backup before then. Restore it into a separate database or project. Leave production in place. [Supabase database backups](https://supabase.com/docs/guides/platform/backups)

For a PostgreSQL archive already downloaded, create a fresh database on the
local server. Use client tools compatible with the backup's PostgreSQL
version. These examples assume your local client credentials are already
configured.

```bash
createdb -h 127.0.0.1 usage_pre_outage
pg_restore --list pre-outage.dump
pg_restore --exit-on-error --no-owner --no-privileges --schema=public \
  --dbname=postgresql://127.0.0.1/usage_pre_outage pre-outage.dump
```

For a logical `.sql.gz` backup, use `gzip -dc` and `psql -X -v ON_ERROR_STOP=1`
against a fresh local database with the required Supabase roles and extensions.
Use the Supabase local restoration instructions for its logical dump format.
[Restore a downloaded backup locally](https://supabase.com/docs/guides/local-development/restoring-downloaded-backup)

For a physical backup without a download option, use **Restore to a New
Project** for the pre-outage date. Review the source for scheduled jobs and network-capable extensions
before cloning. Those jobs can run as soon as the clone is restored. Use an
isolated logical restore when you need to inspect or disable them before they
can run. Export the snapshot from that
separate project, then pass the resulting local file to the script. Always
select a fresh database or a separate project as the restore destination.
[Restore to a new project](https://supabase.com/docs/guides/platform/clone-project)

## Export the snapshot

Use the file as the backfill source. In a private directory, point
`SNAPSHOT_DATABASE_URL` at the separate pre-outage restore and run the
export below. Substitute the tenant IDs from the incident scope or omit the
tenant predicate to export all tenants. The tool accepts this JSON array or
one JSON object with the same columns per line.

```bash
umask 077
mkdir -p "$HOME/.local/state/licensemeter-usage-backfill"
export BACKFILL_DIR="$HOME/.local/state/licensemeter-usage-backfill"
psql -X -qAt -v ON_ERROR_STOP=1 "$SNAPSHOT_DATABASE_URL" > "$BACKFILL_DIR/pre-outage.json" <<'SQL'
BEGIN READ ONLY;
SET LOCAL row_security = off;
SELECT coalesce(json_agg(s ORDER BY s.tenant_id, s.graph_id), '[]'::json)
FROM (
  SELECT tenant_id, graph_id, workload_activity, last_activity, synced_at
  FROM public.tenant_users
  WHERE tenant_id IN ('11111111-1111-4111-8111-000000000001'::uuid)
    AND synced_at < TIMESTAMPTZ '2026-11-21 00:00:00+00'
) AS s;
COMMIT;
SQL
unset SNAPSHOT_DATABASE_URL
```

As an alternative, pass the separate restore via `SNAPSHOT_DATABASE_URL`
and omit `--snapshot-file`. That connection always uses a read-only transaction.
Source selection prefers the database, then the file, then the explicit
`--source findings` fallback. The fallback recovers only last activity
recorded by pre-outage inactivity findings. Use the file if the two connection
strings share a hostname, port, and database name, as can happen with Supabase
pooler hosts. Verify the project references in the Dashboard when setting up a
database source because direct and pooler hosts for one project can differ.

## Optional rehearsal

Restore a **current** production backup to a separate local database and
make sure it has the #176 schema change. Set `DATABASE_URL` to that local
target and run the production commands below with the same snapshot file and
tenant scope. Omit `--confirm-target-host` for loopback and use a different
report filename for the rehearsal. For a local PGlite rehearsal, unset
`DATABASE_URL`, stop any app using the store and copy the entire
`.pglite/data` directory before applying.

## Production dry run and apply

1. In **Supabase Dashboard > Connect**, copy the **Direct connection** or
   **Session pooler** Postgres URI for the production project, using the
   `postgres` database password. The session pooler username is
   `postgres.<project-ref>`. Use the session pooler if direct IPv6
   connectivity is unavailable. Select one of those two connection modes
   for these commands and for verification and rollback. Set `DATABASE_URL`
   in a private shell without printing or recording the URI. Use
   `sslmode=verify-full` and the trusted CA from the Dashboard if needed
   (`NODE_EXTRA_CA_CERTS` for Node.js and `PGSSLROOTCERT` for `psql`).
   The script accepts only the `sslmode` URL parameter and prints the
   selected hostname and database name to stderr before connecting.
   [Supabase Postgres connections](https://supabase.com/docs/guides/database/connecting-to-postgres)

   The repository grants `licensemeter_app` a permissive `app_all` policy.
   Tenant-scoped requests can switch to `licensemeter_tenant`, whose
   policies require the transaction-local `app.tenant_id`. Maintenance
   uses the database owner with cross-tenant visibility, so it needs no
   tenant session setting. The script sets `row_security = off` locally
   in the transaction so a role subject to RLS fails instead of silently
   returning filtered rows.

2. From the repository root, preview and review one affected tenant at a
   time. Replace the fake hostname with the exact hostname from the
   production URI and the fake UUID with the approved tenant ID. Repeat
   `--tenant` or omit it for wider discovery during the preview.

   ```bash
   unset SNAPSHOT_DATABASE_URL
   TARGET_HOST=db.example.supabase.co
   TENANT=11111111-1111-4111-8111-000000000001
   npx tsx scripts/backfill-usage-outage.ts \
     --confirm-target-host "$TARGET_HOST" --tenant "$TENANT" \
     --snapshot-file "$BACKFILL_DIR/pre-outage.json"
   ```

   The preview runs in a server-enforced read-only, repeatable-read
   transaction. It computes finding transitions in memory and needs no
   temporary writes. Review the last populated and first empty report,
   restoration counts, and proposed finding transitions. Preview IDs for
   new findings are provisional. The default cutoff is **2026-11-21
   00:00 UTC**. Use `--since YYYY-MM-DD` only if the incident scope requires
   a different UTC cutoff, and use the same value in every step. Snapshot
   rows at or after that cutoff and users no longer in the directory are
   excluded. The availability flag is set only when the latest completed
   report is still empty.

   The repair reconciles inactivity and Copilot findings only for users
   with changed activity inputs. It protects acknowledged findings,
   findings with workflow fields and findings with individual operator
   audit events. It also preserves findings that existed at the time of
   a historical bulk status edit, whose audit records contain only counts.
   The next normal sync or analysis refreshes finding details and rollups.

3. Take a fresh production backup, or confirm that PITR covers the moment
   before apply or that a fresh daily backup is available. Record the
   backup or recovery point. Avoid manual finding edits and imports for the
   tenant during its repair. The app and other tenants can stay online.

4. Run the same tenant, snapshot, and cutoff through the release gate with
   `--apply --i-have-a-backup --json`. Save each run to a new private file.

   ```bash
   umask 077
   REPORT="$BACKFILL_DIR/apply-${TENANT}-$(date -u +%Y%m%dT%H%M%SZ).json"
   npx tsx scripts/backfill-usage-outage.ts \
     --confirm-target-host "$TARGET_HOST" --tenant "$TENANT" \
     --snapshot-file "$BACKFILL_DIR/pre-outage.json" \
     --apply --i-have-a-backup --json > "$REPORT"
   ```

   Apply checks the latest evidence again and repairs each tenant in one
   transaction. It skips tenants with a running sync or an unavailable
   tenant lock. Review `skippedTenants`, wait for the tenant to become idle,
   then repeat the preview and apply for that tenant. On an apply error,
   check `failedTenant` and preserve the JSON for any tenants already
   committed. If execution is interrupted and the report is incomplete,
   check the audit row and use the backup to recover before-values before
   attempting a reversal.

## Verify

Repeat the dry-run command with the same options. Expect zero proposed
writes. Deleted users and unchanged findings may still be counted.
Run the read-only SQL below against the same production target using the
maintenance connection. Substitute the tenant, graph user, finding, and audit
IDs from the saved apply report. Verify each changed row against its
`after` values.

```sql
BEGIN READ ONLY;

SELECT id, usage_report_unavailable
FROM public.tenants
WHERE id = '11111111-1111-4111-8111-000000000001';

SELECT graph_id, workload_activity, last_activity
FROM public.tenant_users
WHERE tenant_id = '11111111-1111-4111-8111-000000000001'
  AND graph_id = '11111111-1111-4111-8111-000000000101';

SELECT id, rule, graph_user_id, status, resolved_at
FROM public.findings
WHERE tenant_id = '11111111-1111-4111-8111-000000000001'
  AND id = '11111111-1111-4111-8111-000000000201';

SELECT id, tenant_id, detail, created_at
FROM public.audit_log
WHERE tenant_id = '11111111-1111-4111-8111-000000000001'
  AND id = '11111111-1111-4111-8111-000000000301'
  AND actor_oid = 'system backfill' AND action = 'usage_outage_backfilled';

COMMIT;
```

Compare the rows with the report's `after` values. A changing apply adds one
counts-only audit row per affected tenant with writes. A subsequent no-op
apply adds no audit rows.

## Roll back from the saved JSON

Use `tenants[].rollback` from the saved apply report. Work one tenant at a
time through the release gate, outside the nightly sync window. Use an
interactive `psql -X -v ON_ERROR_STOP=1 "$DATABASE_URL"` session. Hold the
same tenant lock as the repair. The following example stops the transaction
if the tenant is busy, missing, or has a running sync.

```sql
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL row_security = off;
DO $$
DECLARE
  target_tenant constant uuid := '11111111-1111-4111-8111-000000000001';
BEGIN
  PERFORM id FROM public.tenants WHERE id = target_tenant
  FOR NO KEY UPDATE SKIP LOCKED;
  IF NOT FOUND OR EXISTS (
    SELECT 1 FROM public.sync_runs WHERE tenant_id = target_tenant AND status = 'running'
  ) THEN
    RAISE EXCEPTION 'Tenant is unavailable for rollback';
  END IF;
END $$;
```

Within that transaction, review later syncs and audit actions and lock
the affected rows before comparing them with the logged `after` values.
Leave any row with newer activity or operator changes for review. Use
tenant and row identifiers in each statement. If the displayed values
differ unexpectedly, run `ROLLBACK;`.

1. For each `users[]` entry, restore only the keys present in `before`.
   `workloadActivity` maps to `tenant_users.workload_activity` and
   `lastActivity` maps to `tenant_users.last_activity`. Use the tenant ID
   and `graphId` in the predicate. An explicit null means SQL NULL.
2. If `usageReportUnavailable` is non-null, restore the
   `tenants.usage_report_unavailable` value from `before`.
3. For each `findings[]` entry with a `before` object, restore
   `findings.status` and `findings.resolved_at` using the tenant and
   finding IDs. For `before: null`, delete the inserted finding only
   after verifying its identity, status, timestamps, and workflow state
   and checking for subsequent operator actions.
4. Keep the audit row as a record of the original repair. Verify the
   restored `before` values with `SELECT` in the same transaction, then
   run `COMMIT;`. Re-run read-only verification after the commit. If
   backup data is needed, restore it to another database and compare
   rows there before making any further production changes.
