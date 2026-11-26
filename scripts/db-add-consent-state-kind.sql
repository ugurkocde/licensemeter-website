-- Run as postgres before deploying the Microsoft admin consent handoff.
-- Existing consent states retain the original session-bound flow.
-- Safe to rerun.
DO $$
BEGIN
  ALTER TABLE public.consent_states
    ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'self';

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.consent_states'::regclass
      AND conname = 'consent_states_kind_check'
  ) THEN
    ALTER TABLE public.consent_states
      ADD CONSTRAINT consent_states_kind_check CHECK (kind IN ('self', 'handoff'));
  END IF;
END
$$;
