CREATE TABLE "metering_connections" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"tid" text NOT NULL,
	"consented_at" timestamp with time zone,
	"script_id" text,
	"script_name" text,
	"inactivity_days" integer DEFAULT 60 NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"excluded_apps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"program_overrides" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"collectors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "metering_connections_id_unique" UNIQUE("id"),
	CONSTRAINT "metering_inactivity_days" CHECK ("metering_connections"."inactivity_days" in (30, 60, 90))
);
--> statement-breakpoint
ALTER TABLE "metering_connections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "metering_consent_states" (
	"state" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"oid" text NOT NULL,
	"tid" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "metering_consent_states" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "metering_connections" ADD CONSTRAINT "metering_connections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metering_consent_states" ADD CONSTRAINT "metering_consent_states_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metering_consent_states" ADD CONSTRAINT "metering_consent_states_connection_id_metering_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."metering_connections"("id") ON DELETE cascade ON UPDATE no action;