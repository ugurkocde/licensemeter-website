import type { WasteFinding } from "~/server/waste/engine";
import type { AdobeUser } from "~/server/types";

export const adobePriceKey = (product: string): string => `adobe:${product}`;

export type EntraIdentity = {
  graphId: string;
  upn: string;
  displayName: string | null;
  accountEnabled: boolean;
};

/**
 * Adobe offboarding-leak detection: Adobe has no usage API, but correlating
 * seats with Entra account state catches what Adobe's own console cannot:
 * seats held by people who were disabled or never existed in the directory.
 */
export const analyzeAdobeWaste = (
  adobeUsers: AdobeUser[],
  entraUsers: EntraIdentity[],
  prices: Record<string, number>,
): WasteFinding[] => {
  const entraByEmail = new Map(entraUsers.map((u) => [u.upn.toLowerCase(), u]));
  const findings: WasteFinding[] = [];
  // Without a synced directory (Microsoft not connected) there is nothing to
  // correlate seats against: no orphan or disabled-account findings.
  if (entraUsers.length === 0) return findings;

  for (const adobe of adobeUsers) {
    if (adobe.status !== "active") continue;
    const email = adobe.email.toLowerCase();
    const entra = entraByEmail.get(email);
    const monthlyImpactCents = adobe.products.reduce(
      (sum, p) => sum + (prices[adobePriceKey(p)] ?? 0),
      0,
    );
    const detail = {
      upn: adobe.email,
      products: adobe.products,
      adobe: true,
    };

    if (entra && !entra.accountEnabled) {
      findings.push({
        dedupeKey: `adobe_disabled_in_entra|${email}|-`,
        rule: "adobe_disabled_in_entra",
        graphUserId: entra.graphId,
        skuId: null,
        title: `Adobe seat, user disabled in Entra: ${entra.displayName ?? adobe.email}`,
        detail,
        monthlyImpactCents,
      });
    } else if (!entra) {
      findings.push({
        dedupeKey: `adobe_orphaned|${email}|-`,
        rule: "adobe_orphaned",
        graphUserId: null,
        skuId: null,
        title: `Adobe seat without Entra account: ${adobe.email}`,
        detail,
        monthlyImpactCents,
      });
    }
  }

  return findings;
};
