import type { AdobeUser, SaasSeat } from "~/server/types";

/**
 * Seats and Adobe users are stored one row per lowercased email, but provider
 * APIs can return several accounts for one address (Salesforce allows the
 * same Email on many users, e.g. an admin and a regular login). A single
 * upsert batch cannot touch the same key twice, so accounts are folded into
 * one row per email before they are analyzed or persisted.
 */
export const mergeSaasSeats = (seats: SaasSeat[]): SaasSeat[] => {
  const byEmail = new Map<string, SaasSeat>();
  for (const seat of seats) {
    const email = seat.email.toLowerCase();
    const prev = byEmail.get(email);
    if (!prev) {
      byEmail.set(email, { ...seat, email, products: [...seat.products] });
      continue;
    }
    byEmail.set(email, {
      email,
      displayName: prev.displayName ?? seat.displayName,
      status:
        prev.status === "active" || seat.status === "active"
          ? "active"
          : prev.status,
      // Each account holds its own paid seat, so products are concatenated
      // (not deduplicated) to keep seat counts and monthly impact intact.
      products: [...prev.products, ...seat.products],
      lastActiveAt: latest(prev.lastActiveAt, seat.lastActiveAt),
    });
  }
  return [...byEmail.values()];
};

export const mergeAdobeUsers = (users: AdobeUser[]): AdobeUser[] => {
  const byEmail = new Map<string, AdobeUser>();
  for (const user of users) {
    const email = user.email.toLowerCase();
    const prev = byEmail.get(email);
    if (!prev) {
      byEmail.set(email, { ...user, email, products: [...user.products] });
      continue;
    }
    byEmail.set(email, {
      email,
      status:
        prev.status === "active" || user.status === "active"
          ? "active"
          : prev.status,
      // Product profiles are memberships, not seat counts: union them.
      products: [...new Set([...prev.products, ...user.products])],
    });
  }
  return [...byEmail.values()];
};

const latest = (a: Date | null, b: Date | null): Date | null =>
  a && b ? (a > b ? a : b) : (a ?? b);
