-- For deployments using Supabase and the dedicated application role.
-- Run as postgres. Adds `usage_report_unavailable` to `tenants`: set by the
-- nightly sync when the Microsoft 365 usage report fetch failed or a report
-- that used to have rows came back without usable rows. The Microsoft
-- connector page reads it to explain that the last known activity was kept.
--
-- Run this BEFORE deploying the release that reads the column. Every query
-- that loads a full `tenants` row selects it, so without the column those
-- queries fail.
--
-- Mirrors the Drizzle schema in src/server/db/schema.ts and the self-host
-- migration docker/migrations/0020_usage_report_availability.sql. The column
-- inherits the existing row level security and grants of `tenants`; nothing
-- new is exposed.
--
-- Safe to rerun; no existing rows are changed (the column starts as null,
-- which the app reads as "report available").

ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS usage_report_unavailable boolean;

-- Verification: expect one row, `boolean`.
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'tenants'
  AND column_name = 'usage_report_unavailable';
