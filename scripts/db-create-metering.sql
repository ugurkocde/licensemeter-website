-- Hosted upgrade from the schema through migration 0012. Do not use db:push for this upgrade.
-- Adds the Software Metering settings tables (migrations 0013 and 0014). Metering
-- results are read live from Intune and never stored, so these hold settings and
-- pending consent only. Run with the database owner's connection, for example in
-- the Supabase SQL editor, before deploying the application that uses them.
BEGIN;
CREATE TABLE "metering_connections" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"tid" text NOT NULL,
	"consented_at" timestamp with time zone,
	"script_id" text,
	"script_name" text,
	"inactivity_days" integer DEFAULT 60 NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"excluded_apps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"program_overrides" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"collectors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "metering_connections_id_unique" UNIQUE("id"),
	CONSTRAINT "metering_inactivity_days" CHECK ("metering_connections"."inactivity_days" in (30, 60, 90))
);

ALTER TABLE "metering_connections" ENABLE ROW LEVEL SECURITY;
CREATE TABLE "metering_consent_states" (
	"state" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"oid" text NOT NULL,
	"tid" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "metering_consent_states" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "metering_connections" ADD CONSTRAINT "metering_connections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "metering_consent_states" ADD CONSTRAINT "metering_consent_states_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "metering_consent_states" ADD CONSTRAINT "metering_consent_states_connection_id_metering_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."metering_connections"("id") ON DELETE cascade ON UPDATE no action;
DO $$
DECLARE
  metering_table text;
BEGIN
  FOREACH metering_table IN ARRAY ARRAY[
    'metering_connections', 'metering_consent_states'
  ] LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', metering_table);
    -- Hosted database: keep the provider's public Data API roles without access.
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', metering_table);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated', metering_table);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'licensemeter_app') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO licensemeter_app', metering_table);
      EXECUTE format('DROP POLICY IF EXISTS app_all ON public.%I', metering_table);
      EXECUTE format(
        'CREATE POLICY app_all ON public.%I FOR ALL TO licensemeter_app USING (true) WITH CHECK (true)',
        metering_table
      );
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'licensemeter_tenant') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO licensemeter_tenant', metering_table);
      EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', metering_table);
      EXECUTE format(
        'CREATE POLICY tenant_isolation ON public.%I FOR ALL TO licensemeter_tenant '
        'USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid) '
        'WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)',
        metering_table
      );
    END IF;
  END LOOP;
END $$;
COMMIT;
