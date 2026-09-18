CREATE TABLE "join_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"email" text NOT NULL,
	"workos_user_id" text NOT NULL,
	"name" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by_membership_id" uuid,
	CONSTRAINT "join_requests_status_check" CHECK ("join_requests"."status" in ('pending', 'approved', 'declined'))
);
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "domain_join_mode" text DEFAULT 'approval' NOT NULL;--> statement-breakpoint
ALTER TABLE "join_requests" ADD CONSTRAINT "join_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "join_requests" ADD CONSTRAINT "join_requests_decided_by_membership_id_memberships_id_fk" FOREIGN KEY ("decided_by_membership_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "join_requests_tenant_email_idx" ON "join_requests" USING btree ("tenant_id","email");--> statement-breakpoint
CREATE INDEX "join_requests_tenant_status_idx" ON "join_requests" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "join_requests_workos_user_idx" ON "join_requests" USING btree ("workos_user_id");--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_domain_join_mode_check" CHECK ("tenants"."domain_join_mode" in ('off', 'approval', 'auto'));--> statement-breakpoint
-- Existing workspaces: silent auto-join becomes approval, everything else is
-- invite only. Members who already joined are untouched.
UPDATE "tenants" SET "domain_join_mode" = CASE WHEN "allow_domain_join" THEN 'approval' ELSE 'off' END;
