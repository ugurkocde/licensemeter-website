const SYNC_STEP_LABELS: Record<string, string> = {
  subscribedSkus: "Microsoft subscriptions",
  reportSettings: "Report privacy settings",
  signInActivity: "Sign-in activity",
  users: "Directory users",
  usageReports: "Microsoft usage reports",
  copilotUsage: "Copilot usage",
  adobeUsers: "Adobe users",
  wasteAnalysis: "Waste analysis",
};

const ACTION_LABELS: Record<string, string> = {
  finding_status_changed: "Finding status changed",
  finding_workflow_updated: "Finding workflow updated",
  findings_bulk_updated: "Findings updated in bulk",
  sync_triggered: "Sync started",
  price_updated: "Product price updated",
  prices_imported: "Product prices imported",
  seats_imported: "Connector seats imported",
  seats_import_cleared: "Imported connector seats cleared",
  microsoft_connected: "Microsoft 365 connected",
  microsoft_disconnected: "Microsoft 365 disconnected",
  connector_connected: "Connector connected",
  connector_disconnected: "Connector disconnected",
  adobe_connected: "Adobe connected",
  adobe_disconnected: "Adobe disconnected",
  member_added: "Member invited",
  member_removed: "Member removed",
  member_role_changed: "Member role changed",
  invite_resent: "Invitation resent",
  member_join_requested: "Access requested",
  member_join_approved: "Access request approved",
  member_join_declined: "Access request declined",
  member_domain_joined: "Colleague joined by company email",
  domain_join_mode_changed: "Who can join changed",
  threshold_changed: "Inactivity threshold changed",
  currency_changed: "Reporting currency changed",
  renewal_created: "Renewal created",
  renewal_updated: "Renewal updated",
  renewal_deleted: "Renewal deleted",
  leak_alerts_changed: "Leak alerts changed",
  monthly_report_changed: "Monthly report changed",
  trial_reminders_changed: "Trial reminders changed",
};

const DETAIL_LABELS: Record<string, string> = {
  findingId: "Finding",
  membershipId: "Member",
  ownerMembershipId: "Owner",
  skuId: "Product",
  monthlyPriceCents: "Monthly price",
  orgRef: "Organization reference",
  inactiveDays: "Inactivity threshold",
  renewalDate: "Renewal date",
  credType: "Credential type",
  to: "Workspace",
};

const words = (value: string) =>
  value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());

export const syncStepLabel = (step: string) => {
  const providerMatch = /^(.+)Seats$/.exec(step);
  if (providerMatch?.[1]) return `${words(providerMatch[1])} seats`;
  return SYNC_STEP_LABELS[step] ?? words(step);
};

export const auditActionLabel = (action: string) =>
  ACTION_LABELS[action] ?? words(action);

export const auditDetailLabel = (key: string) =>
  DETAIL_LABELS[key] ?? words(key);
