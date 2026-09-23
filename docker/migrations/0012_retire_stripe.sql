-- Stripe is no longer a billing provider. Paid plans run through Polar and
-- Microsoft Marketplace and are recorded in entitlements.
-- Lock before checking so no Stripe data can appear between the check and drop.
LOCK TABLE subscriptions, stripe_events, tenants, msp_accounts IN ACCESS EXCLUSIVE MODE;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM subscriptions) THEN
    RAISE EXCEPTION 'Stripe subscription rows remain. Move any paid workspace to an entitlement before retiring Stripe.';
  END IF;
  IF EXISTS (SELECT 1 FROM tenants WHERE stripe_customer_id IS NOT NULL)
     OR EXISTS (SELECT 1 FROM msp_accounts WHERE stripe_customer_id IS NOT NULL OR stripe_subscription_id IS NOT NULL OR stripe_price_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Stripe customer or subscription ids remain. Move any paid workspace or MSP account to an entitlement before retiring Stripe.';
  END IF;
END $$;
--> statement-breakpoint
DROP TABLE "stripe_events";--> statement-breakpoint
DROP TABLE "subscriptions";--> statement-breakpoint
DROP INDEX "msp_accounts_stripe_customer_idx";--> statement-breakpoint
DROP INDEX "msp_accounts_stripe_subscription_idx";--> statement-breakpoint
DROP INDEX "tenants_stripe_customer_idx";--> statement-breakpoint
ALTER TABLE "msp_accounts" DROP COLUMN "stripe_customer_id";--> statement-breakpoint
ALTER TABLE "msp_accounts" DROP COLUMN "stripe_subscription_id";--> statement-breakpoint
ALTER TABLE "msp_accounts" DROP COLUMN "stripe_price_id";--> statement-breakpoint
ALTER TABLE "tenants" DROP COLUMN "stripe_customer_id";
