CREATE TABLE "notification_addresses" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"email" text,
	"verified_at" timestamp with time zone,
	"pending_email" text,
	"token_hash" text,
	"token_expires_at" timestamp with time zone,
	"digest" boolean DEFAULT true NOT NULL,
	"report" boolean DEFAULT true NOT NULL,
	"leak_alerts" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification_addresses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notification_addresses" ADD CONSTRAINT "notification_addresses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Keep public Data API roles out, including installations with broad default grants.
DO $$
DECLARE
  table_name text;
  api_role text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['notification_addresses'] LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', table_name);
    FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', table_name, api_role);
      END IF;
    END LOOP;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'licensemeter_app') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO licensemeter_app', table_name);
      EXECUTE format('CREATE POLICY app_all ON public.%I FOR ALL TO licensemeter_app USING (true) WITH CHECK (true)', table_name);
    END IF;
  END LOOP;
END $$;
