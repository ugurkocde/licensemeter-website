import { skuDisplayName } from "~/server/graph/skuCatalog";
import type { AggregateUsage, UserLicense, WasteRuleId } from "~/server/types";

/** Detection thresholds (days). */
export const INACTIVE_DAYS = 90;
export const NEVER_ACTIVE_MIN_AGE_DAYS = 30;
export const COPILOT_INACTIVE_DAYS = 60;

export const COPILOT_SKU_ID = "639dec6b-bb19-468b-871c-c5c441c4b0cb";

/**
 * Suites whose included services make a separately assigned standalone SKU
 * redundant (classic double-pay). Curated from Microsoft's licensing
 * reference; impact is priced as the redundant standalone.
 */
const OVERLAP_MAP: Record<string, string[]> = {
  // Microsoft 365 E3
  "05e9a617-0261-4cee-bb44-138d3ef5d965": [
    "4b9405b0-7788-4568-add1-99614e613b69", // Exchange Online P1
    "19ec0d23-8335-4cbd-94ac-6050e30712fa", // Exchange Online P2
    "078d2b04-f1bd-4111-bbd4-b4b1b354cef4", // Entra ID P1
    "efccb6f7-5641-4e0e-bd10-b4976e1bf68e", // EMS E3
    "061f9ace-7d42-4136-88ac-31dc755f143f", // Intune Plan 1
    "18181a46-0d4e-45cd-891e-60aabd171b4e", // Office 365 E1
    "6fd2c87f-b296-42f0-b197-1e91e994b900", // Office 365 E3
  ],
  // Microsoft 365 E5
  "06ebc4ee-1bb5-47dd-8120-11324bc54e06": [
    "4b9405b0-7788-4568-add1-99614e613b69",
    "19ec0d23-8335-4cbd-94ac-6050e30712fa",
    "078d2b04-f1bd-4111-bbd4-b4b1b354cef4",
    "84a661c4-e949-4bd2-a560-ed7766fcaf2b", // Entra ID P2
    "efccb6f7-5641-4e0e-bd10-b4976e1bf68e",
    "b05e124f-c7cc-45a0-a6aa-8cf78c946968", // EMS E5
    "061f9ace-7d42-4136-88ac-31dc755f143f",
    "e43b5b99-8dfb-405f-9987-dc307f34bcbd", // Teams Phone
    "0c266dff-15dd-4b49-8397-2bb16070ed52", // Audio Conferencing
    "f8a1db68-be16-40ed-86d5-cb42ce701560", // Power BI Pro
    "4ef96642-f096-40de-a3e9-d83fb2f90211", // Defender for O365 P1
    "3dd6cf57-d688-4eed-ba52-9e40b5468c3e", // Defender for O365 P2
    "18181a46-0d4e-45cd-891e-60aabd171b4e",
    "6fd2c87f-b296-42f0-b197-1e91e994b900",
    "c7df2760-2c81-4ef7-b578-5b5392b571df", // Office 365 E5
    "05e9a617-0261-4cee-bb44-138d3ef5d965", // Microsoft 365 E3
  ],
  // Office 365 E3
  "6fd2c87f-b296-42f0-b197-1e91e994b900": [
    "4b9405b0-7788-4568-add1-99614e613b69",
    "19ec0d23-8335-4cbd-94ac-6050e30712fa",
    "18181a46-0d4e-45cd-891e-60aabd171b4e",
  ],
  // Office 365 E5
  "c7df2760-2c81-4ef7-b578-5b5392b571df": [
    "4b9405b0-7788-4568-add1-99614e613b69",
    "19ec0d23-8335-4cbd-94ac-6050e30712fa",
    "e43b5b99-8dfb-405f-9987-dc307f34bcbd",
    "0c266dff-15dd-4b49-8397-2bb16070ed52",
    "f8a1db68-be16-40ed-86d5-cb42ce701560",
    "4ef96642-f096-40de-a3e9-d83fb2f90211",
    "3dd6cf57-d688-4eed-ba52-9e40b5468c3e",
    "18181a46-0d4e-45cd-891e-60aabd171b4e",
  ],
  // Microsoft 365 Business Premium
  "cbdc14ab-d96c-4c30-b9f4-6ada7cdc1d46": [
    "4b9405b0-7788-4568-add1-99614e613b69",
    "078d2b04-f1bd-4111-bbd4-b4b1b354cef4",
    "061f9ace-7d42-4136-88ac-31dc755f143f",
    "4ef96642-f096-40de-a3e9-d83fb2f90211",
    "3b555118-da6a-4418-894f-7df1e2096870", // Business Basic
    "f245ecc8-75af-4f8e-b61f-27d8114de5f3", // Business Standard
  ],
};

