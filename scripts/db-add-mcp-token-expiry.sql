-- For deployments using Supabase and the dedicated application role.
-- Run as postgres. Adds `expires_at` to `api_tokens`: an MCP token no longer
-- verifies after this moment. New tokens get 90 days from creation
-- (TOKEN_TTL_DAYS in src/server/mcp/tokens.ts).
--
-- Existing tokens are not invalidated: Postgres evaluates the default once,
-- when the column is added, so every existing row expires 90 days after this
-- statement runs. Run it right before deploying the release that reads the
-- column. Until that release is live the column is ignored, and tokens created
-- by the old release in between also get the default.
--
-- Mirrors the Drizzle schema in src/server/db/schema.ts and the self-host
-- migration docker/migrations/0019_mcp_token_expiry.sql. The column inherits
-- the existing row level security and grants of `api_tokens`; nothing new is
-- exposed.
--
-- Safe to rerun; a second run changes nothing.

ALTER TABLE public.api_tokens
  ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL
  DEFAULT (now() + interval '90 days');

-- Verification: expect one row, `timestamp with time zone`, NO, with the
-- default expression.
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'api_tokens'
  AND column_name = 'expires_at';

-- Every token and when it expires (no token values are stored):
--   SELECT token_prefix, created_at, revoked_at, expires_at
--   FROM public.api_tokens ORDER BY created_at;
