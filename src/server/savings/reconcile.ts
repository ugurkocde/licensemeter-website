import type { savingsLedger } from "~/server/db/schema";
import type { SaasSeat } from "~/server/types";
import { savingsSubjectKey, savingsSubjectVersion } from "~/server/retention";
import {
  idleSeatsOf,
  paidSeatsOf,
  type WasteFinding,
  type WasteSku,
} from "~/server/waste/engine";
import {
  findingSource,
  vendorLabel,
  type SeatSource,
} from "~/server/waste/spend";
import {
  directoryAddresses,
  findingEmail,
  findingLicenses,
  normalizedEmail,
  type resolutionOf,
} from "./resolution";

type State = Parameters<typeof resolutionOf>[0];
type Entry = typeof savingsLedger.$inferInsert;
type ActiveEntry = typeof savingsLedger.$inferSelect;

export function savingsSubjects(tenantId: string, state?: State) {
  const users = new Map(state?.users.map((user) => [user.graphId, user]));
  return (
    finding: Pick<
      WasteFinding,
      "graphUserId" | "rule" | "detail" | "skuId" | "monthlyImpactCents"
    >,
  ) => {
    const source = findingSource(finding);
    const graphId = finding.graphUserId;
    const user = graphId ? users.get(graphId) : undefined;
    const email = findingEmail(finding);
    const keys = new Set<string>();
    if (graphId) keys.add(savingsSubjectKey(tenantId, "directory", graphId));
    if (source !== "microsoft") {
      if (email) keys.add(savingsSubjectKey(tenantId, source, email));
      if (user) {
        for (const address of directoryAddresses(user))
          keys.add(savingsSubjectKey(tenantId, source, address));
      }
    }
    return keys;
  };
}

const subjectProduct = (
  vendor: string,
  skuId: string | null,
  subject: string,
) => JSON.stringify([vendor, skuId, subject]);

