# Restore activity after the November 2026 usage-report outage

## Prerequisites

- Merge and deploy PR #176 before running the backfill. Apply
  `scripts/db-add-usage-report-unavailable.sql` before deploying #176. On the
  local repair target, verify the column is present by running the same SQL.
- Use Node.js 24 and install the repository dependencies with
  `npm ci --ignore-scripts`.
- Work on an offline local copy of the post-outage database. Stop the app and
  scheduled syncs for the copy, let any sync finish, and back up the copy
  immediately before applying the repair. For PGlite, stop all processes that
  use the store before copying the entire `.pglite/data` directory.
- Prepare a separate snapshot from before **2026-11-21 00:00 UTC**. Use separate
  databases for the target and snapshot. Keep backups, exports, and reports
  out of Git and restrict access to them. The tool accepts local Postgres on
  loopback and PGlite. Use a dedicated local Postgres instance with no port
  forwards to another machine.

## Get and restore the pre-outage snapshot

In the Supabase Dashboard, go to **Database > Backups** and choose the last
backup from before the outage. Pro retains seven days of daily backups, so the
2026-11-20 backup expires around **2026-11-27**, depending on the backup time.
Preserve the backup before then. [Supabase database backups](https://supabase.com/docs/guides/platform/backups)

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
Project** for the pre-outage date. Review the clone's scheduled jobs and
network-capable extensions before using it. Export the snapshot from that
separate project, then pass the resulting local file to the script. Always
select a fresh database or a separate project as the restore destination.
[Restore to a new project](https://supabase.com/docs/guides/platform/clone-project)

## Export the snapshot

For a snapshot restored to local Postgres, set `SNAPSHOT_DATABASE_URL` to
its local URL. The tool reads the five required columns for affected tenants
in a read-only transaction. To make a portable snapshot file, run the
following from a shell with `psql` pointed at the restored copy. Substitute
the tenant IDs from your incident scope, or omit the tenant predicate to
include every tenant in the snapshot file. This produces a JSON array on
standard output. The tool also accepts one JSON object with these same
column names per line.

```bash
umask 077
psql -X -qAt -v ON_ERROR_STOP=1 "$SNAPSHOT_DATABASE_URL" > pre-outage.json <<'SQL'
BEGIN READ ONLY;
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

## Preview and apply

Run from the repository root. Set `DATABASE_URL` to the local post-outage
copy, or unset it to target the existing `.pglite/data` store. The script
prints the selected host to stderr and leaves stdout available for the report.

```bash
export DATABASE_URL=postgresql://127.0.0.1/usage_post_outage
unset SNAPSHOT_DATABASE_URL
npx tsx scripts/backfill-usage-outage.ts --snapshot-file pre-outage.json
```

If using a local snapshot database, set `SNAPSHOT_DATABASE_URL` and omit
`--snapshot-file`. Source selection prefers the database, then the file,
then the explicit `--source findings` fallback. The fallback is partial and
uses only last activity dates recorded by inactivity findings whose last
observation predates the outage. It can recover no workload dates and has
no evidence for users who lacked pre-outage findings.

Check each tenant's last populated and first empty usage report. Review
restoration counts and every finding status transition. Use repeatable
`--tenant <uuid>` arguments to narrow auto-detection, and use
`--since YYYY-MM-DD` to override the cutoff in UTC. Snapshot rows at or after
that cutoff and users missing from the current directory are excluded. The
availability flag is set only when the latest completed usage-report step is
still empty. Preview IDs for proposed inserts are temporary.

The reconciliation covers only inactivity and Copilot findings tied to
changed activity inputs. It preserves acknowledged findings, findings with
workflow fields, and findings identified by individual operator audit events.
Historical bulk status events record only a count, so the repair also protects
any finding that existed at the time of such an event. Existing finding
details and daily rollups refresh during the next normal sync or analysis.

After reviewing the preview and taking the local target backup, apply with
the same source, tenant IDs, and cutoff. Save the JSON for verification and
rollback.

```bash
umask 077
npx tsx scripts/backfill-usage-outage.ts --snapshot-file pre-outage.json \
  --apply --i-have-a-backup --json > backfill-applied.json
```

## Verify

Repeat the dry-run command with the same options. Expect zero proposed
writes. Deleted users and unchanged findings may still be counted.
For local Postgres, run read-only verification against the target. Substitute
the tenant, graph user, and finding IDs from the applied report.

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
WHERE actor_oid = 'system backfill' AND action = 'usage_outage_backfilled'
ORDER BY created_at DESC;

COMMIT;
```

Compare the rows with the report's `after` values. A changing apply adds one
counts-only audit row per affected tenant with writes. A subsequent no-op
apply adds no audit rows.

## Roll back the local repair

For an offline copy reserved for this operation, restore the target's
immediately pre-apply backup into a fresh local database or replace the
offline PGlite directory with its pre-apply copy. This is the simplest
full rollback.

For selective reversal, use the saved apply JSON under
`tenants[].rollback`. Pause writers and compare the current rows against the
logged `after` values before undoing anything. If a row has changed since the
backfill, leave it alone pending review. Apply the following within one
transaction, sorting changes by tenant so each operation is scoped by
`tenantId` plus its row key.

1. For each `users[]` entry, restore only the keys present in `before`.
   `workloadActivity` maps to `tenant_users.workload_activity` and
   `lastActivity` to `tenant_users.last_activity`. Use `graphId` with the
   tenant ID in the predicate. An explicit null means SQL NULL.
2. If `usageReportUnavailable` is present and non-null, set
   `tenants.usage_report_unavailable` back to its `before` value.
3. For each `findings[]` entry with a `before` object, update
   `findings.status` and `findings.resolved_at` to the logged before values
   where both tenant and finding ID match. For `before: null`, the backfill
   inserted the row. Delete it only after verifying that no user has acted
   on it and that it still matches the backfill state.
4. Keep the audit row for selective reversal so it records the original
   repair. When restoring the complete pre-apply backup, that audit row
   disappears along with the other repair writes.
5. Verify the restored before values within the transaction. Commit only
   after all checks match.
