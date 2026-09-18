CREATE TABLE "email_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"job" text NOT NULL,
	"period_key" text NOT NULL,
	"recipient" text NOT NULL,
	"status" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "email_deliveries_job_check" CHECK ("email_deliveries"."job" in ('digest', 'report')),
	CONSTRAINT "email_deliveries_status_check" CHECK ("email_deliveries"."status" in ('claimed', 'sent', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "digest_opt_out" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "report_opt_out" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "email_deliveries" ADD CONSTRAINT "email_deliveries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "email_deliveries_key_idx" ON "email_deliveries" USING btree ("tenant_id","job","period_key","recipient");--> statement-breakpoint
CREATE INDEX "email_deliveries_created_idx" ON "email_deliveries" USING btree ("created_at");