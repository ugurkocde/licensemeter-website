CREATE TABLE "metering_connections" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"tid" text NOT NULL,
	"consented_at" timestamp with time zone,
	"script_id" text,
	"script_name" text,
	"inactivity_days" integer DEFAULT 60 NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"sync_lock" uuid,
	"sync_started_at" timestamp with time zone,
	"last_sync_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "metering_connections_id_unique" UNIQUE("id"),
	CONSTRAINT "metering_inactivity_days" CHECK ("metering_connections"."inactivity_days" in (30, 60, 90))
);
--> statement-breakpoint
CREATE TABLE "metering_consent_states" (
	"state" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"oid" text NOT NULL,
	"tid" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metering_devices" (
	"tenant_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"device_id" text NOT NULL,
	"device_name" text NOT NULL,
	"reported_at" timestamp with time zone,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text NOT NULL,
	"payload" jsonb,
	CONSTRAINT "metering_devices_tenant_id_device_id_pk" PRIMARY KEY("tenant_id","device_id")
);
--> statement-breakpoint
CREATE TABLE "metering_history" (
	"tenant_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"device_id" text NOT NULL,
	"day" date NOT NULL,
	"payload" jsonb NOT NULL,
	CONSTRAINT "metering_history_tenant_id_device_id_day_pk" PRIMARY KEY("tenant_id","device_id","day")
);
--> statement-breakpoint
ALTER TABLE "metering_connections" ADD CONSTRAINT "metering_connections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metering_consent_states" ADD CONSTRAINT "metering_consent_states_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metering_consent_states" ADD CONSTRAINT "metering_consent_states_connection_id_metering_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."metering_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metering_devices" ADD CONSTRAINT "metering_devices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metering_devices" ADD CONSTRAINT "metering_devices_connection_id_metering_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."metering_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metering_history" ADD CONSTRAINT "metering_history_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metering_history" ADD CONSTRAINT "metering_history_connection_id_metering_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."metering_connections"("id") ON DELETE cascade ON UPDATE no action;