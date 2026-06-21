/**
 * One-off, idempotent-ish Stripe Customer Portal configuration. Creates a
 * portal configuration that lets a customer update their card, see invoices,
 * cancel at period end, and switch among the six LicenseMeter prices. Prints
 * the configuration id for STRIPE_PORTAL_CONFIGURATION_ID.
 *
 * Prerequisite: run scripts/setup-stripe.ts first and export the six
 * STRIPE_PRICE_* ids, then:
 *   STRIPE_SECRET_KEY=sk_test_... \
 *   STRIPE_PRICE_STARTER_MONTHLY=price_... STRIPE_PRICE_STARTER_ANNUAL=price_... \
 *   STRIPE_PRICE_GROWTH_MONTHLY=price_...  STRIPE_PRICE_GROWTH_ANNUAL=price_... \
 *   STRIPE_PRICE_SCALE_MONTHLY=price_...   STRIPE_PRICE_SCALE_ANNUAL=price_... \
 *   APP_BASE_URL=https://licensemeter.com \
 *   npx tsx scripts/setup-stripe-portal.ts
 *
 * Re-running creates a NEW configuration; point STRIPE_PORTAL_CONFIGURATION_ID
 * at the latest. Downgrades and annual->monthly switches are deferred to the
 * period end (no surprise mid-term credits); upgrades prorate immediately.
 */
import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error("STRIPE_SECRET_KEY is required");
  process.exit(1);
}
const stripe = new Stripe(key, { apiVersion: "2026-05-27.dahlia" });

const baseUrl = process.env.APP_BASE_URL ?? "https://licensemeter.com";

const TIER_PRICE_ENV: Array<[string, string]> = [
  ["STRIPE_PRICE_STARTER_MONTHLY", "STRIPE_PRICE_STARTER_ANNUAL"],
  ["STRIPE_PRICE_GROWTH_MONTHLY", "STRIPE_PRICE_GROWTH_ANNUAL"],
  ["STRIPE_PRICE_SCALE_MONTHLY", "STRIPE_PRICE_SCALE_ANNUAL"],
];

async function buildProducts() {
  const products: Stripe.BillingPortal.ConfigurationCreateParams.Features.SubscriptionUpdate.Product[] =
    [];
  for (const [monthlyEnv, annualEnv] of TIER_PRICE_ENV) {
    const monthly = process.env[monthlyEnv];
    const annual = process.env[annualEnv];
    if (!monthly || !annual) {
      console.error(`Missing ${monthlyEnv} or ${annualEnv}`);
      process.exit(1);
    }
    const price = await stripe.prices.retrieve(monthly);
    const productId =
      typeof price.product === "string" ? price.product : price.product.id;
    products.push({ product: productId, prices: [monthly, annual] });
  }
  return products;
}

async function main() {
  const products = await buildProducts();
  const config = await stripe.billingPortal.configurations.create({
    business_profile: {
      headline: "Manage your LicenseMeter subscription",
      privacy_policy_url: `${baseUrl}/privacy`,
      terms_of_service_url: `${baseUrl}/terms`,
    },
    features: {
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      customer_update: {
        enabled: true,
        allowed_updates: ["address", "tax_id", "email", "name"],
      },
      subscription_cancel: {
        enabled: true,
        mode: "at_period_end",
      },
      subscription_update: {
        enabled: true,
        default_allowed_updates: ["price"],
        proration_behavior: "create_prorations",
        products,
        // Defer downgrades and annual->monthly to the period end so a switch
        // never issues a surprise mid-term credit.
        schedule_at_period_end: {
          conditions: [
            { type: "decreasing_item_amount" },
            { type: "shortening_interval" },
          ],
        },
      },
    },
  });
  console.log("\n# Paste into your env:");
  console.log(`STRIPE_PORTAL_CONFIGURATION_ID="${config.id}"`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
