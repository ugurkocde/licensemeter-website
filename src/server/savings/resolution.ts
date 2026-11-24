import { exclusionMatcher } from "~/lib/findingExclusions";
import type {
  AdobeUser,
  ResolutionReason,
  SaasProvider,
  SaasSeat,
} from "~/server/types";
import { connectorSeatExclusion } from "~/server/sync/connectorExclusions";
import type { DirectoryRow } from "~/server/sync/join";
import {
  COPILOT_INACTIVE_DAYS,
  INACTIVE_DAYS,
  idleSeatsOf,
  paidSeatsOf,
  type WasteFinding,
  type WasteSku,
  type WasteUser,
} from "~/server/waste/engine";
import {
  billsPerSeat,
  findingSource,
  type SeatSource,
} from "~/server/waste/spend";

type Finding = Pick<
  WasteFinding,
  "rule" | "detail" | "graphUserId" | "skuId" | "monthlyImpactCents"
>;

type WorkspaceState = {
  users: readonly (DirectoryRow &
    Pick<WasteUser, "licenses" | "lastActivity" | "copilotLastActivity">)[];
  skus: readonly WasteSku[];
  adobe: readonly AdobeUser[];
  saas: ReadonlyMap<SaasProvider, readonly SaasSeat[]>;
  prices: Record<string, number>;
  exclusions: readonly string[];
  inactiveDays: number;
  now: Date;
  verifiedSources?: ReadonlySet<SeatSource>;
  removedSources?: readonly SeatSource[];
  previousInactiveDays?: number;
};

type Resolution = {
  reason: ResolutionReason;
  monthlyCents?: number;
  skuId?: string | null;
};
const dayMs = 86_400_000;

const strings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];

const oldLicenses = (f: Finding) => {
  const results = new Map<string, number>();
  if (f.skuId && f.graphUserId) results.set(f.skuId, f.monthlyImpactCents);
  if (Array.isArray(f.detail.licenses)) {
    const rows: unknown[] = f.detail.licenses;
    for (const license of rows) {
      if (
        license &&
        typeof license === "object" &&
        "skuId" in license &&
        "monthlyPriceCents" in license &&
        typeof license.skuId === "string" &&
        typeof license.monthlyPriceCents === "number"
      ) {
        results.set(license.skuId, license.monthlyPriceCents);
      }
    }
  }
  return results;
};

