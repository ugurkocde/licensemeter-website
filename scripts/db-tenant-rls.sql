-- Tenant isolation via a dedicated database role.
--
-- The app connects as `licensemeter_app`, which holds a permissive `app_all`
-- policy (application-level isolation). This script adds a second, NOLOGIN role
-- `licensemeter_tenant` that is subject to tenant Row Level Security, and makes
-- the app role a member so `withTenant()` can `set local role` for a wrapped
-- request. Wrapped queries are then enforced by the database; paths not yet
-- wrapped keep working at application-level isolation, so the rollout is
-- incremental and cannot fail closed.
--
-- After running this, set TENANT_DB_ROLE=licensemeter_tenant so withTenant()
-- switches role. Requires RLS to be enabled on the tables (db-enable-rls-deny-all.sql).
-- Idempotent. Run as a privileged role (postgres).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'licensemeter_tenant') THEN
    CREATE ROLE licensemeter_tenant NOLOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO licensemeter_tenant;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO licensemeter_tenant;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO licensemeter_tenant;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO licensemeter_tenant;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE ON SEQUENCES TO licensemeter_tenant;
-- The app role sets this role for the duration of a withTenant() transaction.
GRANT licensemeter_tenant TO licensemeter_app;

DO $$
DECLARE
  t text;
BEGIN
  -- Tenant-data tables: enforce the app.tenant_id session setting.
  FOR t IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN pg_tables p
      ON p.schemaname = c.table_schema AND p.tablename = c.table_name
    WHERE c.table_schema = 'public'
      AND c.column_name = 'tenant_id'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON public.%I FOR ALL TO licensemeter_tenant '
      'USING (tenant_id = current_setting(''app.tenant_id'', true)::uuid) '
      'WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true)::uuid)',
      t
    );
  END LOOP;

  -- Identity and global tables (no tenant_id): readable inside a tenant
  -- transaction so wrapped code can still resolve workspace metadata.
  FOR t IN
    SELECT p.tablename
    FROM pg_tables p
    WHERE p.schemaname = 'public'
      AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns c
        WHERE c.table_schema = 'public'
          AND c.table_name = p.tablename
          AND c.column_name = 'tenant_id'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_app_all ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY tenant_app_all ON public.%I FOR ALL TO licensemeter_tenant '
      'USING (true) WITH CHECK (true)',
      t
    );
  END LOOP;
END $$;
