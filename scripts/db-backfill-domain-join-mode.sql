-- One-off backfill for the hosted database: carry the legacy
-- tenants.allow_domain_join flag over to tenants.domain_join_mode.
--
-- Context: `npm run db:push` adds domain_join_mode with the default 'approval'
-- on every row. Workspaces that used to let colleagues join silently
-- (allow_domain_join = true) move to 'approval'; every other workspace never
-- allowed domain join and becomes 'off' (invite only). Existing members are
-- not touched. Docker deployments get the same statement from migration
-- 0002_domain_join_mode.sql and must NOT run this file.
--
-- How to run: ONCE, right after the `db:push` that adds the column, and before
-- any owner changes the setting (running it later would reset their choice).
-- Works as the application role or as postgres. `db:push` also creates the
-- join_requests table: re-run db-enable-rls-deny-all.sql and
-- db-app-role-grants-and-policies.sql afterwards so it gets RLS and the
-- app_all policy like every other table.

UPDATE public.tenants
SET domain_join_mode = CASE WHEN allow_domain_join THEN 'approval' ELSE 'off' END;
