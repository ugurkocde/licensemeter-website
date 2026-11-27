CREATE TABLE "report_recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"verified_at" timestamp with time zone,
	"verify_token_hash" text,
	"verify_expires_at" timestamp with time zone,
	"unsubscribed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_recipients_kind_check" CHECK ("report_recipients"."kind" in ('finance', 'client'))
);
--> statement-breakpoint
ALTER TABLE "report_recipients" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "report_share_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"token_prefix" text NOT NULL,
	"label" text NOT NULL,
	"mode" text NOT NULL,
	"period_key" text NOT NULL,
	"snapshot_payload" jsonb,
	"created_by_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_viewed_at" timestamp with time zone,
	"view_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "report_share_links_mode_check" CHECK ("report_share_links"."mode" in ('live', 'snapshot')),
	CONSTRAINT "report_share_links_payload_check" CHECK (("report_share_links"."mode" = 'live' and "report_share_links"."snapshot_payload" is null) or ("report_share_links"."mode" = 'snapshot' and ("report_share_links"."snapshot_payload" is not null or "report_share_links"."revoked_at" is not null))),
	CONSTRAINT "report_share_links_expiry_check" CHECK ("report_share_links"."expires_at" > "report_share_links"."created_at"),
	CONSTRAINT "report_share_links_view_count_nonneg" CHECK ("report_share_links"."view_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "report_share_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "email_deliveries" DROP CONSTRAINT "email_deliveries_job_check";--> statement-breakpoint
ALTER TABLE "report_recipients" ADD CONSTRAINT "report_recipients_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_share_links" ADD CONSTRAINT "report_share_links_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "report_recipients_tenant_kind_email_idx" ON "report_recipients" USING btree ("tenant_id","kind","email");--> statement-breakpoint
CREATE UNIQUE INDEX "report_share_links_token_hash_idx" ON "report_share_links" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "report_share_links_tenant_idx" ON "report_share_links" USING btree ("tenant_id","created_at");--> statement-breakpoint
ALTER TABLE "email_deliveries" ADD CONSTRAINT "email_deliveries_job_check" CHECK ("email_deliveries"."job" in ('digest', 'report', 'leak', 'renewal', 'exec_report'));--> statement-breakpoint
REVOKE ALL ON TABLE public.report_share_links FROM PUBLIC;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.report_share_links FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.report_share_links FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'licensemeter_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_share_links TO licensemeter_app;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'report_share_links' AND policyname = 'app_all') THEN
      CREATE POLICY app_all ON public.report_share_links FOR ALL TO licensemeter_app USING (true) WITH CHECK (true);
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'licensemeter_tenant') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_share_links TO licensemeter_tenant;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'report_share_links' AND policyname = 'tenant_isolation') THEN
      CREATE POLICY tenant_isolation ON public.report_share_links FOR ALL TO licensemeter_tenant
        USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
    END IF;
  END IF;
END $$;
--> statement-breakpoint
REVOKE ALL ON TABLE public.report_recipients FROM PUBLIC;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.report_recipients FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.report_recipients FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'licensemeter_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_recipients TO licensemeter_app;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'report_recipients' AND policyname = 'app_all') THEN
      CREATE POLICY app_all ON public.report_recipients FOR ALL TO licensemeter_app USING (true) WITH CHECK (true);
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'licensemeter_tenant') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_recipients TO licensemeter_tenant;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'report_recipients' AND policyname = 'tenant_isolation') THEN
      CREATE POLICY tenant_isolation ON public.report_recipients FOR ALL TO licensemeter_tenant
        USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
    END IF;
  END IF;
END $$;
