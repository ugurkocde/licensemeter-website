-- For deployments using Supabase and the dedicated application role.
-- Run as postgres. Add the two tables behind paid hosted plans: `entitlements`
-- (one row per paid workspace or MSP account; no row means Free) and
-- `billing_events` (the idempotency ledger for payment-provider webhooks).
--
-- Order matters: run this BEFORE setting BILLING_ENABLED=true. With the flag on,
-- every request reads `entitlements`, so a missing table takes the app down.
-- With the flag unset (the default, and what self-hosted instances use) neither
-- table is queried.
--
-- Mirrors the Drizzle schema in src/server/db/schema.ts and the self-host
-- migration docker/migrations/0004_entitlements.sql: same names, types,
-- defaults, indexes and constraints. Keep the three in step.
--
-- Keeps both tables private to the trusted application role, matching the
-- existing database access model: RLS on, no grants to the Data API roles, DML
-- for `licensemeter_app` through the permissive `app_all` policy. The two
-- partial unique indexes on tenant_id and msp_account_id double as the covering
-- indexes for the foreign keys, which db-audit-posture.sql requires.
--
-- Safe to rerun; no existing rows are changed. Run db-audit-posture.sql
-- afterwards.

CREATE TABLE IF NOT EXISTS public.entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid,
  msp_account_id uuid,
  plan text NOT NULL,
  source text NOT NULL,
  status text NOT NULL,
  quantity integer DEFAULT 1 NOT NULL,
  trial_end timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean DEFAULT false NOT NULL,
  provider_subscription_id text,
  provider_customer_id text,
  last_event_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT entitlements_tenant_id_tenants_id_fk
    FOREIGN KEY (tenant_id) REFERENCES public.tenants (id)
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT entitlements_msp_account_id_msp_accounts_id_fk
    FOREIGN KEY (msp_account_id) REFERENCES public.msp_accounts (id)
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT entitlements_single_owner
    CHECK ((tenant_id is null) <> (msp_account_id is null)),
  CONSTRAINT entitlements_plan_valid
    CHECK (plan in ('pro', 'msp')),
  CONSTRAINT entitlements_source_valid
    CHECK (source in ('marketplace', 'polar', 'comped')),
  CONSTRAINT entitlements_status_valid
    CHECK (status in ('trialing', 'active', 'past_due', 'canceled', 'suspended')),
  CONSTRAINT entitlements_quantity_positive
    CHECK (quantity > 0)
);

-- At most one row per workspace and per MSP account.
CREATE UNIQUE INDEX IF NOT EXISTS entitlements_tenant_idx
  ON public.entitlements USING btree (tenant_id)
  WHERE tenant_id is not null;
CREATE UNIQUE INDEX IF NOT EXISTS entitlements_msp_account_idx
  ON public.entitlements USING btree (msp_account_id)
  WHERE msp_account_id is not null;
-- One row per provider subscription: a second owner pointing at the same
-- subscription is a webhook routing bug, not a silent duplicate.
CREATE UNIQUE INDEX IF NOT EXISTS entitlements_provider_subscription_idx
  ON public.entitlements USING btree (source, provider_subscription_id)
  WHERE provider_subscription_id is not null;

-- No foreign key on purpose: the ledger survives workspace deletion.
CREATE TABLE IF NOT EXISTS public.billing_events (
  provider text NOT NULL,
  event_id text NOT NULL,
  type text NOT NULL,
  received_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT billing_events_provider_event_id_pk PRIMARY KEY (provider, event_id)
);

ALTER TABLE public.entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.entitlements FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.billing_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.entitlements TO licensemeter_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_events TO licensemeter_app;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['entitlements', 'billing_events']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
        AND policyname = 'app_all'
    ) THEN
      EXECUTE format(
        'CREATE POLICY app_all ON public.%I FOR ALL TO licensemeter_app USING (true) WITH CHECK (true)',
        t
      );
    END IF;
  END LOOP;
END $$;

-- Verification: expect two rows, each with rls_enabled = true,
-- app_all_policy = true, app_role_dml = true and api_role_access = false.
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  EXISTS (
    SELECT 1
    FROM pg_policy p
    JOIN pg_roles r ON r.oid = ANY (p.polroles)
    WHERE p.polrelid = c.oid
      AND p.polname = 'app_all'
      AND r.rolname = 'licensemeter_app'
  ) AS app_all_policy,
  has_table_privilege('licensemeter_app', c.oid, 'SELECT, INSERT, UPDATE, DELETE')
    AS app_role_dml,
  (
    has_table_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, DELETE')
    OR has_table_privilege('authenticated', c.oid, 'SELECT, INSERT, UPDATE, DELETE')
  ) AS api_role_access
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN ('entitlements', 'billing_events')
ORDER BY c.relname;

-- Comping a workspace by hand. `source = 'comped'` is only ever set here by the
-- operator; no webhook writes or overwrites it. Replace the placeholder with the
-- workspace's tenants.id. A comp does not expire: the app grants it whatever
-- status and current_period_end say, so it lasts until the row is deleted.
--
--   INSERT INTO public.entitlements (tenant_id, plan, source, status, quantity)
--   VALUES ('00000000-0000-0000-0000-000000000000', 'pro', 'comped', 'active', 1);
--
-- The insert fails on entitlements_tenant_idx if the workspace already has a
-- row, comped or paid. Look before changing anything:
--
--   SELECT id, plan, source, status, current_period_end
--   FROM public.entitlements
--   WHERE tenant_id = '00000000-0000-0000-0000-000000000000';
--
-- Removing the comp puts the workspace back on Free. The source filter keeps a
-- paid row from being deleted by mistake:
--
--   DELETE FROM public.entitlements
--   WHERE tenant_id = '00000000-0000-0000-0000-000000000000'
--     AND source = 'comped';