/** Classify a disappeared finding using current facts. Missing signals are not proof of reclamation. */
export function resolutionOf(state: WorkspaceState) {
  const {
    users,
    skus,
    adobe,
    saas,
    prices,
    exclusions,
    inactiveDays,
    now,
    verifiedSources,
    removedSources,
  } = state;
  const usersById = new Map(users.map((user) => [user.graphId, user]));
  const skusById = new Map(skus.map((sku) => [sku.skuId, sku]));
  const seatsBySource = new Map(
    [...saas].map(([source, seats]) => [
      source,
      new Map(seats.map((seat) => [seat.email.toLowerCase(), seat])),
    ]),
  );
  const adobeByEmail = new Map(
    adobe.map((seat) => [seat.email.toLowerCase(), seat]),
  );
  const excluded = exclusionMatcher(exclusions);
  const seatExcluded = connectorSeatExclusion(exclusions, users);
  const directoryEmails = new Set(
    users
      .flatMap((u) => [u.upn, ...(u.mailAliases ?? [])])
      .map((email) => email.toLowerCase()),
  );
  return (f: Finding): Resolution => {
    const source = findingSource(f);
    if (removedSources?.includes(source)) return { reason: "source_removed" };
    const user = f.graphUserId ? usersById.get(f.graphUserId) : undefined;
    const d = f.detail;
    const email = typeof d.upn === "string" ? d.upn.toLowerCase() : undefined;
    const pastThreshold =
      typeof d.inactiveThreshold === "number"
        ? d.inactiveThreshold
        : state.previousInactiveDays;
    const oldDates = (value: unknown) =>
      typeof value === "string" ? Date.parse(value) : 0;
    const within = (date: Date | null | undefined, days: number) =>
      date && Math.floor((now.getTime() - date.getTime()) / dayMs) <= days;
    const priceZero = (keys: string[]) =>
      f.monthlyImpactCents > 0 &&
      keys.length > 0 &&
      keys.every((key) => prices[key] === 0);

    if (source !== "microsoft") {
      const seat = email
        ? source === "adobe"
          ? adobeByEmail.get(email)
          : seatsBySource.get(source)?.get(email)
        : undefined;
      const products = [...new Set(strings(d.products))];
      const removed = products.filter(
        (product) => !seat?.products.includes(product),
      );
      if (email && verifiedSources?.has(source) && removed.length > 0) {
        const keys = removed.map((product) => `${source}:${product}`);
        const monthlyCents =
          source === "adobe" || billsPerSeat(source)
            ? Math.min(
                f.monthlyImpactCents,
                keys.reduce((sum, key) => sum + (prices[key] ?? 0), 0),
              )
            : 0;
        return { reason: "license_removed", monthlyCents, skuId: null };
      }
      if (seat && seatExcluded(seat)) return { reason: "excluded" };
      const activity =
        seat && "lastActiveAt" in seat && seat.lastActiveAt instanceof Date
          ? seat.lastActiveAt
          : null;
      if (
        f.rule === "saas_inactive" &&
        activity &&
        within(activity, inactiveDays)
      ) {
        if (
          pastThreshold !== undefined &&
          inactiveDays > pastThreshold &&
          !within(activity, pastThreshold)
        )
          return { reason: "threshold_changed" };
        if (activity.getTime() > oldDates(d.lastActiveAt))
          return { reason: "activity_resumed" };
      }
      if (
        (f.rule.endsWith("_disabled_in_entra") && user?.accountEnabled) ||
        (f.rule.endsWith("_orphaned") && email && directoryEmails.has(email))
      ) {
        return { reason: "activity_resumed" };
      }
      return {
        reason: priceZero(products.map((product) => `${source}:${product}`))
          ? "price_changed"
          : "other",
      };
    }

    if (f.rule === "shelfware" && f.skuId) {
      const sku = skusById.get(f.skuId);
      const purchased = typeof d.purchased === "number" ? d.purchased : 0;
      const previouslyFlagged =
        typeof d.unassigned === "number" ? d.unassigned : 0;
      const dropped = purchased - (sku ? paidSeatsOf(sku) : 0);
      if (verifiedSources?.has(source) && dropped > 0) {
        const unitPrice =
          typeof d.unitPriceCents === "number"
            ? d.unitPriceCents
            : previouslyFlagged > 0
              ? Math.floor(f.monthlyImpactCents / previouslyFlagged)
              : 0;
        return {
          reason: "seats_reduced",
          monthlyCents: Math.min(dropped, previouslyFlagged) * unitPrice,
          skuId: f.skuId,
        };
      }
      if (
        sku &&
        idleSeatsOf(sku) === 0 &&
        sku.consumedUnits > Number(d.assigned)
      )
        return { reason: "seats_assigned" };
      return { reason: priceZero([f.skuId]) ? "price_changed" : "other" };
    }

    const licenses = oldLicenses(f);
    // Older overlap rows carry one total for several products. Avoid assigning
    // that value to a partial removal without per-product evidence.
    const redundant = strings(d.redundantSkuIds);
    if (!user && licenses.size === 0 && redundant.length > 1) {
      // The entire old bundle is gone. Its aggregate value is all we know.
      const value = f.monthlyImpactCents;
      if (f.graphUserId && verifiedSources?.has(source))
        return { reason: "license_removed", monthlyCents: value };
    }
    for (const skuId of redundant) {
      if (!licenses.has(skuId))
        licenses.set(skuId, redundant.length === 1 ? f.monthlyImpactCents : 0);
    }
    const removed = [...licenses].filter(
      ([skuId]) => !user?.licenses.some((license) => license.skuId === skuId),
    );
    if (
      f.graphUserId &&
      verifiedSources?.has(source) &&
      (!user || removed.length)
    ) {
      const monthlyCents = Math.min(
        f.monthlyImpactCents,
        removed.reduce((sum, [, cents]) => sum + cents, 0),
      );
      return {
        reason: "license_removed",
        monthlyCents,
        skuId: removed.length === 1 ? removed[0]![0] : null,
      };
    }
    if (user && excluded(user)) return { reason: "excluded" };
    if (
      f.rule === "inactive_90d" &&
      user &&
      within(user.lastActivity, inactiveDays)
    ) {
      const previous = pastThreshold ?? INACTIVE_DAYS;
      if (inactiveDays > previous && !within(user.lastActivity, previous))
        return { reason: "threshold_changed" };
      if (user.lastActivity!.getTime() > oldDates(d.lastActivity))
        return { reason: "activity_resumed" };
    }
    if (
      (f.rule === "disabled_account_with_license" && user?.accountEnabled) ||
      (f.rule === "never_active" && user?.lastActivity) ||
      (f.rule === "copilot_unused" &&
        within(user?.copilotLastActivity, COPILOT_INACTIVE_DAYS))
    ) {
      return { reason: "activity_resumed" };
    }
    return {
      reason: priceZero([...licenses.keys()]) ? "price_changed" : "other",
    };
  };
}
