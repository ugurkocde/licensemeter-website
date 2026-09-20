-- Enable database-level tenant isolation by making Row Level Security enforce
-- the app's tenant context.
--
-- IMPORTANT: apply this only AFTER every access to a tenant table runs inside
-- withTenant(tenantId, ...) (src/server/db/tenant.ts). These policies read the
-- `app.tenant_id` session setting, which withTenant sets. For the app role the
-- setting is unset outside a wrapped call, and an unset setting matches no row,
-- so applying this before the wiring is complete denies access to tenant data
-- (fail-closed, not a leak). The global tables (no tenant_id column) keep the
-- permissive app_all policy created by db-app-role-grants-and-policies.sql.
--
-- This replaces the permissive app_all policy on each tenant table with:
--   USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
--   WITH CHECK (the same)
-- and is idempotent. Run as the privileged/admin role after schema changes,
-- in addition to the other db-* scripts.
--
-- How to run: as a privileged role (postgres), via the Supabase SQL editor or
-- an admin connection.

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN pg_tables p
      ON p.schemaname = c.table_schema AND p.tablename = c.table_name
    WHERE c.table_schema = 'public'
      AND c.column_name = 'tenant_id'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS app_all ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON public.%I FOR ALL TO licensemeter_app '
      'USING (tenant_id = current_setting(''app.tenant_id'', true)::uuid) '
      'WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true)::uuid)',
      t
    );
  END LOOP;
END $$;
