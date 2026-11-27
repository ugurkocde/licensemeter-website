CREATE TABLE "renewal_sku_terms" (
	"tenant_id" uuid NOT NULL,
	"sku_id" text NOT NULL,
	"term" text NOT NULL,
	"monthly_alerts" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "renewal_sku_terms_tenant_id_sku_id_pk" PRIMARY KEY("tenant_id","sku_id"),
	CONSTRAINT "renewal_sku_terms_term_check" CHECK ("renewal_sku_terms"."term" in ('annual', 'monthly'))
);
--> statement-breakpoint
ALTER TABLE "renewal_sku_terms" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "renewal_alerts" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "renewal_buffer_pct" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "vendor_renewals" ADD COLUMN "sku_ids" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "vendor_renewals" ADD COLUMN "target_seats" integer;--> statement-breakpoint
ALTER TABLE "renewal_sku_terms" ADD CONSTRAINT "renewal_sku_terms_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_renewal_buffer_pct_range" CHECK ("tenants"."renewal_buffer_pct" between 0 and 50);--> statement-breakpoint
ALTER TABLE "vendor_renewals" ADD CONSTRAINT "vendor_renewals_target_seats_nonneg" CHECK ("vendor_renewals"."target_seats" is null or "vendor_renewals"."target_seats" >= 0);--> statement-breakpoint
REVOKE ALL ON TABLE public.renewal_sku_terms FROM PUBLIC;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.renewal_sku_terms FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.renewal_sku_terms FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'licensemeter_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.renewal_sku_terms TO licensemeter_app;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'renewal_sku_terms' AND policyname = 'app_all') THEN
      CREATE POLICY app_all ON public.renewal_sku_terms FOR ALL TO licensemeter_app USING (true) WITH CHECK (true);
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'licensemeter_tenant') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.renewal_sku_terms TO licensemeter_tenant;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'renewal_sku_terms' AND policyname = 'tenant_isolation') THEN
      CREATE POLICY tenant_isolation ON public.renewal_sku_terms FOR ALL TO licensemeter_tenant
        USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
    END IF;
  END IF;
END $$;
