import { sameRenewalVendor } from "~/lib/renewalVendor";
import {
  renewalAlertsApply,
  termOf,
  type SkuTermSetting,
} from "~/lib/renewalTerm";
import { isKnownFreeSku } from "~/server/graph/skuCatalog";
import type { RenewalTerm, WasteRuleId } from "~/server/types";
import { findingSource } from "~/server/waste/spend";

/**
 * Renewal savings plan: for every upcoming paid renewal, how many seats to
 * renew and what cutting the rest saves per year. Pure, so every edge case is
 * unit tested and the page, the API and the calendar export agree.
 */

/** Lead time before a Microsoft renewal, so a lower seat count is set in time. */
export const MICROSOFT_ACT_BY_DAYS = 7;
export const DEFAULT_BUFFER_PCT = 5;
export const MAX_BUFFER_PCT = 50;

export type PlanSku = {
  skuId: string;
  skuPartNumber: string;
  displayName: string | null;
  prepaidEnabled: number;
  consumedUnits: number;
  trialUnits: number;
  nextLifecycleAt: Date | null;
};

export type PlanContract = {
  id: string;
  vendor: string;
  contractName: string;
  /** yyyy-mm-dd */
  renewalDate: string;
  noticeDays: number;
  skuIds: readonly string[];
  targetSeats: number | null;
};

export type PlanFinding = {
  rule: WasteRuleId;
  graphUserId: string | null;
  skuId: string | null;
  detail: Record<string, unknown>;
};

/** Seats and per-seat price of one product at a vendor other than Microsoft. */
export type PlanVendorProduct = {
  /** Spend row key, `${vendor}:${product}`. */
  key: string;
  /** Display vendor, for example "Adobe". */
  vendor: string;
  product: string;
  seats: number;
  priceCents: number;
};

export type PlanInput = {
  skus: readonly PlanSku[];
  contracts: readonly PlanContract[];
  /** Open and acknowledged findings only. */
  findings: readonly PlanFinding[];
  /** Monthly price per Microsoft seat in cents; 0 when unpriced. */
  priceCents: (skuId: string) => number;
  vendorProducts: readonly PlanVendorProduct[];
  terms: ReadonlyMap<string, SkuTermSetting>;
  bufferPct: number;
  /**
   * Per-user activity is hidden (concealed report names or no usable usage
   * report), so inactivity findings undercount and the cut is a floor.
   */
  usageConcealed: boolean;
  now: Date;
};

/** One product line inside a plan item. */
export type PlanLine = {
  id: string;
  name: string;
  paidSeats: number;
  /** Paid seats nobody holds. Zero where the vendor reports active seats only. */
  unassignedSeats: number;
  /** Assigned seats that open findings say can be taken back, once per person. */
  reclaimableSeats: number;
  /** Assigned seats that stay after reclaiming. */
  activeSeats: number;
  monthlyPriceCents: number;
  trialOnly: boolean;
};

export type PlanItem = {
  /** Stable, URL-safe key: `sku-<skuId>` or `contract-<id>`. */
  key: string;
  kind: "subscription" | "contract";
  label: string;
  sub: string;
  vendor: string;
  contractId: string | null;
  skuIds: string[];
  /** yyyy-mm-dd */
  renewalDate: string;
  /** Last day to set the lower seat count (contract notice or a week ahead). */
  noticeDate: string;
  daysUntil: number;
  noticeDaysUntil: number;
  lines: PlanLine[];
  paidSeats: number;
  unassignedSeats: number;
  reclaimableSeats: number;
  activeSeats: number;
  /** Active seats plus the buffer, or the contract's target seats. */
  recommendedSeats: number;
  /** True when recommendedSeats is the admin's target, not the formula. */
  targetSet: boolean;
  cutSeats: number;
  /**
   * Yearly value of the priced cut seats. Null when no cut seat has a price,
   * or when every seat is on trial: the plan never claims money it cannot
   * back with a price.
   */
  annualSavingsCents: number | null;
  /** Cut seats without a price, shown as seats only. */
  unpricedCutSeats: number;
  trialOnly: boolean;
  /** Conservative estimate: per-user activity is hidden for this item. */
  estimate: boolean;
  /** Microsoft subscriptions only; contracts are annual or longer. */
  term: RenewalTerm;
  /** Monthly terms only: the admin included this SKU in renewal reminders. */
  monthlyAlerts: boolean;
  alertsApply: boolean;
};

export type PlanSummary = {
  /** Upcoming renewals in the plan. */
  renewals: number;
  /** Renewals with at least one seat to cut. */
  actionable: number;
  cutSeats: number;
  annualSavingsCents: number;
  unpricedCutSeats: number;
  estimate: boolean;
  next: PlanItem | null;
};

