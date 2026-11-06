-- For deployments using Supabase and the dedicated application role.
-- Run as postgres. Adds `signup_source` to `seen_signins`: the public page a
-- first sign-in started from (for example /compare/powershell-audit), so we
-- can see which pages lead to sign-ups. The app writes it once, on the first
-- sign-in of an identity, and only for plain marketing paths (no query
-- strings, nothing inside the app); see validateSignupSource in
-- src/lib/signIn.ts.
--
-- Run this before deploying the release that writes the column. If the
-- release goes out first, recordSignin (src/server/signinStats.ts) falls back
-- to inserting without the column: sign-in and sign-in statistics keep
-- working, but first sign-ins in that window are stored without a source and
-- later sign-ins never fill it in. After deploying, check that a new sign-in
-- from a public page records signup_source.
--
-- Mirrors the Drizzle schema in src/server/db/schema.ts and the self-host
-- migration docker/migrations/0018_signup_source.sql. The column inherits the
-- existing row level security and grants of `seen_signins`; nothing new is
-- exposed.
--
-- Safe to rerun; no existing rows are changed.

ALTER TABLE public.seen_signins ADD COLUMN IF NOT EXISTS signup_source text;

-- Verification: expect one row, `text`.
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'seen_signins'
  AND column_name = 'signup_source';

-- Afterwards, sign-ups per starting page:
--   SELECT coalesce(signup_source, '(unknown)') AS page, count(*)
--   FROM public.seen_signins
--   WHERE first_seen_at >= now() - interval '90 days'
--   GROUP BY 1 ORDER BY 2 DESC;
