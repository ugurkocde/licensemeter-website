CREATE TABLE "email_blocks" (
	"tenant_id" uuid NOT NULL,
	"email" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_blocks_tenant_id_email_pk" PRIMARY KEY("tenant_id","email"),
	CONSTRAINT "email_blocks_reason_check" CHECK ("email_blocks"."reason" in ('bounced', 'suppressed', 'complained'))
);
--> statement-breakpoint
ALTER TABLE "email_blocks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "email_deliveries" DROP CONSTRAINT "email_deliveries_job_check";--> statement-breakpoint
ALTER TABLE "email_deliveries" ADD COLUMN "provider_id" text;--> statement-breakpoint
ALTER TABLE "email_deliveries" ADD COLUMN "delivery_status" text;--> statement-breakpoint
ALTER TABLE "email_deliveries" ADD COLUMN "delivery_event_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "email_blocks" ADD CONSTRAINT "email_blocks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "email_deliveries_provider_id_idx" ON "email_deliveries" USING btree ("provider_id");--> statement-breakpoint
ALTER TABLE "email_deliveries" ADD CONSTRAINT "email_deliveries_delivery_status_check" CHECK ("email_deliveries"."delivery_status" in ('accepted', 'delivered', 'delayed', 'failed', 'bounced', 'suppressed', 'complained'));--> statement-breakpoint
ALTER TABLE "email_deliveries" ADD CONSTRAINT "email_deliveries_job_check" CHECK ("email_deliveries"."job" in ('digest', 'report', 'leak'));--> statement-breakpoint
-- Keep public Data API roles out, including installations with broad default grants.
DO $$
DECLARE
  table_name text;
  api_role text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['email_blocks'] LOOP
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
