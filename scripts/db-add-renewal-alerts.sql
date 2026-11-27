-- For deployments using Supabase and the dedicated application role.
-- Run as postgres in the Supabase SQL editor. Adds the storage for the 90, 60
-- and 30 day renewal reminder emails:
--
--   memberships.renewal_opt_out          personal opt-out of one owner or
--                                        admin, like digest_opt_out
--   notification_addresses.renewal_alerts
--                                        switch for the workspace's shared
--                                        notification address, like digest
--   email_deliveries_job_check           now also allows job = 'renewal' in
--                                        the delivery ledger
--
-- Run this BEFORE deploying the release that reads these columns. Every query
-- that loads a full `memberships` or `notification_addresses` row selects
-- them, so without the columns those queries fail, and without the wider
-- check the reminder job cannot claim a delivery.
--
-- Requires scripts/db-add-renewal-plan.sql (tenants.renewal_alerts, the
-- workspace switch) to be applied already.
--
-- Mirrors the Drizzle schema in src/server/db/schema.ts and the self-host
-- migration docker/migrations/0024_renewal_alerts.sql. The new columns inherit
-- the existing row level security, policies and grants of their tables; no
-- new table is created.
--
-- Safe to rerun; no existing rows are changed. Every member starts opted in
-- (the workspace switch decides whether reminders go out at all) and a shared
-- address starts with reminders on, like its other three switches.

BEGIN;

ALTER TABLE public.memberships ADD COLUMN IF NOT EXISTS renewal_opt_out boolean DEFAULT false NOT NULL;
ALTER TABLE public.notification_addresses ADD COLUMN IF NOT EXISTS renewal_alerts boolean DEFAULT true NOT NULL;

-- Replace the job check in one transaction: every existing row satisfies the
-- wider list, so the new constraint validates without touching any row.
ALTER TABLE public.email_deliveries DROP CONSTRAINT IF EXISTS "email_deliveries_job_check";
ALTER TABLE public.email_deliveries ADD CONSTRAINT "email_deliveries_job_check" CHECK ("email_deliveries"."job" in ('digest', 'report', 'leak', 'renewal'));

COMMIT;

-- Verification: expect two rows.
SELECT table_name, column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'memberships' AND column_name = 'renewal_opt_out')
    OR (table_name = 'notification_addresses' AND column_name = 'renewal_alerts')
  )
ORDER BY table_name, column_name;

-- Verification: expect the check to list 'renewal'.
SELECT pg_get_constraintdef(oid) AS job_check
FROM pg_constraint
WHERE conrelid = 'public.email_deliveries'::regclass
  AND conname = 'email_deliveries_job_check';
