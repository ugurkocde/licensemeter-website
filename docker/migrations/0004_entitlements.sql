CREATE TABLE "billing_events" (
	"provider" text NOT NULL,
	"event_id" text NOT NULL,
	"type" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_events_provider_event_id_pk" PRIMARY KEY("provider","event_id")
);
--> statement-breakpoint
ALTER TABLE "billing_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "entitlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"msp_account_id" uuid,
	"plan" text NOT NULL,
	"source" text NOT NULL,
	"status" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"trial_end" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"provider_subscription_id" text,
	"provider_customer_id" text,
	"last_event_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entitlements_single_owner" CHECK (("entitlements"."tenant_id" is null) <> ("entitlements"."msp_account_id" is null)),
	CONSTRAINT "entitlements_plan_valid" CHECK ("entitlements"."plan" in ('pro', 'msp')),
	CONSTRAINT "entitlements_source_valid" CHECK ("entitlements"."source" in ('marketplace', 'polar', 'comped')),
	CONSTRAINT "entitlements_status_valid" CHECK ("entitlements"."status" in ('trialing', 'active', 'past_due', 'canceled', 'suspended')),
	CONSTRAINT "entitlements_quantity_positive" CHECK ("entitlements"."quantity" > 0)
);
--> statement-breakpoint
ALTER TABLE "entitlements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_msp_account_id_msp_accounts_id_fk" FOREIGN KEY ("msp_account_id") REFERENCES "public"."msp_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "entitlements_tenant_idx" ON "entitlements" USING btree ("tenant_id") WHERE "entitlements"."tenant_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "entitlements_msp_account_idx" ON "entitlements" USING btree ("msp_account_id") WHERE "entitlements"."msp_account_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "entitlements_provider_subscription_idx" ON "entitlements" USING btree ("source","provider_subscription_id") WHERE "entitlements"."provider_subscription_id" is not null;--> statement-breakpoint
-- Keep public Data API roles out, including installations with broad default grants.
DO $$
DECLARE
  table_name text;
  api_role text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['entitlements', 'billing_events'] LOOP
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
