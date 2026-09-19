CREATE TABLE "membership_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"requested_by_oid" text NOT NULL,
	"requested_by_tid" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "membership_claims" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "join_requests" ALTER COLUMN "workos_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "join_requests" ADD COLUMN "oid" text;--> statement-breakpoint
ALTER TABLE "join_requests" ADD COLUMN "tid" text;--> statement-breakpoint
CREATE UNIQUE INDEX "membership_claims_token_hash_idx" ON "membership_claims" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "membership_claims_created_idx" ON "membership_claims" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "join_requests_tenant_oid_idx" ON "join_requests" USING btree ("tenant_id","oid") WHERE "join_requests"."oid" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "join_requests_tenant_legacy_email_idx" ON "join_requests" USING btree ("tenant_id","email") WHERE "join_requests"."oid" is null;--> statement-breakpoint
CREATE INDEX "join_requests_oid_idx" ON "join_requests" USING btree ("oid");--> statement-breakpoint
DROP INDEX "join_requests_tenant_email_idx";--> statement-breakpoint
-- Keep public Data API roles out, including installations with broad default grants.
DO $$
DECLARE
  table_name text;
  api_role text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['membership_claims'] LOOP
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
