import { exclusionMatcher } from "~/lib/findingExclusions";
import type { EntraIdentity } from "~/server/adobe/analyze";

/**
 * Admin exclusions for connector seats (Adobe and SaaS), so an excluded
 * account gets no per-user connector finding either. A seat is excluded when
 * its own email or display name matches, or when it belongs to a directory
 * user whose UPN or display name matches (seats often sit on a mail alias).
 *
 * Only the seats leave the analysis. The directory identities the connector
 * rules correlate against stay complete: dropping excluded users there would
 * turn their seats into false "no Entra account" findings.
 */
export const connectorSeatExclusion = (
  patterns: readonly string[],
  directory: readonly {
    graphId: string;
    upn: string;
    displayName: string | null;
  }[],
  identities: readonly EntraIdentity[],
): ((seat: { email: string; displayName?: string | null }) => boolean) => {
  if (patterns.length === 0) return () => false;
  const isExcluded = exclusionMatcher(patterns);
  const excludedIds = new Set(
    directory.filter((u) => isExcluded(u)).map((u) => u.graphId),
  );
  const idByAddress = new Map(
    identities.map((i) => [i.upn.toLowerCase(), i.graphId]),
  );
  return (seat) => {
    if (isExcluded({ upn: seat.email, displayName: seat.displayName ?? null }))
      return true;
    const graphId = idByAddress.get(seat.email.toLowerCase());
    return graphId !== undefined && excludedIds.has(graphId);
  };
};