export type RenewalPlan = {
  items: PlanItem[];
  summary: PlanSummary;
  /** Upcoming contracts the plan cannot size: no linked SKUs or seat data. */
  unsizedContracts: number;
  bufferPct: number;
};

const DAY_MS = 86_400_000;

const isoDay = (date: Date): string => date.toISOString().slice(0, 10);

const dayNumber = (iso: string): number =>
  Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);

const addDays = (iso: string, days: number): string =>
  isoDay(new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS));

export const clampBuffer = (pct: number): number =>
  Number.isInteger(pct)
    ? Math.min(MAX_BUFFER_PCT, Math.max(0, pct))
    : DEFAULT_BUFFER_PCT;

/** Active seats plus the buffer, rounded up so the buffer never rounds away. */
export const recommendedSeatsOf = (active: number, bufferPct: number) =>
  Math.ceil((Math.max(0, active) * (100 + clampBuffer(bufferPct))) / 100);

/** Paid seats; trial seats are free and never renew as paid. */
const paidOf = (s: PlanSku) => Math.max(0, s.prepaidEnabled - s.trialUnits);

const isTrialOnly = (s: PlanSku) =>
  s.trialUnits > 0 && s.trialUnits >= s.prepaidEnabled;

/** Rules that point at a license a person holds but does not need. */
const USER_RULES = new Set<WasteRuleId>([
  "disabled_account_with_license",
  "licensed_guest",
  "never_active",
  "inactive_90d",
]);

const skuIdsIn = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.flatMap((entry) => {
        const id =
          typeof entry === "string"
            ? entry
            : entry && typeof entry === "object" && "skuId" in entry
              ? (entry as { skuId: unknown }).skuId
              : null;
        return typeof id === "string" ? [id] : [];
      })
    : [];

/**
 * Reclaimable people per Microsoft SKU. A person flagged by several rules
 * counts once per SKU. Aggregate findings name nobody, so they add no seats
 * and instead mark the SKU as an estimate.
 */
export const reclaimableBySku = (findings: readonly PlanFinding[]) => {
  const people = new Map<string, Set<string>>();
  const aggregate = new Set<string>();
  let aggregateUsers = false;
  const add = (skuId: string, person: string) => {
    const set = people.get(skuId) ?? new Set<string>();
    set.add(person);
    people.set(skuId, set);
  };
  for (const f of findings) {
    if (findingSource(f) !== "microsoft") continue;
    if (!f.graphUserId) {
      if (f.rule === "copilot_unused" && f.skuId) aggregate.add(f.skuId);
      if (f.rule === "inactive_90d") aggregateUsers = true;
      continue;
    }
    if (USER_RULES.has(f.rule)) {
      for (const skuId of skuIdsIn(f.detail.licenses))
        add(skuId, f.graphUserId);
    } else if (f.rule === "overlapping_licenses") {
      for (const skuId of skuIdsIn(f.detail.redundantSkuIds))
        add(skuId, f.graphUserId);
    } else if (f.rule === "copilot_unused" && f.skuId) {
      add(f.skuId, f.graphUserId);
    }
  }
  return { people, aggregate, aggregateUsers };
};

const personOf = (f: PlanFinding): string | null => {
  const upn = f.detail.upn;
  return typeof upn === "string" && upn ? upn.toLowerCase() : f.graphUserId;
};

/** Reclaimable people per non-Microsoft product key, `${source}:${product}`. */
const reclaimableByProduct = (findings: readonly PlanFinding[]) => {
  const people = new Map<string, Set<string>>();
  for (const f of findings) {
    const source = findingSource(f);
    if (source === "microsoft") continue;
    const person = personOf(f);
    const products = f.detail.products;
    if (!person || !Array.isArray(products)) continue;
    for (const product of new Set(products)) {
      if (typeof product !== "string") continue;
      const key = `${source}:${product}`;
      const set = people.get(key) ?? new Set<string>();
      set.add(person);
      people.set(key, set);
    }
  }
  return people;
};

const skuLine = (
  sku: PlanSku,
  reclaimable: number,
  priceCents: number,
): PlanLine => {
  const paid = paidOf(sku);
  const assigned = Math.max(0, sku.consumedUnits);
  const reclaim = Math.min(reclaimable, assigned);
  return {
    id: sku.skuId,
    name: sku.displayName ?? sku.skuPartNumber,
    paidSeats: paid,
    unassignedSeats: Math.max(0, paid - assigned),
    reclaimableSeats: reclaim,
    activeSeats: assigned - reclaim,
    monthlyPriceCents: Math.max(0, priceCents),
    trialOnly: isTrialOnly(sku),
  };
};

type Sized = Pick<
  PlanItem,
  | "paidSeats"
  | "unassignedSeats"
  | "reclaimableSeats"
  | "activeSeats"
  | "recommendedSeats"
  | "targetSet"
  | "cutSeats"
  | "annualSavingsCents"
  | "unpricedCutSeats"
  | "trialOnly"
