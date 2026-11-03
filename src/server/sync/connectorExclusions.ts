import { exclusionMatcher } from "~/lib/findingExclusions";
import { addressClaimantsOf, type DirectoryRow } from "~/server/sync/join";

/**
 * Admin exclusions for connector seats (Adobe and SaaS), so an excluded
 * account gets no per-user connector finding either. A seat is excluded only
 * when its email correlates (UPN or a stored mail alias) to a directory user
 * whose UPN or display name matches a pattern, and, for an address several
 * users claim, only when all of them are excluded.
 *
 * The seat's own email and vendor display name are never matched: the seat
 * holder controls them, so a leaked account could hide itself by renaming.
 * A seat with no directory match is never excluded and keeps its orphaned
 * finding. The directory identities stay complete for the same reason:
 * dropping excluded users there would turn their seats into orphans.
 */
export const connectorSeatExclusion = (
  patterns: readonly string[],
  directory: readonly DirectoryRow[],
): ((seat: { email: string }) => boolean) => {
  if (patterns.length === 0) return () => false;
  const isExcluded = exclusionMatcher(patterns);
  const excludedIds = new Set(
    directory.filter((u) => isExcluded(u)).map((u) => u.graphId),
  );
  if (excludedIds.size === 0) return () => false;
  const claims = addressClaimantsOf(directory);
  // Conservative on shared addresses: the seat leaves the analysis only when
  // every directory user claiming its address is excluded.
  return (seat) => {
    const claimants = claims.get(seat.email.trim().toLowerCase())?.all ?? [];
    return (
      claimants.length > 0 && claimants.every((u) => excludedIds.has(u.graphId))
    );
  };
};
