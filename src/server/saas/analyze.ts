import type { WasteFinding } from "~/server/waste/engine";
import type { SaasProvider, SaasSeat } from "~/server/types";
import type { EntraIdentity } from "~/server/adobe/analyze";

import { CONNECTOR_LABELS } from "~/lib/connectors";

export const saasPriceKey = (provider: SaasProvider, product: string): string =>
  `${provider}:${product}`;

/**
 * The same offboarding-leak correlation as the Adobe connector, plus an
 * inactivity rule where the provider exposes a last-login signal. A null
 * lastActiveAt produces no finding: absence of data is not evidence of
 * waste (same conservatism as the Graph-side rules).
 */
export const analyzeSaasWaste = (
  provider: SaasProvider,
  seats: SaasSeat[],
  entraUsers: EntraIdentity[],
  prices: Record<string, number>,
  opts: { inactiveDays: number; now: Date },
): WasteFinding[] => {
  const label = CONNECTOR_LABELS[provider];
  const entraByEmail = new Map(entraUsers.map((u) => [u.upn.toLowerCase(), u]));
  // Without a synced directory (Microsoft not connected) the leak rules have
  // nothing to correlate against; only the provider's own inactivity signal
  // remains meaningful.
  const hasDirectory = entraUsers.length > 0;
  const findings: WasteFinding[] = [];

  for (const seat of seats) {
    if (seat.status !== "active") continue;
    const email = seat.email.toLowerCase();
    const entra = entraByEmail.get(email);
    const monthlyImpactCents = seat.products.reduce(
      (sum, p) => sum + (prices[saasPriceKey(provider, p)] ?? 0),
      0,
    );
    const detail = {
      upn: seat.email,
      products: seat.products,
      provider,
    };

    if (hasDirectory && entra && !entra.accountEnabled) {
      findings.push({
        dedupeKey: `saas_disabled_in_entra|${provider}:${email}|-`,
        rule: "saas_disabled_in_entra",
        graphUserId: entra.graphId,
        skuId: null,
        title: `${label} seat, user disabled in Entra: ${entra.displayName ?? seat.email}`,
        detail,
        monthlyImpactCents,
      });
    } else if (hasDirectory && !entra) {
      findings.push({
        dedupeKey: `saas_orphaned|${provider}:${email}|-`,
        rule: "saas_orphaned",
        graphUserId: null,
        skuId: null,
        title: `${label} seat without Entra account: ${seat.email}`,
        detail,
        monthlyImpactCents,
      });
    } else if (seat.lastActiveAt) {
      const idleDays = Math.floor(
        (opts.now.getTime() - seat.lastActiveAt.getTime()) /
          (24 * 60 * 60 * 1000),
      );
      // Strictly more than the threshold, matching the Microsoft rule and the
      // "more than N days" wording.
      if (idleDays > opts.inactiveDays) {
        findings.push({
          dedupeKey: `saas_inactive|${provider}:${email}|-`,
          rule: "saas_inactive",
          graphUserId: entra?.graphId ?? null,
          skuId: null,
          title: `${label} seat unused for ${idleDays} days: ${entra?.displayName ?? seat.displayName ?? seat.email}`,
          detail: { ...detail, idleDays },
          monthlyImpactCents,
        });
      }
    }
  }

  return findings;
};
