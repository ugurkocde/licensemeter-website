import type { savingsLedger } from "~/server/db/schema";
import { savingsSubjectKey } from "~/server/retention";
import {
  idleSeatsOf,
  paidSeatsOf,
  type WasteFinding,
  type WasteSku,
} from "~/server/waste/engine";
import { findingSource, vendorLabel } from "~/server/waste/spend";
import {
  directoryAddresses,
  findingEmail,
  findingLicenses,
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
) {
  const reversed = new Set<string>();
  const affectedSubjects = new Set<string>();
  const microsoft = vendorLabel("microsoft");
  for (const finding of opened) {
    const vendor = vendorLabel(findingSource(finding));
    const products =
      vendor === microsoft ? [...findingLicenses(finding).keys()] : [null];
    for (const subject of subjects(finding))
      for (const product of products)
        affectedSubjects.add(subjectProduct(vendor, product, subject));
  }
  // A reassignment can consume the freed seat even if the person is healthy
  // and therefore never triggers a new finding.
  if (state?.verifiedSources?.has("microsoft")) {
    const tracked = new Set(
      active
        .filter((entry) => entry.vendor === microsoft && entry.subjectKey)
        .map((entry) => entry.subjectKey),
    );
    if (tracked.size) {
      for (const user of state.users) {
        const subject = savingsSubjectKey(tenantId, "directory", user.graphId);
        if (!tracked.has(subject)) continue;
        for (const license of user.licenses)
          affectedSubjects.add(
            subjectProduct(microsoft, license.skuId, subject),
          );
      }
    }
  }
  const removedVendors = new Set(state?.removedSources?.map(vendorLabel));
  const seen = new Set<string>();
  for (const entry of active) {
    const key =
      entry.subjectKey &&
      subjectProduct(entry.vendor, entry.skuId, entry.subjectKey);
    if (
      removedVendors.has(entry.vendor) ||
      (entry.findingId && reopened.has(entry.findingId)) ||
      (entry.reason === "license_removed" && key && affectedSubjects.has(key))
    ) {
      reversed.add(entry.id);
    } else if (key) {
      seen.add(key);
    }
  }

  const additions = candidates.filter((entry) => {
    if (!entry.subjectKey) return true;
    const key = subjectProduct(
      entry.vendor,
      entry.skuId ?? null,
      entry.subjectKey,
    );
    if (seen.has(key) || affectedSubjects.has(key)) return false;
    seen.add(key);
    return true;
  });
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
        ? Math.max(0, paid(sku) - paid(old), prepaid(sku) - prepaid(old))
        : 0;
      const release = old
        ? Math.max(0, old.consumedUnits - (sku?.consumedUnits ?? 0))
        : 0;
      let idle = sku ? idleSeatsOf(sku) : 0;
      let replacedRemovals = drop;
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
            restocked -= entry.seats;
          }
        } else if (replacedRemovals > 0 || entry.seats > idle) {
          reversed.add(entry.id);
          replacedRemovals -= entry.seats;
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
      additions: additions.filter((entry) => !discarded.has(entry)),
    };
  }
  return { reversed, additions };
}
