/**
 * One-off, idempotent Stripe catalog setup. Creates one Product per tier and a
 * monthly + annual EUR Price for each, then prints the six STRIPE_PRICE_* env
 * lines. Re-running finds the existing objects (Products by metadata.lm_key,
 * Prices by lookup_key) instead of duplicating.
 *
 * Run once per Stripe mode:
 *   STRIPE_SECRET_KEY=sk_test_... npx tsx scripts/setup-stripe.ts
 *   STRIPE_SECRET_KEY=sk_live_... npx tsx scripts/setup-stripe.ts
 *
 * tax_behavior is "inclusive": the advertised euro figure is the all-in total.
 * Stripe Tax (when STRIPE_TAX_ENABLED=true) then backs VAT out of it and
 * applies B2B reverse charge for valid EU VAT ids. tax_code txcd_10103001 is
 * "Software as a service (SaaS) - business use".
 */
import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error("STRIPE_SECRET_KEY is required");
  process.exit(1);
}
const stripe = new Stripe(key, { apiVersion: "2026-05-27.dahlia" });

const TIERS = [
  { tier: "starter", name: "LicenseMeter Starter", monthly: 7900, annual: 79000 },
  { tier: "growth", name: "LicenseMeter Growth", monthly: 19900, annual: 199000 },
  { tier: "scale", name: "LicenseMeter Scale", monthly: 49900, annual: 499000 },
] as const;

const TAX_CODE = "txcd_10103001";

async function findOrCreateProduct(lmKey: string, name: string) {
  const existing = await stripe.products.search({
    query: `metadata['lm_key']:'${lmKey}'`,
  });
  if (existing.data[0]) return existing.data[0];
  return stripe.products.create({
    name,
    tax_code: TAX_CODE,
    metadata: { lm_key: lmKey },
  });
}

async function findOrCreatePrice(
  productId: string,
  lookupKey: string,
  unitAmount: number,
  interval: "month" | "year",
) {
  const found = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 });
  if (found.data[0]) return found.data[0];
  return stripe.prices.create({
    product: productId,
    currency: "eur",
    unit_amount: unitAmount,
    recurring: { interval },
    tax_behavior: "inclusive",
    lookup_key: lookupKey,
    transfer_lookup_key: true,
  });
}

async function main() {
  const lines: string[] = [];
  for (const t of TIERS) {
    const product = await findOrCreateProduct(`lm_${t.tier}`, t.name);
    const monthly = await findOrCreatePrice(
      product.id,
      `lm_${t.tier}_monthly`,
      t.monthly,
      "month",
    );
    const annual = await findOrCreatePrice(
      product.id,
      `lm_${t.tier}_annual`,
      t.annual,
      "year",
    );
    const T = t.tier.toUpperCase();
    lines.push(`STRIPE_PRICE_${T}_MONTHLY="${monthly.id}"`);
    lines.push(`STRIPE_PRICE_${T}_ANNUAL="${annual.id}"`);
    console.error(`ok ${t.tier}: product ${product.id}`);
  }
  console.log("\n# Paste into your env (test vs live differ):");
  console.log(lines.join("\n"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
