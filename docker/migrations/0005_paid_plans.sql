CREATE TABLE "api_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"token_prefix" text NOT NULL,
	"created_by_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "api_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "dpa_acceptances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"version" text NOT NULL,
	"language" text NOT NULL,
	"accepted_by_key" text NOT NULL,
	"accepted_by_email" text NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dpa_acceptances_language_valid" CHECK ("dpa_acceptances"."language" in ('en', 'de'))
);
--> statement-breakpoint
ALTER TABLE "dpa_acceptances" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "dpa_agreements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"version" text NOT NULL,
	"language" text NOT NULL,
	"company_name" text NOT NULL,
	"company_address" text NOT NULL,
	"signer_name" text NOT NULL,
	"signer_title" text NOT NULL,
	"signer_email" text NOT NULL,
	"signed_by_key" text NOT NULL,
	"signed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dpa_agreements_kind_valid" CHECK ("dpa_agreements"."kind" in ('controller', 'subprocessor')),
	CONSTRAINT "dpa_agreements_language_valid" CHECK ("dpa_agreements"."language" in ('en', 'de'))
);
--> statement-breakpoint
ALTER TABLE "dpa_agreements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "msp_accounts" ADD COLUMN "brand_name" text;--> statement-breakpoint
ALTER TABLE "msp_accounts" ADD COLUMN "brand_color" text;--> statement-breakpoint
ALTER TABLE "msp_accounts" ADD COLUMN "brand_logo" text;--> statement-breakpoint
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dpa_acceptances" ADD CONSTRAINT "dpa_acceptances_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dpa_agreements" ADD CONSTRAINT "dpa_agreements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "api_tokens_hash_idx" ON "api_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "api_tokens_tenant_idx" ON "api_tokens" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dpa_acceptances_tenant_version_idx" ON "dpa_acceptances" USING btree ("tenant_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "dpa_agreements_tenant_kind_version_idx" ON "dpa_agreements" USING btree ("tenant_id","kind","version");--> statement-breakpoint
ALTER TABLE "msp_accounts" ADD CONSTRAINT "msp_accounts_brand_color_hex" CHECK ("msp_accounts"."brand_color" is null or "msp_accounts"."brand_color" ~ '^#[0-9a-fA-F]{6}$');--> statement-breakpoint
ALTER TABLE "msp_accounts" ADD CONSTRAINT "msp_accounts_brand_logo_size" CHECK ("msp_accounts"."brand_logo" is null or length("msp_accounts"."brand_logo") <= 400000);--> statement-breakpoint
-- Keep public Data API roles out, including installations with broad default grants.
DO $$
DECLARE
  table_name text;
  api_role text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['dpa_acceptances', 'dpa_agreements', 'api_tokens'] LOOP
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
