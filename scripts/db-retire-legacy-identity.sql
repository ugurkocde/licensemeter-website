-- Hosted upgrade from the schema through migration 0010. Do not use db:push for this upgrade.
BEGIN;
-- Stop old application instances before applying this migration.
-- Lock before checking so identities cannot change between the check and drop.
LOCK TABLE memberships, msp_accounts, join_requests IN ACCESS EXCLUSIVE MODE;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM memberships WHERE workos_user_id IS NOT NULL AND oid IS NULL) THEN
    RAISE EXCEPTION 'Unmapped memberships remain. Assign verified Microsoft object IDs or explicitly remove obsolete memberships before retiring identity columns.';
  END IF;
  IF EXISTS (SELECT 1 FROM msp_accounts WHERE owner_workos_user_id IS NOT NULL AND owner_oid IS NULL) THEN
    RAISE EXCEPTION 'Unmapped MSP owners remain. Assign verified Microsoft owner object IDs before retiring identity columns.';
  END IF;
  IF EXISTS (SELECT 1 FROM join_requests WHERE oid IS NULL AND status = 'pending') THEN
    RAISE EXCEPTION 'Pending requests without Microsoft identities remain. Decline them and issue fresh invitations before retiring identity columns.';
  END IF;
END $$;
--> statement-breakpoint
DROP TABLE "membership_claims";--> statement-breakpoint
DROP INDEX "join_requests_workos_user_idx";--> statement-breakpoint
DROP INDEX "memberships_workos_user_idx";--> statement-breakpoint
DROP INDEX "msp_accounts_owner_workos_user_idx";--> statement-breakpoint
DROP INDEX "tenants_workos_org_idx";--> statement-breakpoint
ALTER TABLE "consent_states" DROP COLUMN "workos_user_id";--> statement-breakpoint
ALTER TABLE "join_requests" DROP COLUMN "workos_user_id";--> statement-breakpoint
ALTER TABLE "memberships" DROP COLUMN "workos_user_id";--> statement-breakpoint
ALTER TABLE "msp_accounts" DROP COLUMN "owner_workos_user_id";--> statement-breakpoint
ALTER TABLE "tenants" DROP COLUMN "workos_org_id";
--> statement-breakpoint
DROP INDEX "join_requests_tenant_legacy_email_idx";
COMMIT;
