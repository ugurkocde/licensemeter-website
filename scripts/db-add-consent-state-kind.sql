-- Run as postgres before deploying the Microsoft admin consent handoff.
-- Existing consent states retain the original session-bound flow.
-- Safe to rerun.
ALTER TABLE public.consent_states
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'self'
  CONSTRAINT consent_states_kind_check CHECK (kind IN ('self', 'handoff'));