export function reconcileSavings(
  active: ActiveEntry[],
  candidates: Entry[],
  opened: WasteFinding[],
  reopened: Set<string>,
  state: State | undefined,
  subjects: ReturnType<typeof savingsSubjects>,
  tenantId: string,
  now: Date,
) {
  const reversed = new Set<string>();
  const returnedRemovals = new Set<string>();
  const affectedSubjects = new Set<string>();
  const microsoft = vendorLabel("microsoft");
  const verifiedVendors = new Set(
    [...(state?.verifiedSources ?? [])].map(vendorLabel),
  );
  for (const finding of opened) {
    const vendor = vendorLabel(findingSource(finding));
    if (state && vendor !== microsoft && !verifiedVendors.has(vendor)) continue;
    const products =
      vendor === microsoft ? [...findingLicenses(finding).keys()] : [null];
    for (const subject of subjects(finding))
      for (const product of products)
        affectedSubjects.add(subjectProduct(vendor, product, subject));
  }

  const tracked = new Map<string, Set<string>>();
  for (const entry of active) {
    if (!entry.subjectKey) continue;
    const keys = tracked.get(entry.vendor) ?? new Set<string>();
    for (const key of entry.subjectKey.split(",")) keys.add(key);
    tracked.set(entry.vendor, keys);
  }
  // A returned seat consumes the credit even when the member is healthy
  // and therefore never triggers a new finding.
  const trackedMicrosoft = tracked.get(microsoft);
  if (trackedMicrosoft && state?.verifiedSources?.has("microsoft")) {
    for (const user of state.users) {
      const subject = savingsSubjectKey(tenantId, "directory", user.graphId);
      if (!trackedMicrosoft.has(subject)) continue;
      for (const license of user.licenses)
        affectedSubjects.add(subjectProduct(microsoft, license.skuId, subject));
    }
  }
  const checkConnector = (
    source: Exclude<SeatSource, "microsoft">,
    rows: readonly Pick<SaasSeat, "email" | "products" | "status">[],
  ) => {
    const vendor = vendorLabel(source);
    const trackedVendor = tracked.get(vendor);
    if (!trackedVendor || !state?.verifiedSources?.has(source)) return;
    const addresses = new Set(
      rows
        .filter((row) => row.status === "active" && row.products.length > 0)
        .map((row) => normalizedEmail(row.email)),
    );
    const mark = (scope: string, identity: string) => {
      const key = savingsSubjectKey(tenantId, scope, identity);
      if (trackedVendor.has(key))
        affectedSubjects.add(subjectProduct(vendor, null, key));
    };
    for (const address of addresses) mark(source, address);
    for (const user of state.users) {
      if (directoryAddresses(user).some((address) => addresses.has(address)))
        mark("directory", user.graphId);
    }
  };
  if (state) {
    checkConnector("adobe", state.adobe);
    for (const [source, seats] of state.saas) checkConnector(source, seats);
  }

  const removedVendors = new Set(state?.removedSources?.map(vendorLabel));
  const seen = new Set<string>();
  const version = `${savingsSubjectVersion()}:`;
  const keysOf = (entry: Entry) =>
    entry.subjectKey
      ?.split(",")
      .map((key) => subjectProduct(entry.vendor, entry.skuId ?? null, key)) ??
    [];
  for (const entry of active) {
    const keys = keysOf(entry);
    // A rotated secret (or a pre-version key) makes live verification
    // impossible. End the credit while preserving the accrued history.
    const obsoleteKey =
      entry.subjectKey && !entry.subjectKey.startsWith(version);
    const reopenedSeat =
      entry.findingId !== null &&
      reopened.has(entry.findingId) &&
      (!state ||
        entry.vendor === microsoft ||
        verifiedVendors.has(entry.vendor));
    const seatReturned =
      entry.reason === "license_removed" &&
      (reopenedSeat || keys.some((key) => affectedSubjects.has(key)));
    if (seatReturned) returnedRemovals.add(entry.id);
    if (obsoleteKey || removedVendors.has(entry.vendor) || seatReturned) {
      reversed.add(entry.id);
    } else {
      for (const key of keys) seen.add(key);
    }
  }

  const additions = candidates.filter((entry) => {
    const keys = keysOf(entry);
    if (keys.some((key) => seen.has(key) || affectedSubjects.has(key)))
      return false;
    for (const key of keys) seen.add(key);
    return true;
  });
  const successors: Entry[] = [];
  if (state?.verifiedSources?.has("microsoft")) {
    const current = new Map(state.skus.map((sku) => [sku.skuId, sku]));
    const previous = new Map(
      state.previousSkus?.map((sku) => [sku.skuId, sku]),
    );
    const bySku = <T extends { skuId?: string | null; vendor: string }>(
      rows: T[],
    ) => {
      const groups = new Map<string, T[]>();
      for (const row of rows) {
        if (row.vendor !== microsoft || !row.skuId) continue;
        const group = groups.get(row.skuId) ?? [];
        group.push(row);
        groups.set(row.skuId, group);
      }
      return groups;
    };
    const existingBySku = bySku(active);
    const newBySku = bySku(additions);
    const discarded = new Set<Entry>();
    const prepaid = (sku?: WasteSku) => sku?.prepaidEnabled ?? 0;
    const paid = (sku?: WasteSku) => (sku ? paidSeatsOf(sku) : 0);

    for (const skuId of new Set([
      ...existingBySku.keys(),
      ...newBySku.keys(),
    ])) {
      const sku = current.get(skuId);
      const old = previous.get(skuId);
      const prior = existingBySku.get(skuId) ?? [];
      const fresh = newBySku.get(skuId) ?? [];
      const purchase = fresh.find((entry) => entry.reason === "seats_reduced");
      const removals = fresh.filter(
        (entry) => entry.reason === "license_removed",
      );
      const paidDrop = Math.max(
        0,
        Math.min(prepaid(old) - prepaid(sku), paid(old) - paid(sku)),
      );
      const drop = state.previousSkus ? paidDrop : (purchase?.seats ?? 0);
      const increase = state.previousSkus
        ? Math.max(0, paid(sku) - paid(old))
        : 0;
      const release = old
        ? Math.max(0, old.consumedUnits - (sku?.consumedUnits ?? 0))
        : 0;
      const assignedGrowth = old
        ? (sku?.consumedUnits ?? 0) - old.consumedUnits
        : 0;
      const alreadyReturned = prior.reduce(
        (seats, entry) =>
          seats + (returnedRemovals.has(entry.id) ? entry.seats : 0),
        0,
      );
      let idle = sku ? idleSeatsOf(sku) : 0;
      // Net assignments beyond new paid seats consume existing capacity.
      // A matched return already reversed its own credit above.
      let replacedRemovals =
        drop + Math.max(0, assignedGrowth - increase - alreadyReturned);
      let restocked = increase;

      // Active credits cover two disjoint pools: net verified purchase reductions
      // and licenses freed into capacity that is still unassigned. A purchase cut
      // replaces old removal credits oldest first, even when shelfware stays open.
      // A same-sync release can extend the purchase credit beyond the old idle seats.
      for (const entry of prior) {
        if (reversed.has(entry.id)) continue;
        if (entry.reason === "seats_reduced") {
          if (restocked > 0) {
            reversed.add(entry.id);
            const remaining = entry.seats - restocked;
            if (remaining > 0) {
              // The successor retains the original realization date for the
              // ledger and starts accruing at the reversal timestamp.
              successors.push({
                tenantId: entry.tenantId,
                findingId: entry.findingId,
                rule: entry.rule,
                vendor: entry.vendor,
                skuId: entry.skuId,
                reason: entry.reason,
                currency: entry.currency,
                realizedAt: entry.realizedAt,
                createdAt: now,
                replacesEntryId: entry.id,
                seats: remaining,
                monthlyCents: Math.floor(
                  (entry.monthlyCents * remaining) / entry.seats,
                ),
              });
            }
            restocked -= Math.min(restocked, entry.seats);
          }
        } else if (replacedRemovals > 0 || entry.seats > idle) {
          reversed.add(entry.id);
          replacedRemovals = Math.max(0, replacedRemovals - entry.seats);
        } else {
          idle -= entry.seats;
        }
      }

      let used = 0;
      if (purchase) {
        const unitPrice = purchase.monthlyCents / purchase.seats;
        const base = Math.min(purchase.seats, drop);
        used = Math.min(drop - base, removals.length, release);
        purchase.seats = base + used;
        purchase.monthlyCents = purchase.seats * unitPrice;
        if (purchase.seats === 0) discarded.add(purchase);
      }
      let freed = Math.min(idle, release - used);
      for (const [index, removal] of removals.entries()) {
        if (index < used || freed < removal.seats) discarded.add(removal);
        else freed -= removal.seats;
      }
    }
    return {
      reversed,
      additions: additions
        .filter((entry) => !discarded.has(entry))
        .concat(successors),
    };
  }
  return { reversed, additions };
}
