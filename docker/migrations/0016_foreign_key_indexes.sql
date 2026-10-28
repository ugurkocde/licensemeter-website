CREATE INDEX "consent_states_tenant_idx" ON "consent_states" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "join_requests_decided_by_idx" ON "join_requests" USING btree ("decided_by_membership_id");--> statement-breakpoint
CREATE INDEX "metering_consent_states_tenant_idx" ON "metering_consent_states" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "metering_consent_states_connection_idx" ON "metering_consent_states" USING btree ("connection_id");