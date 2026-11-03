ALTER TABLE "tenant_skus" ADD COLUMN "trial_units" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_skus" ADD COLUMN "next_lifecycle_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "finding_exclusions" text[] DEFAULT '{}'::text[] NOT NULL;