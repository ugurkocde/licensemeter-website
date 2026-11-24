import { CONNECTORS } from "~/lib/connectors";
import { exclusionMatcher } from "~/lib/findingExclusions";
import type {
  AdobeUser,
  ResolutionReason,
  SavingsReason,
  SaasProvider,
  SaasSeat,
} from "~/server/types";
import { connectorSeatExclusion } from "~/server/sync/connectorExclusions";
import { addressClaimantsOf, type DirectoryRow } from "~/server/sync/join";
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
  previousSkus?: readonly WasteSku[];
  adobe: readonly AdobeUser[];
  saas: ReadonlyMap<SaasProvider, readonly SaasSeat[]>;
  prices: Record<string, number>;
  exclusions: readonly string[];
  inactiveDays: number;
  now: Date;
  verifiedSources?: ReadonlySet<SeatSource>;
  removedSources?: readonly SeatSource[];
  previousInactiveDays?: number;
  analysisCurrency?: string;
};

export type ReclaimedSeats = {
  monthlyCents: number;
  seats: number;
  skuId: string | null;
};

type Resolution =
  | { reason: Exclude<ResolutionReason, SavingsReason> }
  | { reason: SavingsReason; entries: ReclaimedSeats[] };

export const normalizedEmail = (email: string) => email.trim().toLowerCase();

export const findingEmail = (f: Finding) =>
  typeof f.detail.upn === "string" ? normalizedEmail(f.detail.upn) : undefined;

export const directoryAddresses = (user: DirectoryRow) =>
  [user.upn, ...(user.mailAliases ?? [])].map(normalizedEmail);

const dayMs = 86_400_000;

const strings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];

export const findingLicenses = (f: Finding) => {
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
  const redundant = strings(f.detail.redundantSkuIds);
  for (const skuId of redundant) {
    if (!results.has(skuId))
      results.set(skuId, redundant.length === 1 ? f.monthlyImpactCents : 0);
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
      new Map(seats.map((seat) => [normalizedEmail(seat.email), seat])),
    ]),
  );
  const adobeByEmail = new Map(
    adobe.map((seat) => [normalizedEmail(seat.email), seat]),
  );
  const excluded = exclusionMatcher(exclusions);
  const seatExcluded = connectorSeatExclusion(exclusions, users);
  const directoryClaims = addressClaimantsOf(users);
  return (f: Finding): Resolution => {
    const source = findingSource(f);
    if (removedSources?.includes(source)) return { reason: "source_removed" };
    const user = f.graphUserId ? usersById.get(f.graphUserId) : undefined;
    const d = f.detail;
    const email = findingEmail(f);
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
      const byEmail =
        source === "adobe" ? adobeByEmail : seatsBySource.get(source);
      const people = user
        ? [user]
        : ((email ? directoryClaims.get(email)?.all : undefined) ?? []);
      const addresses = new Set([
        ...(email ? [email] : []),
        ...people.flatMap(directoryAddresses),
      ]);
      const matchingSeats = [...addresses].flatMap((address) => {
        const seat = byEmail?.get(address);
        return seat ? [seat] : [];
      });
      const seat = matchingSeats[0];
      const products = [...new Set(strings(d.products))];
      const isImport = CONNECTORS.some(
        (connector) =>
          connector.provider === source && connector.kind === "import",
      );
      const stillHeld = matchingSeats.some(
        (row) =>
          isImport ||
          (row.status === "active" &&
            row.products.some((product) => products.includes(product))),
      );
      if (
        !stillHeld &&
        email &&
        verifiedSources?.has(source) &&
        products.length > 0
      ) {
        const priced = products
          .map((product) => prices[`${source}:${product}`] ?? 0)
          .filter((cents) => cents > 0);
        const monthlyCents = Math.min(
          f.monthlyImpactCents,
          priced.reduce((sum, cents) => sum + cents, 0),
        );
        if (monthlyCents > 0 && (source === "adobe" || billsPerSeat(source))) {
          return {
            reason: "license_removed",
            entries: [{ monthlyCents, seats: priced.length, skuId: null }],
          };
        }
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
        (f.rule.endsWith("_orphaned") && email && directoryClaims.has(email))
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
      if (typeof d.prepaidEnabled !== "number") return { reason: "other" };
      const previouslyFlagged =
        typeof d.unassigned === "number" ? d.unassigned : 0;
      const dropped = d.prepaidEnabled - (sku?.prepaidEnabled ?? 0);
      const oldTrialUnits = typeof d.trialUnits === "number" ? d.trialUnits : 0;
      const paidDrop =
        paidSeatsOf({
          prepaidEnabled: d.prepaidEnabled,
          trialUnits: oldTrialUnits,
        }) - (sku ? paidSeatsOf(sku) : 0);
      const seats = Math.min(dropped, paidDrop, previouslyFlagged);
      const unitPrice =
        prices[f.skuId] ??
        (typeof d.unitPriceCents === "number" ? d.unitPriceCents : 0);
      if (verifiedSources?.has(source) && seats > 0 && unitPrice > 0) {
        return {
          reason: "seats_reduced",
          entries: [{ monthlyCents: seats * unitPrice, seats, skuId: f.skuId }],
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

    const licenses = findingLicenses(f);
    if (f.graphUserId && verifiedSources?.has(source)) {
      let remaining = f.monthlyImpactCents;
      const entries: ReclaimedSeats[] = [];
      for (const [skuId, cents] of licenses) {
        if (user?.licenses.some((license) => license.skuId === skuId)) continue;
        const monthlyCents = Math.min(remaining, cents);
        if (monthlyCents <= 0) continue;
        entries.push({ skuId, seats: 1, monthlyCents });
        remaining -= monthlyCents;
      }
      if (entries.length) return { reason: "license_removed", entries };
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
