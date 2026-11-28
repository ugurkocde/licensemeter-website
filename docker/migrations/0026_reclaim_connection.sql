CREATE TABLE "reclaim_connections" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
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
--> statement-breakpoint
ALTER TABLE "reclaim_connections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "reclaim_consent_states" (
	"state" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"oid" text NOT NULL,
	"tid" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reclaim_consent_states" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "reclaim_connections" ADD CONSTRAINT "reclaim_connections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reclaim_consent_states" ADD CONSTRAINT "reclaim_consent_states_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reclaim_consent_states" ADD CONSTRAINT "reclaim_consent_states_connection_id_reclaim_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."reclaim_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
REVOKE ALL ON TABLE public.reclaim_connections FROM PUBLIC;
--> statement-breakpoint
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
END $$;
--> statement-breakpoint
REVOKE ALL ON TABLE public.reclaim_consent_states FROM PUBLIC;
--> statement-breakpoint
DO $$
BEGIN
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
