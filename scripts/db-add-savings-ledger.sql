-- Run as the database owner before deploying the ledger code.
BEGIN;
CREATE TABLE IF NOT EXISTS public."savings_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
	"finding_id" uuid REFERENCES public.findings(id) ON DELETE SET NULL,
	"rule" text NOT NULL,
	"vendor" text NOT NULL,
	"sku_id" text,
	"reason" text NOT NULL,
	"monthly_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"realized_at" timestamp with time zone NOT NULL,
	"reversed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "savings_ledger_monthly_nonneg" CHECK ("savings_ledger"."monthly_cents" >= 0),
	CONSTRAINT "savings_ledger_reason_check" CHECK ("savings_ledger"."reason" in ('license_removed', 'seats_reduced')),
	CONSTRAINT "savings_ledger_reversal_check" CHECK ("savings_ledger"."reversed_at" >= "savings_ledger"."realized_at")
);

ALTER TABLE "findings" ADD COLUMN IF NOT EXISTS "resolution_reason" text;
CREATE INDEX IF NOT EXISTS "savings_ledger_tenant_realized_idx" ON "savings_ledger" USING btree ("tenant_id","realized_at");
CREATE INDEX IF NOT EXISTS "savings_ledger_finding_idx" ON "savings_ledger" USING btree ("finding_id");
CREATE INDEX IF NOT EXISTS "findings_tenant_resolved_at_idx" ON "findings" USING btree ("tenant_id","resolved_at");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.findings'::regclass AND conname = 'findings_resolution_reason_check') THEN
    ALTER TABLE "findings" ADD CONSTRAINT "findings_resolution_reason_check" CHECK ("findings"."resolution_reason" in ('license_removed', 'seats_reduced', 'excluded', 'threshold_changed', 'activity_resumed', 'seats_assigned', 'source_removed', 'price_changed', 'other'));
  END IF;
END $$;


ALTER TABLE public.savings_ledger ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.savings_ledger FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'licensemeter_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.savings_ledger TO licensemeter_app;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'savings_ledger' AND policyname = 'app_all') THEN
      CREATE POLICY app_all ON public.savings_ledger FOR ALL TO licensemeter_app USING (true) WITH CHECK (true);
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'licensemeter_tenant') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.savings_ledger TO licensemeter_tenant;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'savings_ledger' AND policyname = 'tenant_isolation') THEN
      CREATE POLICY tenant_isolation ON public.savings_ledger FOR ALL TO licensemeter_tenant
        USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
    END IF;
  END IF;
END $$;
COMMIT;
