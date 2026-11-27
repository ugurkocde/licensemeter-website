-- For deployments using Supabase and the dedicated application role.
-- Run as postgres in the Supabase SQL editor. Adds the storage for CFO share
-- links and the verified finance recipients of the monthly executive report:
--
--   report_share_links           read-only links to the executive savings
--                                report. Only the sha256 of the 256-bit token
--                                is stored (token_hash), never the token. A
--                                'live' link renders current data; a
--                                'snapshot' link carries the report frozen in
--                                snapshot_payload at creation.
--   report_recipients            people outside the workspace who receive a
--                                scheduled report by email ('finance' today,
--                                'client' reserved), at most 5 per workspace
--                                and kind (enforced by the app). An address
--                                gets nothing until it confirms the emailed
--                                link (only verify_token_hash is stored).
--   email_deliveries_job_check   now also allows job = 'exec_report' in the
--                                delivery ledger, for the monthly executive
--                                report to finance. Production already allows
--                                'digest', 'report', 'leak' and 'renewal'
--                                (scripts/db-add-renewal-alerts.sql); this
--                                adds only 'exec_report'.
--
-- Run this BEFORE deploying the release that reads these tables. The
-- executive report page lists share links and Settings lists finance
-- recipients, so without the tables those pages fail, and without the wider
-- check the monthly finance delivery cannot claim a delivery.
--
-- Requires scripts/db-add-renewal-alerts.sql (the 'renewal' job) to be
-- applied already, so the job check below keeps every existing value.
--
-- Mirrors the Drizzle schema in src/server/db/schema.ts and the self-host
-- migration docker/migrations/0025_exec_report_share_and_recipients.sql. Both
-- new tables get row level security, no access for anon or authenticated, and
-- the same app_all and tenant_isolation policies as every other tenant table.
-- scripts/db-tenant-rls.sql picks them up as well, since they carry tenant_id.
--
-- Safe to rerun; no existing rows are changed. Both tables are new and empty,
-- so the plain CREATE INDEX statements below run inside the transaction and
-- nothing needs CREATE INDEX CONCURRENTLY.

BEGIN;

CREATE TABLE IF NOT EXISTS public.report_share_links (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL CONSTRAINT "report_share_links_tenant_id_tenants_id_fk" REFERENCES public.tenants(id) ON DELETE CASCADE,
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
	CONSTRAINT "report_share_links_payload_check" CHECK (("report_share_links"."mode" = 'snapshot') = ("report_share_links"."snapshot_payload" is not null)),
	CONSTRAINT "report_share_links_expiry_check" CHECK ("report_share_links"."expires_at" > "report_share_links"."created_at"),
	CONSTRAINT "report_share_links_view_count_nonneg" CHECK ("report_share_links"."view_count" >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS "report_share_links_token_hash_idx" ON public.report_share_links USING btree ("token_hash");
CREATE INDEX IF NOT EXISTS "report_share_links_tenant_idx" ON public.report_share_links USING btree ("tenant_id", "created_at");

CREATE TABLE IF NOT EXISTS public.report_recipients (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL CONSTRAINT "report_recipients_tenant_id_tenants_id_fk" REFERENCES public.tenants(id) ON DELETE CASCADE,
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
CREATE UNIQUE INDEX IF NOT EXISTS "report_recipients_tenant_kind_email_idx" ON public.report_recipients USING btree ("tenant_id", "kind", "email");

ALTER TABLE public.report_share_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_recipients ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.report_share_links FROM PUBLIC;
REVOKE ALL ON TABLE public.report_recipients FROM PUBLIC;

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

-- Replace the job check in one transaction: every existing row satisfies the
-- wider list, so the new constraint validates without touching any row.
ALTER TABLE public.email_deliveries DROP CONSTRAINT IF EXISTS "email_deliveries_job_check";
ALTER TABLE public.email_deliveries ADD CONSTRAINT "email_deliveries_job_check" CHECK ("email_deliveries"."job" in ('digest', 'report', 'leak', 'renewal', 'exec_report'));

COMMIT;

-- Verification: expect report_recipients and report_share_links, both with
-- row level security on.
SELECT c.relname AS table_name, c.relrowsecurity AS rls
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN ('report_share_links', 'report_recipients')
ORDER BY c.relname;

-- Verification: expect app_all and tenant_isolation on each table.
SELECT tablename, policyname FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('report_share_links', 'report_recipients')
ORDER BY tablename, policyname;

-- Verification: expect the check to list 'exec_report'.
SELECT pg_get_constraintdef(oid) AS job_check
FROM pg_constraint
WHERE conrelid = 'public.email_deliveries'::regclass
  AND conname = 'email_deliveries_job_check';