>;

/**
 * Totals for an item. Without a target, each line is cut on its own, so a
 * line that is over-assigned never offsets another line's idle seats. A
 * target applies to the whole contract and is priced at the average paid
 * seat, and only when every paid line has a price.
 */
export const sizeLines = (
  lines: readonly PlanLine[],
  bufferPct: number,
  targetSeats: number | null,
): Sized => {
  const paidLines = lines.filter((l) => l.paidSeats > 0);
  const sum = (pick: (l: PlanLine) => number) =>
    lines.reduce((total, l) => total + pick(l), 0);
  const paidSeats = sum((l) => l.paidSeats);
  const activeSeats = sum((l) => l.activeSeats);
  const trialOnly = lines.length > 0 && paidLines.length === 0;
  const base = {
    paidSeats,
    unassignedSeats: sum((l) => l.unassignedSeats),
    reclaimableSeats: sum((l) => l.reclaimableSeats),
    activeSeats,
    trialOnly,
  };
  if (trialOnly) {
    return {
      ...base,
      recommendedSeats: 0,
      targetSet: false,
      cutSeats: 0,
      annualSavingsCents: null,
      unpricedCutSeats: 0,
    };
  }
  if (targetSeats !== null && targetSeats >= 0) {
    const cutSeats = Math.max(0, paidSeats - targetSeats);
    const allPriced = paidLines.every((l) => l.monthlyPriceCents > 0);
    const monthlySpend = paidLines.reduce(
      (total, l) => total + l.paidSeats * l.monthlyPriceCents,
      0,
    );
    const priced = cutSeats > 0 && allPriced && paidSeats > 0;
    return {
      ...base,
      recommendedSeats: targetSeats,
      targetSet: true,
      cutSeats,
      annualSavingsCents: priced
        ? Math.round((cutSeats * monthlySpend * 12) / paidSeats)
        : null,
      unpricedCutSeats: priced ? 0 : cutSeats,
    };
  }
  let recommendedSeats = 0;
  let cutSeats = 0;
  let savings = 0;
  let pricedCut = 0;
  let unpricedCutSeats = 0;
  for (const line of lines) {
    if (line.paidSeats === 0) continue;
    const recommended = recommendedSeatsOf(line.activeSeats, bufferPct);
    const cut = Math.max(0, line.paidSeats - recommended);
    recommendedSeats += Math.min(recommended, line.paidSeats);
    cutSeats += cut;
    if (line.monthlyPriceCents > 0) {
      savings += cut * line.monthlyPriceCents * 12;
      pricedCut += cut;
    } else unpricedCutSeats += cut;
  }
  return {
    ...base,
    recommendedSeats,
    targetSet: false,
    cutSeats,
    annualSavingsCents: pricedCut > 0 ? savings : null,
    unpricedCutSeats,
  };
};

