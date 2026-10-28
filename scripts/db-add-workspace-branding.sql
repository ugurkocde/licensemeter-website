-- For deployments using Supabase and the dedicated application role.
-- Run as postgres. Add the report branding columns for standalone workspaces
-- to `tenants`. Report branding is included in Pro and MSP: a workspace
-- attached to an MSP account takes the account's marks from `msp_accounts`,
-- while a standalone workspace (its own Pro plan, or a self-hosted install)
-- carries its marks on its own row.
--
-- Order matters: run this BEFORE deploying the release that reads these
-- columns. Every request loads the full tenants row, so a missing column
-- takes the app down.
--
-- Mirrors the Drizzle schema in src/server/db/schema.ts and the self-host
-- migration docker/migrations/0015_workspace_branding.sql: same names, types
-- and constraints as the brand columns on `msp_accounts` added by
-- db-create-entitlements.sql. Keep the three in step. The columns inherit the
-- existing row level security and grants of `tenants`; nothing new is exposed.
--
-- Safe to rerun; no existing rows are changed. Run db-audit-posture.sql
-- afterwards.

ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS brand_name text;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS brand_color text;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS brand_logo text;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tenants_brand_color_hex'
      AND conrelid = 'public.tenants'::regclass
  ) THEN
    ALTER TABLE public.tenants ADD CONSTRAINT tenants_brand_color_hex
      CHECK (brand_color is null or brand_color ~ '^#[0-9a-fA-F]{6}$');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tenants_brand_logo_size'
      AND conrelid = 'public.tenants'::regclass
  ) THEN
    ALTER TABLE public.tenants ADD CONSTRAINT tenants_brand_logo_size
      CHECK (brand_logo is null or length(brand_logo) <= 400000);
  END IF;
END $$;

-- Verification: expect three rows, all `text`.
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'tenants'
  AND column_name IN ('brand_name', 'brand_color', 'brand_logo')
ORDER BY column_name;
