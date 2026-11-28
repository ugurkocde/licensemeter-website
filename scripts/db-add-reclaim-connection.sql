-- For deployments using Supabase and the dedicated application role.
-- Run as postgres in the Supabase SQL editor. Adds the storage for the opt-in
-- one-click reclaim connection (Pro):
--
--   reclaim_connections      one row per workspace that connected the
--                            separate reclaim app. The Microsoft 365 connector
--                            stays read-only; only this app holds the license
--                            write permission (LicenseAssignment.ReadWrite.All).
--                            mode 'managed' stores no credential; mode 'byo'
--                            stores the customer's own client secret or
--                            certificate private key AES-256-GCM encrypted in
--                            secret_enc. approval_mode decides whether a
--                            reclaim request needs a second admin.
--   reclaim_consent_states   single-use, 15-minute nonces for the managed
--                            admin-consent round trip (like
--                            metering_consent_states).
--
-- Run this BEFORE deploying the release that reads these tables: the Reclaim
-- page loads the connection row, so without the table that page fails.
--
-- Mirrors the Drizzle schema in src/server/db/schema.ts and the self-host
-- migration docker/migrations/0026_reclaim_connection.sql. Both new tables get
-- row level security, no access for anon or authenticated, and the same
-- app_all and tenant_isolation policies as every other tenant table.
-- scripts/db-tenant-rls.sql picks them up as well, since they carry tenant_id.
--
-- Safe to rerun; no existing rows are changed. Both tables are new and empty,
-- so nothing needs CREATE INDEX CONCURRENTLY.

BEGIN;

CREATE TABLE IF NOT EXISTS public.reclaim_connections (
	"tenant_id" uuid PRIMARY KEY NOT NULL CONSTRAINT "reclaim_connections_tenant_id_tenants_id_fk" REFERENCES public.tenants(id) ON DELETE CASCADE,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"mode" text NOT NULL,
	"tid" text NOT NULL,
	"app_client_id" text,
	"cred_type" text,
	"secret_enc" text,
	"cert_thumbprint" text,
	"secret_expires_at" timestamp with time zone,
	"approval_mode" text DEFAULT 'two_person' NOT NULL,
	"consented_at" timestamp with time zone,
	"last_verified_at" timestamp with time zone,
	"last_verify_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reclaim_connections_id_unique" UNIQUE("id"),
	CONSTRAINT "reclaim_connections_mode_check" CHECK ("reclaim_connections"."mode" in ('managed', 'byo')),
	CONSTRAINT "reclaim_connections_approval_mode_check" CHECK ("reclaim_connections"."approval_mode" in ('two_person', 'single_admin')),
	CONSTRAINT "reclaim_connections_mode_columns_check" CHECK (("reclaim_connections"."mode" = 'byo' and "reclaim_connections"."app_client_id" is not null and "reclaim_connections"."cred_type" is not null and "reclaim_connections"."secret_enc" is not null) or ("reclaim_connections"."mode" = 'managed' and "reclaim_connections"."app_client_id" is null and "reclaim_connections"."cred_type" is null and "reclaim_connections"."secret_enc" is null and "reclaim_connections"."cert_thumbprint" is null))
);

CREATE TABLE IF NOT EXISTS public.reclaim_consent_states (
	"state" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL CONSTRAINT "reclaim_consent_states_tenant_id_tenants_id_fk" REFERENCES public.tenants(id) ON DELETE CASCADE,
	"connection_id" uuid NOT NULL CONSTRAINT "reclaim_consent_states_connection_id_reclaim_connections_id_fk" REFERENCES public.reclaim_connections(id) ON DELETE CASCADE,
	"oid" text NOT NULL,
	"tid" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.reclaim_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reclaim_consent_states ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.reclaim_connections FROM PUBLIC;
REVOKE ALL ON TABLE public.reclaim_consent_states FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.reclaim_connections FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.reclaim_connections FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'licensemeter_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.reclaim_connections TO licensemeter_app;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'reclaim_connections' AND policyname = 'app_all') THEN
      CREATE POLICY app_all ON public.reclaim_connections FOR ALL TO licensemeter_app USING (true) WITH CHECK (true);
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'licensemeter_tenant') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.reclaim_connections TO licensemeter_tenant;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'reclaim_connections' AND policyname = 'tenant_isolation') THEN
      CREATE POLICY tenant_isolation ON public.reclaim_connections FOR ALL TO licensemeter_tenant
        USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.reclaim_consent_states FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.reclaim_consent_states FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'licensemeter_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.reclaim_consent_states TO licensemeter_app;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'reclaim_consent_states' AND policyname = 'app_all') THEN
      CREATE POLICY app_all ON public.reclaim_consent_states FOR ALL TO licensemeter_app USING (true) WITH CHECK (true);
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'licensemeter_tenant') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.reclaim_consent_states TO licensemeter_tenant;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'reclaim_consent_states' AND policyname = 'tenant_isolation') THEN
      CREATE POLICY tenant_isolation ON public.reclaim_consent_states FOR ALL TO licensemeter_tenant
        USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
    END IF;
  END IF;
END $$;

COMMIT;

-- Verification: expect reclaim_connections and reclaim_consent_states, both
-- with row level security on.
SELECT c.relname AS table_name, c.relrowsecurity AS rls
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN ('reclaim_connections', 'reclaim_consent_states')
ORDER BY c.relname;

-- Verification: expect app_all and tenant_isolation on each table.
SELECT tablename, policyname FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('reclaim_connections', 'reclaim_consent_states')
ORDER BY tablename, policyname;
