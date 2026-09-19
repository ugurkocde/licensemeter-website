-- For deployments using Supabase and the dedicated application role.
-- Run as postgres. Schema for Microsoft Entra ID as the only sign-in:
-- `join_requests` gets the requester's Entra identity (`oid`, `tid`), its
-- legacy `workos_user_id` becomes optional and uniqueness moves from
-- (workspace, email) to (workspace, oid) for new rows, and the new table
-- `membership_claims` holds the single-use tokens of the claim-by-email flow
-- that lets members from before the move prove a membership is theirs.
--
-- Order matters: run this directly BEFORE deploying the release that signs in
-- with Microsoft only. That release reads `join_requests.oid` on a first
-- sign-in and writes `membership_claims` when a member asks for the claim
-- mail. Keep the gap short: once `join_requests_tenant_email_idx` is gone, the
-- previous release can no longer record an automatic domain join (its upsert
-- names that index), so such a sign-in fails until the new release is live.
-- Everything else in the previous release is unaffected.
--
-- Nothing is dropped: `memberships.workos_user_id`, `tenants.workos_org_id`,
-- `msp_accounts.owner_workos_user_id`, `join_requests.workos_user_id` and
-- `consent_states.workos_user_id` stay for one release, because linking finds
-- the members from before the move through them.
--
-- Mirrors the Drizzle schema in src/server/db/schema.ts and the self-host
-- migration docker/migrations/0007_entra_identity.sql: same names, types,
-- defaults and indexes. Keep the three in step.
--
-- Keeps the new table private to the trusted application role, matching the
-- existing database access model: RLS on, no grants to the Data API roles, DML
-- for `licensemeter_app` through the permissive `app_all` policy.
--
-- Safe to rerun; no existing rows are changed. Run db-audit-posture.sql
-- afterwards.

-- The requester's Entra identity. Null on rows filed before the move.
ALTER TABLE public.join_requests ADD COLUMN IF NOT EXISTS oid text;
ALTER TABLE public.join_requests ADD COLUMN IF NOT EXISTS tid text;
ALTER TABLE public.join_requests ALTER COLUMN workos_user_id DROP NOT NULL;

-- New rows are unique per workspace and person; rows from before the move
-- (oid is null) stay unique per workspace and address. The legacy index is
-- created before the old one is dropped, so uniqueness never lapses.
CREATE UNIQUE INDEX IF NOT EXISTS join_requests_tenant_oid_idx
  ON public.join_requests USING btree (tenant_id, oid)
  WHERE oid is not null;
CREATE UNIQUE INDEX IF NOT EXISTS join_requests_tenant_legacy_email_idx
  ON public.join_requests USING btree (tenant_id, email)
  WHERE oid is null;
CREATE INDEX IF NOT EXISTS join_requests_oid_idx
  ON public.join_requests USING btree (oid);
DROP INDEX IF EXISTS public.join_requests_tenant_email_idx;

-- Claim-by-email tokens; only the SHA-256 hash is stored. No foreign key on
-- purpose: a claim names an address, not a row.
CREATE TABLE IF NOT EXISTS public.membership_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  email text NOT NULL,
  token_hash text NOT NULL,
  requested_by_oid text NOT NULL,
  requested_by_tid text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS membership_claims_token_hash_idx
  ON public.membership_claims USING btree (token_hash);
CREATE INDEX IF NOT EXISTS membership_claims_created_idx
  ON public.membership_claims USING btree (created_at);

ALTER TABLE public.membership_claims ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.membership_claims FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.membership_claims
  TO licensemeter_app;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'membership_claims'
      AND policyname = 'app_all'
  ) THEN
    CREATE POLICY app_all ON public.membership_claims
      FOR ALL TO licensemeter_app USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Verification, part 1: expect one row with rls_enabled = true,
-- app_all_policy = true, app_role_dml = true and api_role_access = false.
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  EXISTS (
    SELECT 1
    FROM pg_policy p
    JOIN pg_roles r ON r.oid = ANY (p.polroles)
    WHERE p.polrelid = c.oid
      AND p.polname = 'app_all'
      AND r.rolname = 'licensemeter_app'
  ) AS app_all_policy,
  has_table_privilege('licensemeter_app', c.oid, 'SELECT, INSERT, UPDATE, DELETE')
    AS app_role_dml,
  (
    has_table_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, DELETE')
    OR has_table_privilege('authenticated', c.oid, 'SELECT, INSERT, UPDATE, DELETE')
  ) AS api_role_access
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN ('membership_claims')
ORDER BY c.relname;

-- Verification, part 2: expect oid_column = true, tid_column = true,
-- workos_user_id_nullable = true, new_indexes = 3 and old_index_gone = true.
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'join_requests'
      AND column_name = 'oid'
  ) AS oid_column,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'join_requests'
      AND column_name = 'tid'
  ) AS tid_column,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'join_requests'
      AND column_name = 'workos_user_id' AND is_nullable = 'YES'
  ) AS workos_user_id_nullable,
  (
    SELECT count(*) FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'join_requests'
      AND indexname IN (
        'join_requests_tenant_oid_idx',
        'join_requests_tenant_legacy_email_idx',
        'join_requests_oid_idx'
      )
  ) AS new_indexes,
  NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'join_requests'
      AND indexname = 'join_requests_tenant_email_idx'
  ) AS old_index_gone;

-- Who still has to link: members from before the move whose membership carries
-- no Entra object id yet. They are linked on their first Microsoft sign-in when
-- the id token proves their email, or through the claim mail. Counts only:
--
--   SELECT count(*) AS unlinked_members, count(DISTINCT lower(email)) AS people
--   FROM public.memberships
--   WHERE oid IS NULL AND workos_user_id IS NOT NULL;
