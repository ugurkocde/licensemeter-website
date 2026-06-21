/** Shared domain types stored in jsonb columns and passed through the sync pipeline. */

export type MembershipRole = "owner" | "admin" | "viewer";

export type FindingStatus = "open" | "acknowledged" | "resolved";

export type SyncRunStatus = "running" | "success" | "partial" | "failed";

/** Stripe subscription.status values we persist and reason about. */
export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "incomplete"
  | "incomplete_expired"
  | "paused";

/** Self-serve plan tiers, sized by seat band. */
export type PlanTier = "starter" | "growth" | "scale";

/** Stripe recurring interval for a plan price. */
export type PlanInterval = "month" | "year";

/** Trial/billing reminder stages the cron can emit (one send per stage per trial). */
export type ReminderStage =
  | "trial_day7"
  | "trial_day12"
  | "trial_last"
  | "trial_expired";

export type UserLicense = {
  skuId: string;
  /** Group object id when the license is inherited via group-based licensing, null when direct. */
  assignedByGroup: string | null;
  disabledPlans: string[];
  state: string;
};

/** ISO date (yyyy-mm-dd) of the last activity per workload, null when never active. */
export type WorkloadActivity = {
  exchange: string | null;
  oneDrive: string | null;
  sharePoint: string | null;
  teams: string | null;
  copilot: string | null;
};

export type SyncStep = {
  step:
    | "subscribedSkus"
    | "reportSettings"
    | "users"
    | "signInActivity"
    | "usageReports"
    | "copilotUsage"
    | "adobeUsers"
    | "zoomSeats"
    | "atlassianSeats"
    | "salesforceSeats"
    | "openaiSeats"
    | "anthropicSeats"
    | "chatgptSeats"
    | "claudeSeats"
    | "openaiSpend"
    | "anthropicSpend"
    | "wasteAnalysis";
  status: "ok" | "warning" | "failed" | "skipped";
  message?: string;
  count?: number;
};

export type WasteRuleId =
  | "disabled_account_with_license"
  | "never_active"
  | "inactive_90d"
  | "shelfware"
  | "copilot_unused"
  | "licensed_guest"
  | "adobe_disabled_in_entra"
  | "adobe_orphaned"
  | "saas_disabled_in_entra"
  | "saas_orphaned"
  | "saas_inactive"
  | "overlapping_licenses"
  | "service_plans_disabled";

/**
 * Connectors built on the generic SaaS framework (Adobe predates it).
 * zoom/atlassian/salesforce/openai/anthropic authenticate with stored
 * credentials; chatgpt/claude are CSV-import connectors with no API client.
 */
export type SaasProvider =
  | "zoom"
  | "atlassian"
  | "salesforce"
  | "openai"
  | "anthropic"
  | "chatgpt"
  | "claude";

/** One seat in a connected SaaS product, normalized across providers. */
export type SaasSeat = {
  email: string;
  displayName: string | null;
  /** "active" or a provider-specific non-active state. */
  status: string;
  /** Paid products/plans held by this seat, priced via <provider>:<product>. */
  products: string[];
  /** Last sign-in/activity, null when the provider exposes no signal. */
  lastActiveAt: Date | null;
};

/** One day of API spend for an AI connector, in USD cents as billed. */
export type AiSpendRow = {
  /** ISO date (yyyy-mm-dd), UTC bucket day. */
  day: string;
  /** Model / line item as reported by the provider. */
  category: string;
  amountCents: number;
};

/** One Adobe Admin Console user as returned by the User Management API. */
export type AdobeUser = {
  email: string;
  status: string;
  /** Product profile group names: the billable entitlements. */
  products: string[];
};

export type AuditAction =
  | "export_findings_csv"
  | "export_licenses_csv"
  | "export_remediation"
  | "price_updated"
  | "member_added"
  | "member_removed"
  | "member_role_changed"
  | "finding_status_changed"
  | "sync_triggered"
  | "currency_changed"
  | "adobe_connected"
  | "adobe_disconnected"
  | "connector_connected"
  | "connector_disconnected"
  | "workspace_switched"
  | "invite_resent"
  | "export_report"
  | "threshold_changed"
  | "findings_bulk_updated"
  | "export_pricebook_csv"
  | "prices_imported"
  | "seats_imported"
  | "seats_import_cleared"
  | "renewal_date_changed"
  | "leak_alerts_changed"
  | "monthly_report_changed"
  | "checkout_started"
  | "subscription_activated"
  | "subscription_updated"
  | "subscription_canceled"
  | "billing_portal_opened"
  | "trial_reminders_changed";

/** Aggregate counts captured when user identities are concealed in usage reports. */
export type AggregateUsage = {
  /** Rows in the usage report with no activity in the period. */
  inactiveCount: number;
  totalCount: number;
};
