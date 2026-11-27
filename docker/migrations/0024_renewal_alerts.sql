ALTER TABLE "email_deliveries" DROP CONSTRAINT "email_deliveries_job_check";--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "renewal_opt_out" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_addresses" ADD COLUMN "renewal_alerts" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "email_deliveries" ADD CONSTRAINT "email_deliveries_job_check" CHECK ("email_deliveries"."job" in ('digest', 'report', 'leak', 'renewal'));