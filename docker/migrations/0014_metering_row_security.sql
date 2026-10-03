ALTER TABLE "metering_connections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "metering_consent_states" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "metering_devices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "metering_history" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- Match the established runtime roles while keeping public/Data API roles
-- denied. These policies are part of the migration transaction, before the
-- application can read or write metering data. No roles or secrets are created.
DO $$
DECLARE
  metering_table text;
BEGIN
  FOREACH metering_table IN ARRAY ARRAY[
    'metering_connections', 'metering_consent_states',
    'metering_devices', 'metering_history'
  ] LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', metering_table);
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