export const buildRenewalPlan = (input: PlanInput): RenewalPlan => {
  const bufferPct = clampBuffer(input.bufferPct);
  const today = isoDay(input.now);
  const todayNumber = dayNumber(today);
  const paidSkus = input.skus.filter(
    (s) => !isKnownFreeSku(s.skuId, s.skuPartNumber),
  );
  const skuById = new Map(paidSkus.map((s) => [s.skuId, s]));
  const microsoft = reclaimableBySku(input.findings);
  const products = reclaimableByProduct(input.findings);
  const lineOf = (sku: PlanSku) =>
    skuLine(
      sku,
      microsoft.people.get(sku.skuId)?.size ?? 0,
      input.priceCents(sku.skuId),
    );
  const skuEstimate = (skuIds: readonly string[]) =>
    input.usageConcealed ||
    microsoft.aggregateUsers ||
    skuIds.some((id) => microsoft.aggregate.has(id));

  const items: PlanItem[] = [];
  let unsizedContracts = 0;
  const dated = (renewalDate: string, noticeDate: string) => ({
    renewalDate,
    noticeDate,
    daysUntil: dayNumber(renewalDate) - todayNumber,
    noticeDaysUntil: dayNumber(noticeDate) - todayNumber,
  });

  // Contracts first: a SKU linked to an upcoming contract is planned there,
  // never a second time as its own subscription row.
  const upcomingContracts = input.contracts.filter(
    (c) => dayNumber(c.renewalDate) >= todayNumber,
  );
  const linked = new Set(upcomingContracts.flatMap((c) => c.skuIds));
  for (const contract of upcomingContracts) {
    const skuLines = [...new Set(contract.skuIds)].flatMap((id) => {
      const sku = skuById.get(id);
      return sku ? [lineOf(sku)] : [];
    });
    const vendorLines =
      skuLines.length > 0
        ? []
        : input.vendorProducts
            .filter(
              (p) =>
                p.seats > 0 &&
                !sameRenewalVendor(p.vendor, "Microsoft") &&
                sameRenewalVendor(p.vendor, contract.vendor),
            )
            .map((p): PlanLine => {
              const reclaim = Math.min(products.get(p.key)?.size ?? 0, p.seats);
              return {
                id: p.key,
                name: p.product,
                paidSeats: p.seats,
                unassignedSeats: 0,
                reclaimableSeats: reclaim,
                activeSeats: p.seats - reclaim,
                monthlyPriceCents: Math.max(0, p.priceCents),
                trialOnly: false,
              };
            });
    const lines = skuLines.length > 0 ? skuLines : vendorLines;
    if (lines.length === 0) {
      unsizedContracts++;
      continue;
    }
    const skuIds = skuLines.map((l) => l.id);
    items.push({
      key: `contract-${contract.id}`,
      kind: "contract",
      label: contract.contractName,
      sub:
        skuLines.length > 0
          ? skuLines.map((l) => l.name).join(", ")
          : contract.vendor,
      vendor: contract.vendor,
      contractId: contract.id,
      skuIds,
      ...dated(
        contract.renewalDate,
        addDays(contract.renewalDate, -contract.noticeDays),
      ),
      lines,
      ...sizeLines(lines, bufferPct, contract.targetSeats),
      estimate: skuLines.length > 0 && skuEstimate(skuIds),
      term: "annual",
      monthlyAlerts: false,
      alertsApply: true,
    });
  }

  for (const sku of paidSkus) {
    if (linked.has(sku.skuId) || !sku.nextLifecycleAt) continue;
    const renewalDate = isoDay(sku.nextLifecycleAt);
    if (dayNumber(renewalDate) < todayNumber) continue;
    const line = lineOf(sku);
    if (line.paidSeats === 0 && !line.trialOnly) continue;
    const setting = input.terms.get(sku.skuId);
    const actBy = addDays(renewalDate, -MICROSOFT_ACT_BY_DAYS);
    items.push({
      key: `sku-${sku.skuId}`,
      kind: "subscription",
      label: line.name,
      sub: sku.skuPartNumber,
      vendor: "Microsoft",
      contractId: null,
      skuIds: [sku.skuId],
      // A renewal inside the lead time can still be acted on today.
      ...dated(renewalDate, actBy < today ? today : actBy),
      lines: [line],
      ...sizeLines([line], bufferPct, null),
      estimate: skuEstimate([sku.skuId]),
      term: termOf(setting),
      monthlyAlerts: setting?.monthlyAlerts === true,
      alertsApply: renewalAlertsApply(setting),
    });
  }

  items.sort(
    (a, b) =>
      a.renewalDate.localeCompare(b.renewalDate) ||
      b.cutSeats - a.cutSeats ||
      a.label.localeCompare(b.label),
  );
  return {
    items,
    summary: summarize(items),
    unsizedContracts,
    bufferPct,
  };
};

export const summarize = (items: readonly PlanItem[]): PlanSummary => {
  const actionable = items.filter((i) => i.cutSeats > 0 && !i.trialOnly);
  return {
    renewals: items.length,
    actionable: actionable.length,
    cutSeats: actionable.reduce((sum, i) => sum + i.cutSeats, 0),
    annualSavingsCents: actionable.reduce(
      (sum, i) => sum + (i.annualSavingsCents ?? 0),
      0,
    ),
    unpricedCutSeats: actionable.reduce(
      (sum, i) => sum + i.unpricedCutSeats,
      0,
    ),
    estimate: actionable.some((i) => i.estimate),
    next: actionable[0] ?? null,
  };
};

/** What Free sees: real totals, nothing that names a SKU or a contract. */
export type PlanTeaser = {
  actionable: number;
  cutSeats: number;
  annualSavingsCents: number;
  unpricedCutSeats: number;
  estimate: boolean;
  /** Days until the earliest renewal with seats to cut. */
  nextDaysUntil: number | null;
};

export const teaserOf = (plan: RenewalPlan): PlanTeaser => ({
  actionable: plan.summary.actionable,
  cutSeats: plan.summary.cutSeats,
  annualSavingsCents: plan.summary.annualSavingsCents,
  unpricedCutSeats: plan.summary.unpricedCutSeats,
  estimate: plan.summary.estimate,
  nextDaysUntil: plan.summary.next?.daysUntil ?? null,
});

/** The earliest renewal within `days` that has seats to cut. */
export const nextRenewalAction = (
  plan: RenewalPlan,
  days = 90,
): PlanItem | null =>
  plan.items.find(
    (i) => i.cutSeats > 0 && !i.trialOnly && i.daysUntil <= days,
  ) ?? null;
