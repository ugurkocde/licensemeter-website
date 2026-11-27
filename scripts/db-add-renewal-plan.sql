-- For deployments using Supabase and the dedicated application role.
-- Run as postgres in the Supabase SQL editor. Adds the storage for the Pro
-- renewal savings plan:
--
--   tenants.renewal_alerts          workspace switch for renewal reminders
--   tenants.renewal_buffer_pct      headroom (0 to 50 percent) on top of
--                                   active seats in the recommended seat count
--   vendor_renewals.sku_ids         Microsoft SKUs a contract covers, so the
--                                   plan shows them once, under the contract
--   vendor_renewals.target_seats    seat count an admin plans to renew at
--   renewal_sku_terms               billing term per SKU. No row means annual
--                                   or multi-year. A monthly (NCE) SKU is only
--                                   covered by renewal reminders when its
--                                   monthly_alerts opt-in is on.
--
-- Run this BEFORE deploying the release that reads these columns. Every query
-- that loads a full `tenants` or `vendor_renewals` row selects them, so
-- without the columns those queries fail.
--
-- Mirrors the Drizzle schema in src/server/db/schema.ts and the self-host
-- migration docker/migrations/0023_renewal_plan.sql. The new columns inherit
-- the existing row level security and grants of their tables. The new table
-- gets row level security, no access for anon or authenticated, and the same
-- app_all and tenant_isolation policies as every other tenant table.
--
-- Safe to rerun; no existing rows are changed (every workspace starts with
-- reminders on, a 5 percent buffer, and no SKU marked as monthly).

BEGIN;

ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS renewal_alerts boolean DEFAULT true NOT NULL;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS renewal_buffer_pct integer DEFAULT 5 NOT NULL;
ALTER TABLE public.vendor_renewals ADD COLUMN IF NOT EXISTS sku_ids text[] DEFAULT '{}'::text[] NOT NULL;
ALTER TABLE public.vendor_renewals ADD COLUMN IF NOT EXISTS target_seats integer;

CREATE TABLE IF NOT EXISTS public.renewal_sku_terms (
	"tenant_id" uuid NOT NULL CONSTRAINT "renewal_sku_terms_tenant_id_tenants_id_fk" REFERENCES public.tenants(id) ON DELETE CASCADE,
	"sku_id" text NOT NULL,
	"term" text NOT NULL,
	"monthly_alerts" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "renewal_sku_terms_tenant_id_sku_id_pk" PRIMARY KEY ("tenant_id", "sku_id"),
	CONSTRAINT "renewal_sku_terms_term_check" CHECK ("renewal_sku_terms"."term" in ('annual', 'monthly'))
);

ALTER TABLE public.renewal_sku_terms ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.renewal_sku_terms FROM PUBLIC;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.tenants'::regclass AND conname = 'tenants_renewal_buffer_pct_range') THEN
    ALTER TABLE public.tenants ADD CONSTRAINT "tenants_renewal_buffer_pct_range" CHECK ("tenants"."renewal_buffer_pct" between 0 and 50);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.vendor_renewals'::regclass AND conname = 'vendor_renewals_target_seats_nonneg') THEN
    ALTER TABLE public.vendor_renewals ADD CONSTRAINT "vendor_renewals_target_seats_nonneg" CHECK ("vendor_renewals"."target_seats" is null or "vendor_renewals"."target_seats" >= 0);
  END IF;
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

COMMIT;

-- Verification: expect five rows.
SELECT table_name, column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'tenants' AND column_name IN ('renewal_alerts', 'renewal_buffer_pct'))
    OR (table_name = 'vendor_renewals' AND column_name IN ('sku_ids', 'target_seats'))
    OR (table_name = 'renewal_sku_terms' AND column_name = 'monthly_alerts')
  )
ORDER BY table_name, column_name;

-- Verification: expect app_all and tenant_isolation.
SELECT policyname FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'renewal_sku_terms'
ORDER BY policyname;
