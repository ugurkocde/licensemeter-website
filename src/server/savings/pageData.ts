import { hasFeature, type Entitlement } from "~/server/entitlement";
import { priceConfidence, type licenseSpend } from "~/server/waste/spend";
import { loadLicenseSpend } from "~/server/waste/spendStore";
import { loadSavingsLedger } from "./ledger";

type Tenant = { id: string; currency: string; currencyRatePpm: number };

export function overviewPriceConfidence(
  entitlement: Entitlement,
  spend: ReturnType<typeof licenseSpend>,
  currencyRatePpm: number,
) {
  return hasFeature(entitlement, "savingsLedger")
    ? priceConfidence(spend, currencyRatePpm)
    : null;
}

export async function loadSavingsPageData(
  entitlement: Entitlement,
  tenant: Tenant,
) {
  if (!hasFeature(entitlement, "savingsLedger")) return null;
  const [ledger, { spend }] = await Promise.all([
    loadSavingsLedger(tenant.id, tenant.currency),
    loadLicenseSpend(tenant.id),
  ]);
  return { ledger, confidence: priceConfidence(spend, tenant.currencyRatePpm) };
}