export type WasteUser = {
  graphId: string;
  upn: string;
  displayName: string | null;
  accountEnabled: boolean;
  userType: string | null;
  createdDateTime: Date | null;
  /** Best per-user activity signal (sign-ins and/or workload reports); null = never observed. */
  lastActivity: Date | null;
  /** Last Copilot activity when per-user copilot data could be joined. */
  copilotLastActivity: Date | null;
  licenses: UserLicense[];
};

export type WasteSku = {
  skuId: string;
  skuPartNumber: string;
  prepaidEnabled: number;
  consumedUnits: number;
};

export type WasteInput = {
  users: WasteUser[];
  skus: WasteSku[];
  /** skuId -> monthly price in cents. */
  prices: Record<string, number>;
  now: Date;
  /**
   * "full": per-user activity is reliable (Entra P1 sign-ins and/or joinable usage reports).
   * "none": no per-user activity signal (no P1 and concealed reports); per-user
   * inactivity rules are skipped and an aggregate finding is emitted instead.
   */
  activitySignal: "full" | "none";
  copilotSignal: "per-user" | "aggregate" | "none";
  usageAggregate?: AggregateUsage;
  copilotAggregate?: AggregateUsage;
  /** Per-workspace inactivity threshold in days; defaults to INACTIVE_DAYS. */
  inactiveDays?: number;
};

export type WasteFinding = {
  dedupeKey: string;
  rule: WasteRuleId;
  graphUserId: string | null;
  skuId: string | null;
  title: string;
  detail: Record<string, unknown>;
  monthlyImpactCents: number;
};

const key = (rule: WasteRuleId, userId?: string | null, skuId?: string | null) =>
  `${rule}|${userId ?? "-"}|${skuId ?? "-"}`;

/**
 * Free, viral and capacity-style SKUs whose "unassigned seats" carry no cost:
 * every real tenant has e.g. WINDOWS_STORE with a million prepaid units.
 * Observed on the first live tenant sync; without this every customer sees
 * meaningless shelfware findings on day one.
 */
const SHELFWARE_EXEMPT_PART_NUMBERS = new Set([
  "WINDOWS_STORE",
  "FLOW_FREE",
  "POWERAPPS_VIRAL",
  "POWER_VIRTUAL_AGENTS_VIRAL",
  "TEAMS_EXPLORATORY",
  "TEAMS_COMMERCIAL_TRIAL",
  "POWER_BI_STANDARD",
  "CCIBOTS_PRIVPREV_VIRAL",
  "RIGHTSMANAGEMENT_ADHOC",
  "POWERAPPS_DEV",
]);

/** Capacity-style allotments (10k+ "seats") are licensing plumbing, not purchases. */
const SHELFWARE_CAPACITY_THRESHOLD = 5000;

const isShelfwareExempt = (
  skuPartNumber: string,
  prepaidEnabled: number,
): boolean =>
  SHELFWARE_EXEMPT_PART_NUMBERS.has(skuPartNumber) ||
  prepaidEnabled >= SHELFWARE_CAPACITY_THRESHOLD;

/**
 * Purchased seats for billing: prepaid (enabled) seats summed only over SKUs
 * that represent a real purchase. Excludes the same free/viral/capacity SKUs as
 * the shelfware rule, so Microsoft's sentinel allotments (e.g. WINDOWS_STORE's
 * 1,000,000 prepaid units) never inflate the Stripe seat-tier gate (knownSeats).
 */
export const purchasedSeatsOf = (
  skus: readonly { skuPartNumber: string; prepaidEnabled: number }[],
): number =>
  skus.reduce(
    (sum, s) =>
      isShelfwareExempt(s.skuPartNumber, s.prepaidEnabled)
        ? sum
        : sum + s.prepaidEnabled,
    0,
  );

const daysBetween = (from: Date, to: Date): number =>
  Math.floor((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));

const licenseCost = (licenses: UserLicense[], prices: Record<string, number>) =>
  licenses.reduce((sum, l) => sum + (prices[l.skuId] ?? 0), 0);

