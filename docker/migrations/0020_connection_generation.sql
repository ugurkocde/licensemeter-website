ALTER TABLE "adobe_connections" ADD COLUMN "generation" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "ms_connections" ADD COLUMN "generation" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "saas_connections" ADD COLUMN "generation" uuid DEFAULT gen_random_uuid() NOT NULL;