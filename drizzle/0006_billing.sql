ALTER TABLE "tenants" ADD COLUMN "trial_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "subscription_status" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "paid_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "comped_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "trial_reminders" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"stripe_subscription_id" text NOT NULL,
	"stripe_customer_id" text NOT NULL,
	"stripe_price_id" text NOT NULL,
	"tier" text,
	"interval" text,
	"status" text NOT NULL,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"last_event_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stripe_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tenants_stripe_customer_idx" ON "tenants" USING btree ("stripe_customer_id") WHERE "stripe_customer_id" is not null;