const licenseDetail = (licenses: UserLicense[], prices: Record<string, number>) =>
  licenses.map((l) => ({
    skuId: l.skuId,
    name: skuDisplayName(l.skuId),
    monthlyPriceCents: prices[l.skuId] ?? 0,
    assignedByGroup: l.assignedByGroup,
  }));

const userDetail = (u: WasteUser, prices: Record<string, number>) => ({
  upn: u.upn,
  displayName: u.displayName,
  lastActivity: u.lastActivity?.toISOString() ?? null,
  licenses: licenseDetail(u.licenses, prices),
});

/** Pure rule evaluation over a tenant snapshot. Persistence and diffing live in the sync layer. */
export const analyzeWaste = (input: WasteInput): WasteFinding[] => {
  const { users, skus, prices, now } = input;
  const inactiveThreshold = input.inactiveDays ?? INACTIVE_DAYS;
  const findings: WasteFinding[] = [];
  /** SKU -> enabled users carrying it with disabled service plans. */
  const planDisables = new Map<string, number>();

  for (const u of users) {
    if (u.licenses.length === 0) continue;

    // Rule 1: disabled account still holding licenses (offboarding leak).
    if (!u.accountEnabled) {
      findings.push({
        dedupeKey: key("disabled_account_with_license", u.graphId),
        rule: "disabled_account_with_license",
        graphUserId: u.graphId,
        skuId: null,
        title: `Disabled account still licensed: ${u.displayName ?? u.upn}`,
        detail: userDetail(u, prices),
        monthlyImpactCents: licenseCost(u.licenses, prices),
      });
      continue; // avoid double-flagging the same seat via inactivity rules
    }

    // Rule 6: licensed guest account.
    if (u.userType === "Guest") {
      findings.push({
        dedupeKey: key("licensed_guest", u.graphId),
        rule: "licensed_guest",
        graphUserId: u.graphId,
        skuId: null,
        title: `Licensed guest account: ${u.displayName ?? u.upn}`,
        detail: userDetail(u, prices),
        monthlyImpactCents: licenseCost(u.licenses, prices),
      });
      continue;
    }

    if (input.activitySignal === "full") {
      // Rule 2: licensed but never active (grace period after account creation).
      const ageDays = u.createdDateTime
        ? daysBetween(u.createdDateTime, now)
        : Infinity;
      if (u.lastActivity === null && ageDays >= NEVER_ACTIVE_MIN_AGE_DAYS) {
        findings.push({
          dedupeKey: key("never_active", u.graphId),
          rule: "never_active",
          graphUserId: u.graphId,
          skuId: null,
          title: `Licensed but never active: ${u.displayName ?? u.upn}`,
          detail: { ...userDetail(u, prices), accountAgeDays: ageDays },
          monthlyImpactCents: licenseCost(u.licenses, prices),
        });
        continue;
      }

      // Rule 3: no activity for the workspace's inactivity threshold.
      if (u.lastActivity !== null) {
        const inactiveDays = daysBetween(u.lastActivity, now);
        if (inactiveDays > inactiveThreshold) {
          findings.push({
            dedupeKey: key("inactive_90d", u.graphId),
            rule: "inactive_90d",
            graphUserId: u.graphId,
            skuId: null,
            title: `No activity for ${inactiveDays} days: ${u.displayName ?? u.upn}`,
            detail: { ...userDetail(u, prices), inactiveDays },
            monthlyImpactCents: licenseCost(u.licenses, prices),
          });
          continue;
        }
      }
    }

    // Rule 7: suite + standalone double-pay (active users only; inactivity
    // rules above already price the full license set for flagged users).
    const heldSkus = new Set(u.licenses.map((l) => l.skuId));
    const redundantIds = new Set<string>();
    const pairs: { suite: string; redundant: string }[] = [];
    for (const suiteId of heldSkus) {
      for (const dup of OVERLAP_MAP[suiteId] ?? []) {
        if (heldSkus.has(dup) && !redundantIds.has(dup)) {
          redundantIds.add(dup);
          pairs.push({
            suite: skuDisplayName(suiteId),
            redundant: skuDisplayName(dup),
          });
        }
      }
    }
    if (redundantIds.size > 0) {
      findings.push({
        dedupeKey: key("overlapping_licenses", u.graphId),
        rule: "overlapping_licenses",
        graphUserId: u.graphId,
        skuId: null,
        title: `Overlapping licenses: ${u.displayName ?? u.upn}`,
        detail: {
          upn: u.upn,
          displayName: u.displayName,
          pairs,
          redundantSkuIds: [...redundantIds],
        },
        monthlyImpactCents: [...redundantIds].reduce(
          (sum, id) => sum + (prices[id] ?? 0),
          0,
        ),
      });
    }

    // Tally for rule 8 (service plans disabled on paid suites).
    for (const l of u.licenses) {
      if (l.disabledPlans.length > 0 && OVERLAP_MAP[l.skuId]) {
        planDisables.set(l.skuId, (planDisables.get(l.skuId) ?? 0) + 1);
      }
    }

    // Rule 5: Copilot seat without Copilot usage (per-user signal available).
    if (
      input.copilotSignal === "per-user" &&
      u.licenses.some((l) => l.skuId === COPILOT_SKU_ID)
    ) {
      const idle =
        u.copilotLastActivity === null ||
        daysBetween(u.copilotLastActivity, now) > COPILOT_INACTIVE_DAYS;
      if (idle) {
        findings.push({
          dedupeKey: key("copilot_unused", u.graphId, COPILOT_SKU_ID),
          rule: "copilot_unused",
          graphUserId: u.graphId,
          skuId: COPILOT_SKU_ID,
          title: `Copilot seat unused: ${u.displayName ?? u.upn}`,
          detail: {
            upn: u.upn,
            displayName: u.displayName,
            copilotLastActivity: u.copilotLastActivity?.toISOString() ?? null,
          },
          monthlyImpactCents: prices[COPILOT_SKU_ID] ?? 0,
        });
      }
    }
  }

  // Rule 4: shelfware, paid seats nobody is assigned to.
  for (const sku of skus) {
    if (isShelfwareExempt(sku.skuPartNumber, sku.prepaidEnabled)) continue;
    const unassigned = sku.prepaidEnabled - sku.consumedUnits;
    if (unassigned > 0) {
      findings.push({
        dedupeKey: key("shelfware", null, sku.skuId),
        rule: "shelfware",
        graphUserId: null,
        skuId: sku.skuId,
        title: `Unassigned paid seats: ${skuDisplayName(sku.skuId, sku.skuPartNumber)} (${unassigned})`,
        detail: {
          skuId: sku.skuId,
          skuPartNumber: sku.skuPartNumber,
          purchased: sku.prepaidEnabled,
          assigned: sku.consumedUnits,
          unassigned,
        },
        monthlyImpactCents: unassigned * (prices[sku.skuId] ?? 0),
      });
    }
  }

  // Rule 8: paid suites where users have service plans switched off.
  // Informational (plan fractions cannot be priced), hints at downgrades.
  for (const [skuId, count] of planDisables) {
    findings.push({
      dedupeKey: key("service_plans_disabled", "aggregate", skuId),
      rule: "service_plans_disabled",
      graphUserId: null,
      skuId,
      title: `${count} users have service plans disabled on ${skuDisplayName(skuId)}`,
      detail: { aggregate: true, skuId, usersWithDisabledPlans: count },
      monthlyImpactCents: 0,
    });
  }

  // Aggregate fallbacks when identities are concealed / no per-user signal exists.
  if (input.copilotSignal === "aggregate" && input.copilotAggregate) {
    const { inactiveCount, totalCount } = input.copilotAggregate;
    if (inactiveCount > 0) {
      findings.push({
        dedupeKey: key("copilot_unused", "aggregate", COPILOT_SKU_ID),
        rule: "copilot_unused",
        graphUserId: null,
        skuId: COPILOT_SKU_ID,
        title: `${inactiveCount} of ${totalCount} Copilot seats show no usage`,
        detail: { aggregate: true, inactiveCount, totalCount },
        monthlyImpactCents: inactiveCount * (prices[COPILOT_SKU_ID] ?? 0),
      });
    }
  }

  if (input.activitySignal === "none" && input.usageAggregate) {
    const { inactiveCount, totalCount } = input.usageAggregate;
    if (inactiveCount > 0) {
      findings.push({
        dedupeKey: key("inactive_90d", "aggregate", null),
        rule: "inactive_90d",
        graphUserId: null,
        skuId: null,
        title: `${inactiveCount} of ${totalCount} users show no activity in 90 days (identities concealed)`,
        detail: {
          aggregate: true,
          inactiveCount,
          totalCount,
          hint: "Enable identifiable report names in Microsoft 365 admin center (Org settings > Reports) or assign Entra ID P1 to get per-user findings.",
        },
        monthlyImpactCents: 0,
      });
    }
  }

  return findings;
};
