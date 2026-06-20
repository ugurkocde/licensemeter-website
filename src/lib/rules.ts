import { CONNECTOR_LABELS } from "~/lib/connectors";
import type { SaasProvider, WasteRuleId } from "~/server/types";

export const RULE_META: Record<
  WasteRuleId,
  { label: string; short: string; badgeClass: string }
> = {
  disabled_account_with_license: {
    label: "Disabled account still licensed",
    short: "Disabled",
    badgeClass: "bg-danger-soft text-danger-text",
  },
  never_active: {
    label: "Licensed but never active",
    short: "Never active",
    badgeClass: "bg-gold-soft text-gold-text",
  },
  inactive_90d: {
    // Threshold-neutral: the inactivity window is per-workspace (30-180 days)
    // and finding titles carry the actual day count.
    label: "Inactive seat",
    short: "Inactive",
    badgeClass: "bg-gold-soft text-gold-text",
  },
  shelfware: {
    label: "Unassigned paid seats",
    short: "Shelfware",
    badgeClass: "bg-slate-soft text-slate-ink",
  },
  copilot_unused: {
    label: "Copilot seat unused",
    short: "Copilot idle",
    badgeClass: "bg-plum-soft text-plum",
  },
  licensed_guest: {
    label: "Licensed guest account",
    short: "Guest",
    badgeClass: "bg-teal-soft text-teal-ink",
  },
  adobe_disabled_in_entra: {
    label: "Adobe seat, user disabled in Entra",
    short: "Adobe leak",
    badgeClass: "bg-danger-soft text-danger-text",
  },
  adobe_orphaned: {
    label: "Adobe seat without Entra account",
    short: "Adobe orphan",
    badgeClass: "bg-plum-soft text-plum",
  },
  saas_disabled_in_entra: {
    label: "Connected app seat, user disabled in Entra",
    short: "App leak",
    badgeClass: "bg-danger-soft text-danger-text",
  },
  saas_orphaned: {
    label: "Connected app seat without Entra account",
    short: "App orphan",
    badgeClass: "bg-plum-soft text-plum",
  },
  saas_inactive: {
    label: "Connected app seat inactive",
    short: "App idle",
    badgeClass: "bg-gold-soft text-gold-text",
  },
  overlapping_licenses: {
    label: "Suite + standalone double-pay",
    short: "Overlap",
    badgeClass: "bg-gold-soft text-gold-text",
  },
  service_plans_disabled: {
    label: "Service plans disabled on paid suite",
    short: "Plans off",
    badgeClass: "bg-slate-soft text-slate-ink",
  },
};

export const ALL_RULES = Object.keys(RULE_META) as WasteRuleId[];

export const isWasteRule = (value: string): value is WasteRuleId =>
  value in RULE_META;

/** Chip suffix per generic SaaS rule, prefixed with the provider name when known. */
const SAAS_CHIP_SUFFIX: Partial<Record<WasteRuleId, string>> = {
  saas_disabled_in_entra: "leak",
  saas_orphaned: "orphan",
  saas_inactive: "idle",
};

const isSaasProvider = (value: unknown): value is SaasProvider =>
  typeof value === "string" && value in CONNECTOR_LABELS;

/**
 * Chip text for a concrete finding row. The generic SaaS rules store the
 * provider in the finding detail, so row chips can name the product
 * ("Zoom leak" instead of "App leak"). Filter pills stay rule-generic.
 */
export const findingChipLabel = (
  rule: WasteRuleId,
  detail: Record<string, unknown>,
): string => {
  const suffix = SAAS_CHIP_SUFFIX[rule];
  return suffix && isSaasProvider(detail.provider)
    ? `${CONNECTOR_LABELS[detail.provider]} ${suffix}`
    : RULE_META[rule].short;
};
