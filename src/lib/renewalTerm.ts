import type { RenewalTerm } from "~/server/types";

/** What an admin stored for one SKU; undefined when nothing is stored. */
export type SkuTermSetting = {
  term: RenewalTerm;
  monthlyAlerts: boolean;
};

/** The three choices the Renewals page offers per Microsoft SKU. */
export type SkuTermChoice = "annual" | "monthly" | "monthly_alerts";

export const SKU_TERM_CHOICES: readonly SkuTermChoice[] = [
  "annual",
  "monthly",
  "monthly_alerts",
];

export const isSkuTermChoice = (value: unknown): value is SkuTermChoice =>
  typeof value === "string" &&
  (SKU_TERM_CHOICES as readonly string[]).includes(value);

export const termOf = (setting: SkuTermSetting | undefined): RenewalTerm =>
  setting?.term ?? "annual";

export const choiceOf = (setting: SkuTermSetting | undefined): SkuTermChoice =>
  termOf(setting) === "monthly"
    ? setting?.monthlyAlerts
      ? "monthly_alerts"
      : "monthly"
    : "annual";

export const settingOf = (choice: SkuTermChoice): SkuTermSetting => ({
  term: choice === "annual" ? "annual" : "monthly",
  monthlyAlerts: choice === "monthly_alerts",
});

/**
 * The one rule for which SKUs renewal reminders cover. Annual and multi-year
 * terms (the default, also when nothing is stored) are covered. A monthly NCE
 * term renews every month, so it is covered only when the admin opted that
 * SKU in. Contracts recorded by hand are always covered.
 */
export const renewalAlertsApply = (
  setting: SkuTermSetting | undefined,
): boolean => termOf(setting) !== "monthly" || setting?.monthlyAlerts === true;
