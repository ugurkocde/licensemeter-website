-- For deployments using Supabase and the dedicated application role.
-- Run as postgres. Add the four indexes that cover foreign keys which were
-- created without one:
--
--   consent_states.tenant_id
--   join_requests.decided_by_membership_id
--   metering_consent_states.tenant_id
--   metering_consent_states.connection_id
--
-- Every other public foreign key already has a covering index. Without these,
-- db-audit-posture.sql fails and parent deletes or updates must scan the
-- child tables.
--
-- Mirrors the Drizzle schema in src/server/db/schema.ts and the self-host
-- migration docker/migrations/0016_foreign_key_indexes.sql. Keep the three
-- in step. The indexes inherit the existing table access model and expose no
-- new data.
--
-- Run each CREATE INDEX CONCURRENTLY separately and outside a transaction.
-- CONCURRENTLY avoids blocking writes while each index is built. Safe to
-- rerun; no existing rows are changed. If a build is interrupted and leaves
-- an invalid index behind, drop that named index before rerunning its
-- statement. Run db-audit-posture.sql afterwards.

CREATE INDEX CONCURRENTLY IF NOT EXISTS consent_states_tenant_idx
  ON public.consent_states USING btree (tenant_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS join_requests_decided_by_idx
  ON public.join_requests USING btree (decided_by_membership_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS metering_consent_states_tenant_idx
  ON public.metering_consent_states USING btree (tenant_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS metering_consent_states_connection_idx
  ON public.metering_consent_states USING btree (connection_id);

-- Verification: expect four rows, each valid and ready.
SELECT
  i.relname AS index_name,
  idx.indisvalid,
  idx.indisready
FROM pg_index idx
JOIN pg_class i ON i.oid = idx.indexrelid
JOIN pg_namespace n ON n.oid = i.relnamespace
WHERE n.nspname = 'public'
  AND i.relname IN (
    'consent_states_tenant_idx',
    'join_requests_decided_by_idx',
    'metering_consent_states_tenant_idx',
    'metering_consent_states_connection_idx'
  )
ORDER BY i.relname;
