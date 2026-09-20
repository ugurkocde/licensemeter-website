import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type {
  AggregateUsage,
  AuditAction,
  BillingProvider,
  DeliveryStatus,
  DomainJoinMode,
  EmailBlockReason,
  EntitlementSource,
  EntitlementStatus,
  FindingStatus,
  JoinRequestStatus,
  MembershipRole,
  RemediationStatus,
  PaidPlan,
  PlanInterval,
  PlanTier,
  SaasProvider,
  SubscriptionStatus,
  SyncRunStatus,
  SyncStep,
  UserLicense,
  WasteRuleId,
  WorkloadActivity,
} from "~/server/types";

/** Historical MSP billing records retained for database compatibility. Unused by the free service. */
export const mspAccounts = pgTable(
  "msp_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name"),
    /**
     * The creator who manages this MSP account (v1 has no membership table, so
     * the account is owned outright by whoever created it). ownerOid is the
     * Entra object id and the only key new accounts get. ownerWorkosUserId is
     * the legacy key of accounts created before sign-in moved to Entra; such an
     * account is adopted (ownerOid set) when its owner's membership is linked.
     */
    ownerWorkosUserId: text("owner_workos_user_id"),
    ownerOid: text("owner_oid"),
    /** Stripe customer id (cus_…) for the MSP quantity subscription. */
    stripeCustomerId: text("stripe_customer_id"),
    /** Cached subscription status, mirrored from the webhook (same shape as tenants'). */
    subscriptionStatus: text("subscription_status").$type<SubscriptionStatus>(),
    /** Cached current_period_end; the paid-access horizon. Null on trial. */
    paidUntil: timestamp("paid_until", { withTimezone: true }),
    /** Comp / grandfather flag, NEVER written by the webhook. Set => always entitled. */
    compedAt: timestamp("comped_at", { withTimezone: true }),
    /** The MSP quantity subscription id (sub_…); mirrors subscriptions.stripeSubscriptionId. */
    stripeSubscriptionId: text("stripe_subscription_id"),
    /** Cached Price id of the quantity subscription; null until first subscribed. */
    stripePriceId: text("stripe_price_id"),
    /** Billing interval of the quantity subscription; nullable so an unmapped price is never coerced. */
    interval: text("interval").$type<PlanInterval>(),
    /** Cached current_period_end of the quantity subscription, mirrored from the webhook. */
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    /** Connected client tenants billed = subscription quantity, mirrored from the webhook. */
    quantity: integer("quantity").notNull().default(0),
    /** event.created of the last applied webhook; gates stale out-of-order writes. */
    lastEventAt: timestamp("last_event_at", { withTimezone: true }),
    /**
     * White-label report branding (MSP plan). Applied to the PDF report of every
     * client workspace attached to this account. Logo is a PNG or JPEG data URL.
     */
    brandName: text("brand_name"),
    brandColor: text("brand_color"),
    brandLogo: text("brand_logo"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "msp_accounts_brand_color_hex",
      sql`${t.brandColor} is null or ${t.brandColor} ~ '^#[0-9a-fA-F]{6}$'`,
    ),
    // Keeps an uploaded logo small enough to inline into every PDF render.
    check(
      "msp_accounts_brand_logo_size",
      sql`${t.brandLogo} is null or length(${t.brandLogo}) <= 400000`,
    ),
    // One Stripe customer per MSP account: a mismatched second customer is a DB
    // error, not a silent overwrite (mirrors tenants.stripeCustomerId).
    uniqueIndex("msp_accounts_stripe_customer_idx")
      .on(t.stripeCustomerId)
      .where(sql`${t.stripeCustomerId} is not null`),
    // One MSP account per Stripe subscription: a second account pointing at the
    // same sub is a webhook routing bug, not a silent duplicate (mirrors the
    // self-serve subscriptions_stripe_subscription guard; partial since the
    // column is null until first subscribed).
    uniqueIndex("msp_accounts_stripe_subscription_idx")
      .on(t.stripeSubscriptionId)
      .where(sql`${t.stripeSubscriptionId} is not null`),
    // One MSP account per owner (by either identity): the application enforces
    // "one account per owner" via onConflictDoNothing + re-read, but a unique
    // index is the DB backstop so a concurrent double-create can't slip two
    // accounts past the read-then-insert race. Partial since each column is null
    // for the other identity kind.
    uniqueIndex("msp_accounts_owner_workos_user_idx")
      .on(t.ownerWorkosUserId)
      .where(sql`${t.ownerWorkosUserId} is not null`),
    uniqueIndex("msp_accounts_owner_oid_idx")
      .on(t.ownerOid)
      .where(sql`${t.ownerOid} is not null`),
    check("msp_accounts_quantity_nonneg", sql`${t.quantity} >= 0`),
  ],
);

/** A full MSP account row, passed around by value. */
export type MspAccountRow = typeof mspAccounts.$inferSelect;

/** One row per connected Microsoft 365 tenant (the unit of isolation everywhere). */
export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /**
     * Entra tenant id (tid claim). Nullable since Phase C: a WorkOS-auth
     * workspace exists (bills, adds non-Microsoft connectors) before any
     * Microsoft tenant is connected. Set when an msConnections row is added
     * (managed callback or BYO save); the Graph auth key, not the workspace key.
     */
    tid: text("tid"),
    name: text("name"),
    currency: text("currency").notNull().default("EUR"),
    /** EUR catalog-price multiplier for this reporting currency, in parts per million. */
    currencyRatePpm: integer("currency_rate_ppm").notNull().default(1_000_000),
    /** Legacy column, never read or written anymore. Kept for one release. */
    workosOrgId: text("workos_org_id"),
    /**
     * Verified corporate email domain that may auto-join this workspace
     * (app-level domain JIT). Null for consumer/personal workspaces, so no one
     * auto-joins them. Set when the first corporate-domain user provisions it.
     */
    domain: text("domain"),
    /**
     * Legacy flag, superseded by domainJoinMode. Kept so historical rows and
     * older deployments stay readable; no code reads or writes it anymore.
     */
    allowDomainJoin: boolean("allow_domain_join").notNull().default(false),
    /**
     * How verified colleagues on this workspace's domain get in: 'approval'
     * (they request access and an owner or admin approves), 'auto' (they join
     * as viewer on sign-in) or 'off' (invite only). Replaces allowDomainJoin,
     * which is kept for history and no longer read. Only the oldest workspace
     * holding a domain is ever consulted; see server/domainJoin.ts.
     */
    domainJoinMode: text("domain_join_mode")
      .$type<DomainJoinMode>()
      .notNull()
      .default("approval"),
    /** Capabilities discovered during sync; null until first sync. */
    concealedNames: boolean("concealed_names"),
    hasP1: boolean("has_p1"),
    /** Per-workspace inactivity threshold for the inactive-users rule. */
    inactiveDays: integer("inactive_days").notNull().default(90),
    /**
     * Deprecated compatibility field. New code reads vendorRenewals. Keep for
     * one deploy after the multi-vendor cutover, then drop in a contract
     * migration once no running application version selects it.
     */
    renewalDate: date("renewal_date"),
    /** Immediate email when a sync inserts new offboarding-leak findings. */
    leakAlerts: boolean("leak_alerts").notNull().default(true),
    /** Monthly PDF waste report to owners/admins (QBR deliverable). */
    monthlyReport: boolean("monthly_report").notNull().default(false),
    /** Signal quality from the last sync; lets price edits re-run analysis offline. */
    activitySignal: text("activity_signal").$type<"full" | "none">(),
    copilotSignal: text("copilot_signal").$type<
      "per-user" | "aggregate" | "none"
    >(),
    usageAggregate: jsonb("usage_aggregate").$type<AggregateUsage>(),
    copilotAggregate: jsonb("copilot_aggregate").$type<AggregateUsage>(),
    isDemo: boolean("is_demo").notNull().default(false),
    consentedAt: timestamp("consented_at", { withTimezone: true }),
    /**
     * Historical billing fields retained for database compatibility.
     * No new trial timestamps are written and none of these fields restrict access.
     */
    trialStartedAt: timestamp("trial_started_at", { withTimezone: true }),
    /** Stripe customer id (cus_…); created lazily at first Checkout, null on trial. */
    stripeCustomerId: text("stripe_customer_id"),
    /** Cached subscription status, mirrored from the webhook (source of truth: subscriptions row). */
    subscriptionStatus: text("subscription_status").$type<SubscriptionStatus>(),
    /** Cached current_period_end; the paid-access horizon. Null on trial. */
    paidUntil: timestamp("paid_until", { withTimezone: true }),
    /** Comp / grandfather flag, NEVER written by the webhook. Set => always entitled. */
    compedAt: timestamp("comped_at", { withTimezone: true }),
    /** Suppressible trial-reminder nudges to owners/admins (one-click unsubscribe). */
    trialReminders: boolean("trial_reminders").notNull().default(true),
    /**
     * Owning MSP account, when this workspace is billed under an MSP's single
     * quantity subscription instead of its own per-workspace subscription. Null
     * for every self-serve workspace (the default), so the existing single-tenant
     * billing/entitlement path is unchanged. onDelete "set null" so deleting an
     * MSP account drops its client tenants back to the standalone path rather
     * than cascading them away. TODO(phase-2): stamped when a tenant is attached
     * to an MSP portfolio (+ Stripe quantity sync on attach/detach).
     */
    mspAccountId: uuid("msp_account_id").references(() => mspAccounts.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Partial-unique: one workspace per connected Entra tenant, but many
    // workspaces may have a null tid (not yet connected to Microsoft).
    uniqueIndex("tenants_tid_idx")
      .on(t.tid)
      .where(sql`${t.tid} is not null`),
    // Legacy, see workosOrgId.
    uniqueIndex("tenants_workos_org_idx")
      .on(t.workosOrgId)
      .where(sql`${t.workosOrgId} is not null`),
    // Domain-JIT lookup: find the joinable workspace for a verified email domain.
    index("tenants_domain_idx")
      .on(t.domain)
      .where(sql`${t.domain} is not null`),
    // One Stripe customer per tenant: a mismatched second customer is a DB
    // error, not a silent overwrite.
    uniqueIndex("tenants_stripe_customer_idx")
      .on(t.stripeCustomerId)
      .where(sql`${t.stripeCustomerId} is not null`),
    // Portfolio lookup: find every client workspace owned by an MSP account.
    index("tenants_msp_account_idx")
      .on(t.mspAccountId)
      .where(sql`${t.mspAccountId} is not null`),
    check(
      "tenants_currency_supported",
      sql`${t.currency} in ('EUR', 'USD', 'GBP', 'CHF', 'CAD', 'AUD', 'DKK', 'NOK', 'SEK', 'PLN', 'CZK')`,
    ),
    check("tenants_currency_rate_positive", sql`${t.currencyRatePpm} > 0`),
    check(
      "tenants_domain_join_mode_check",
      sql`${t.domainJoinMode} in ('off', 'approval', 'auto')`,
    ),
  ],
);

/** A full tenant row, for code that passes tenants around by value. */
export type TenantRow = typeof tenants.$inferSelect;

/**
 * One row per workspace that has a Microsoft 365 connection. Decouples the
 * Microsoft tenant (the Graph data connector) from the workspace identity:
 *
 *  - mode='managed': admin-consent to LicenseMeter's central multi-tenant app;
 *    authenticates with the env CONNECTOR_CLIENT_ID/SECRET keyed by tid. No
 *    per-workspace credentials are stored.
 *  - mode='byo': the customer's own Entra app registration. The client secret
 *    OR the certificate private key (PEM) is stored AES-256-GCM encrypted at
 *    rest (same AUTH_SECRET-derived helper as adobe/saas connections).
 *
 * Both modes feed the same sync pipeline; appClientForTenant branches on mode.
 */
export const msConnections = pgTable(
  "ms_connections",
  {
    tenantId: uuid("tenant_id")
      .primaryKey()
      .references(() => tenants.id, { onDelete: "cascade" }),
    mode: text("mode").$type<"managed" | "byo">().notNull(),
    /** Entra tenant id (tid) this connection authenticates against. */
    tid: text("tid").notNull(),
    /** BYO only: the customer's app (client) id. Null for managed (uses env). */
    appClientId: text("app_client_id"),
    /** BYO only: 'secret' or 'cert'. Null for managed. */
    credType: text("cred_type").$type<"secret" | "cert">(),
    /** BYO only: AES-256-GCM of the client secret OR certificate private key. */
    secretEnc: text("secret_enc"),
    /** BYO/cert only: certificate thumbprint (hex), needed by MSAL clientCertificate. */
    certThumbprint: text("cert_thumbprint"),
    /** BYO/secret only: client-secret expiry, for the pre-expiry warning. */
    secretExpiresAt: timestamp("secret_expires_at", { withTimezone: true }),
    /** Last successful test-connection (roles-claim check). */
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    /** Last test-connection / app-only auth failure, redacted; null when healthy. */
    lastVerifyError: text("last_verify_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check("ms_connections_mode_check", sql`${t.mode} in ('managed', 'byo')`),
    // Dual-mode column invariant, mirrored from the write paths: byo stores its
    // own credential triplet; managed authenticates via the env app and stores
    // none of it.
    check(
      "ms_connections_mode_columns_check",
      sql`(${t.mode} = 'byo' and ${t.appClientId} is not null and ${t.credType} is not null and ${t.secretEnc} is not null) or (${t.mode} = 'managed' and ${t.appClientId} is null and ${t.credType} is null and ${t.secretEnc} is null)`,
    ),
    // One Microsoft tenant belongs to at most one workspace: the atomic
    // backstop behind the application-level steal guard in connectMicrosoftByo.
    uniqueIndex("ms_connections_tid_idx").on(t.tid),
  ],
);

/** A full Microsoft connection row, passed around by value. */
export type MsConnectionRow = typeof msConnections.$inferSelect;

/** Who may sign in to which tenant workspace, and as what. */
export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** Entra object id; null until an invited email signs in for the first time. */
    oid: text("oid"),
    /**
     * Legacy identity from before sign-in moved to Entra, never written
     * anymore. A row with this set and oid null belongs to a member who has not
     * signed in with Microsoft yet; it is linked (oid set) on a sign-in whose
     * email is proven, or through the claim-by-email flow. Kept for one release.
     */
    workosUserId: text("workos_user_id"),
    email: text("email").notNull(),
    name: text("name"),
    role: text("role").$type<MembershipRole>().notNull().default("viewer"),
    welcomeTourAt: timestamp("welcome_tour_at", { withTimezone: true }),
    dataTourAt: timestamp("data_tour_at", { withTimezone: true }),
    /**
     * Personal opt-outs for the scheduled emails. The tenant-level switches
     * decide whether the workspace sends an email at all; these only take
     * this one person off the recipient list.
     */
    digestOptOut: boolean("digest_opt_out").notNull().default(false),
    reportOptOut: boolean("report_opt_out").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("memberships_tenant_email_idx").on(t.tenantId, t.email),
    index("memberships_oid_idx").on(t.oid),
    index("memberships_workos_user_idx").on(t.workosUserId),
    check(
      "memberships_role_check",
      sql`${t.role} in ('viewer', 'admin', 'owner')`,
    ),
  ],
);

/**
 * A colleague from the workspace's Microsoft tenant or verified email domain
 * asking to get in (approval mode), or the record of one who joined
 * automatically (auto mode, stored as approved). One row per workspace and
 * person (Entra object id), so a repeated sign-in never files a second request
 * or notifies admins again, and a declined or removed person does not come
 * back without an invite. Rows from before sign-in moved to Entra carry only
 * workosUserId and stay unique per workspace and email.
 */
export const joinRequests = pgTable(
  "join_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** Sign-in email, lowercased. Proven, or the UPN of a same-tenant signer. */
    email: text("email").notNull(),
    /** Entra object id and home tenant of the requester; null on legacy rows. */
    oid: text("oid"),
    tid: text("tid"),
    /** Legacy identity of rows filed before sign-in moved to Entra. */
    workosUserId: text("workos_user_id"),
    name: text("name"),
    status: text("status")
      .$type<JoinRequestStatus>()
      .notNull()
      .default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    /** Deciding owner/admin; null for automatic joins or once they leave. */
    decidedByMembershipId: uuid("decided_by_membership_id").references(
      () => memberships.id,
      { onDelete: "set null" },
    ),
  },
  (t) => [
    uniqueIndex("join_requests_tenant_oid_idx")
      .on(t.tenantId, t.oid)
      .where(sql`${t.oid} is not null`),
    // Legacy rows only: new rows are unique per person, not per address.
    uniqueIndex("join_requests_tenant_legacy_email_idx")
      .on(t.tenantId, t.email)
      .where(sql`${t.oid} is null`),
    index("join_requests_tenant_status_idx").on(t.tenantId, t.status),
    index("join_requests_oid_idx").on(t.oid),
    index("join_requests_workos_user_idx").on(t.workosUserId),
    check(
      "join_requests_status_check",
      sql`${t.status} in ('pending', 'approved', 'declined')`,
    ),
  ],
);

/**
 * Short-lived nonces for the admin-consent redirect, bound to the initiating
 * user (Entra object id) and the workspace the consent was started from. The
 * callback only accepts the browser session of that same user.
 */
export const consentStates = pgTable("consent_states", {
  state: text("state").primaryKey(),
  /** Entra object id of the initiator. */
  oid: text("oid"),
  /** Initiator's Entra home tenant; not read on callback. */
  tid: text("tid"),
  /** Legacy column, never written anymore. Kept for one release. */
  workosUserId: text("workos_user_id"),
  /** Workspace the consent was started from; checked on callback. */
  tenantId: uuid("tenant_id").references(() => tenants.id, {
    onDelete: "cascade",
  }),
  email: text("email").notNull(),
  name: text("name"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  usedAt: timestamp("used_at", { withTimezone: true }),
});

/** Latest subscribedSkus snapshot per tenant. */
export const tenantSkus = pgTable(
  "tenant_skus",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    skuId: text("sku_id").notNull(),
    skuPartNumber: text("sku_part_number").notNull(),
    displayName: text("display_name"),
    prepaidEnabled: integer("prepaid_enabled").notNull().default(0),
    prepaidSuspended: integer("prepaid_suspended").notNull().default(0),
    prepaidWarning: integer("prepaid_warning").notNull().default(0),
    consumedUnits: integer("consumed_units").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.skuId] })],
);

/** Latest directory + activity snapshot per user per tenant. */
export const tenantUsers = pgTable(
  "tenant_users",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    graphId: text("graph_id").notNull(),
    upn: text("upn").notNull(),
    displayName: text("display_name"),
    accountEnabled: boolean("account_enabled").notNull().default(true),
    userType: text("user_type"),
    createdDateTime: timestamp("created_date_time", { withTimezone: true }),
    lastInteractiveSignIn: timestamp("last_interactive_sign_in", {
      withTimezone: true,
    }),
    lastNonInteractiveSignIn: timestamp("last_non_interactive_sign_in", {
      withTimezone: true,
    }),
    /** Max across sign-ins and workload activity; the signal waste rules use. */
    lastActivity: timestamp("last_activity", { withTimezone: true }),
    workloadActivity: jsonb("workload_activity").$type<WorkloadActivity>(),
    licenses: jsonb("licenses").$type<UserLicense[]>().notNull().default([]),
    syncedAt: timestamp("synced_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.graphId] }),
    index("tenant_users_upn_idx").on(t.tenantId, t.upn),
  ],
);

/** Editable monthly price per SKU per tenant; prefilled from the static catalog. */
export const priceBook = pgTable(
  "price_book",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    skuId: text("sku_id").notNull(),
    monthlyPriceCents: integer("monthly_price_cents").notNull().default(0),
    /** "default" = catalog estimate, "custom" = entered by the customer. */
    source: text("source")
      .$type<"default" | "custom">()
      .notNull()
      .default("default"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.skuId] }),
    check("price_book_monthly_price_nonneg", sql`${t.monthlyPriceCents} >= 0`),
  ],
);

export const findings = pgTable(
  "findings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** Stable identity of a finding across syncs: rule|userId|skuId. */
    dedupeKey: text("dedupe_key").notNull(),
    rule: text("rule").$type<WasteRuleId>().notNull(),
    graphUserId: text("graph_user_id"),
    skuId: text("sku_id"),
    title: text("title").notNull(),
    detail: jsonb("detail")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    monthlyImpactCents: integer("monthly_impact_cents").notNull().default(0),
    status: text("status").$type<FindingStatus>().notNull().default("open"),
    remediationStatus: text("remediation_status")
      .$type<RemediationStatus>()
      .notNull()
      .default("unassigned"),
    assigneeMembershipId: uuid("assignee_membership_id").references(
      () => memberships.id,
      { onDelete: "set null" },
    ),
    dueDate: date("due_date"),
    workflowNote: text("workflow_note"),
    ticketUrl: text("ticket_url"),
    remediationRequestedAt: timestamp("remediation_requested_at", {
      withTimezone: true,
    }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("findings_tenant_dedupe_idx").on(t.tenantId, t.dedupeKey),
    index("findings_tenant_status_idx").on(t.tenantId, t.status),
    index("findings_tenant_remediation_idx").on(
      t.tenantId,
      t.remediationStatus,
    ),
    index("findings_assignee_idx").on(t.assigneeMembershipId),
    // Backs the user-detail page, which lists findings for one user.
    index("findings_tenant_user_idx").on(t.tenantId, t.graphUserId),
    check("findings_monthly_impact_nonneg", sql`${t.monthlyImpactCents} >= 0`),
    check(
      "findings_remediation_status_check",
      sql`${t.remediationStatus} in ('unassigned', 'planned', 'requested', 'in_progress')`,
    ),
  ],
);

/** Contract and notice-period calendar across Microsoft and SaaS vendors. */
export const vendorRenewals = pgTable(
  "vendor_renewals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    vendor: text("vendor").notNull(),
    contractName: text("contract_name").notNull(),
    renewalDate: date("renewal_date").notNull(),
    noticeDays: integer("notice_days").notNull().default(30),
    annualValueCents: integer("annual_value_cents").notNull().default(0),
    ownerMembershipId: uuid("owner_membership_id").references(
      () => memberships.id,
      { onDelete: "set null" },
    ),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("vendor_renewals_tenant_date_idx").on(t.tenantId, t.renewalDate),
    index("vendor_renewals_owner_idx").on(t.ownerMembershipId),
    check(
      "vendor_renewals_notice_days_range",
      sql`${t.noticeDays} between 0 and 365`,
    ),
    check(
      "vendor_renewals_annual_value_nonneg",
      sql`${t.annualValueCents} >= 0`,
    ),
  ],
);

export const syncRuns = pgTable(
  "sync_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    status: text("status").$type<SyncRunStatus>().notNull().default("running"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    steps: jsonb("steps").$type<SyncStep[]>().notNull().default([]),
    error: text("error"),
  },
  (t) => [
    index("sync_runs_tenant_idx").on(t.tenantId, t.startedAt),
    // Concurrency lock: at most one running sync per tenant.
    uniqueIndex("sync_runs_one_running_idx")
      .on(t.tenantId)
      .where(sql`${t.status} = 'running'`),
  ],
);

/** Adobe Admin Console connection (UMAPI OAuth server-to-server credentials). */
export const adobeConnections = pgTable("adobe_connections", {
  tenantId: uuid("tenant_id")
    .primaryKey()
    .references(() => tenants.id, { onDelete: "cascade" }),
  orgId: text("org_id").notNull(),
  clientId: text("client_id").notNull(),
  /** AES-256-GCM encrypted with a key derived from AUTH_SECRET. */
  clientSecretEnc: text("client_secret_enc").notNull(),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  lastSyncStatus: text("last_sync_status"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Latest Adobe user snapshot per tenant (entitlements only: Adobe has no usage API). */
export const adobeUsers = pgTable(
  "adobe_users",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    status: text("status").notNull().default("active"),
    products: jsonb("products").$type<string[]>().notNull().default([]),
    syncedAt: timestamp("synced_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.email] })],
);

/**
 * One row per connected SaaS provider (zoom/atlassian/salesforce). orgRef is
 * the provider-side account reference (Zoom account ID, Atlassian org ID,
 * Salesforce My Domain URL); clientId is null where the provider uses a
 * bare API key. The secret is AES-256-GCM encrypted like the Adobe one.
 */
export const saasConnections = pgTable(
  "saas_connections",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    provider: text("provider").$type<SaasProvider>().notNull(),
    orgRef: text("org_ref").notNull(),
    clientId: text("client_id"),
    secretEnc: text("secret_enc").notNull(),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    lastSyncStatus: text("last_sync_status"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.provider] })],
);

/** Latest seat snapshot per tenant and provider, normalized across providers. */
export const saasSeats = pgTable(
  "saas_seats",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    provider: text("provider").$type<SaasProvider>().notNull(),
    email: text("email").notNull(),
    displayName: text("display_name"),
    status: text("status").notNull().default("active"),
    products: jsonb("products").$type<string[]>().notNull().default([]),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
    syncedAt: timestamp("synced_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.provider, t.email] })],
);

/**
 * Daily API spend per AI connector (openai/anthropic), one row per provider,
 * UTC bucket day and cost category (model / line item). Amounts are USD cents
 * exactly as billed by the provider, never converted into the workspace
 * currency or mixed into the seat-spend snapshots.
 */
export const aiSpendDaily = pgTable(
  "ai_spend_daily",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    provider: text("provider").$type<SaasProvider>().notNull(),
    day: date("day").notNull(),
    category: text("category").notNull(),
    amountCents: integer("amount_cents").notNull().default(0),
    syncedAt: timestamp("synced_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.provider, t.day, t.category] }),
    check("ai_spend_daily_amount_nonneg", sql`${t.amountCents} >= 0`),
  ],
);

/** Who did what, per workspace. Cascade-deleted with the tenant (GDPR-clean). */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    actorOid: text("actor_oid").notNull(),
    actorEmail: text("actor_email"),
    action: text("action").$type<AuditAction>().notNull(),
    detail: jsonb("detail")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("audit_log_tenant_idx").on(t.tenantId, t.createdAt)],
);

/** Alert dedup: one row per alert key, cooldown window + suppression counter. */
export const opsAlerts = pgTable("ops_alerts", {
  key: text("key").primaryKey(),
  lastSentAt: timestamp("last_sent_at", { withTimezone: true }).notNull(),
  suppressedCount: integer("suppressed_count").notNull().default(0),
});

/**
 * Durable fixed-window rate-limit counters (see rateLimitDurable). One row per
 * limiter key (e.g. "capture:<ip>", "invite:<tenant>"); count is the hits in the
 * current window, resetAt when it rolls over. Backs the abuse-prone paths that
 * must hold across serverless instances/cold starts, unlike the in-memory limiter.
 */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
});

/** Every Microsoft identity that ever signed in. Powers first-sign-in alerts. */
export const seenSignins = pgTable("seen_signins", {
  oid: text("oid").primaryKey(),
  tid: text("tid").notNull(),
  upn: text("upn"),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  signinCount: integer("signin_count").notNull().default(1),
});

/** Launch-update / security-one-pager requests from the landing page. */
export const emailSignups = pgTable(
  "email_signups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    /** When the automated welcome email went out; null for pre-feature rows. */
    welcomeSentAt: timestamp("welcome_sent_at", { withTimezone: true }),
    unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
    source: text("source").notNull().default("landing"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // One signup per address. Emails are normalized to lowercase on the only
    // insert path (captureEmail), so a plain column index is equivalent to a
    // lower(email) index while staying compatible with onConflict upserts; the
    // unsubscribe route still matches on lower() to cover any legacy row.
    uniqueIndex("email_signups_email_idx").on(t.email),
  ],
);

/** One row per tenant per day for trend lines. */
export const snapshots = pgTable(
  "snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    totalMonthlySpendCents: integer("total_monthly_spend_cents")
      .notNull()
      .default(0),
    totalMonthlyWasteCents: integer("total_monthly_waste_cents")
      .notNull()
      .default(0),
    purchasedSeats: integer("purchased_seats").notNull().default(0),
    assignedSeats: integer("assigned_seats").notNull().default(0),
    bySku: jsonb("by_sku")
      .$type<Record<string, { purchased: number; assigned: number }>>()
      .notNull()
      .default({}),
  },
  (t) => [
    uniqueIndex("snapshots_tenant_day_idx").on(t.tenantId, t.day),
    check(
      "snapshots_total_monthly_spend_nonneg",
      sql`${t.totalMonthlySpendCents} >= 0`,
    ),
    check(
      "snapshots_total_monthly_waste_nonneg",
      sql`${t.totalMonthlyWasteCents} >= 0`,
    ),
  ],
);

/**
 * One row per tenant with a Stripe subscription (current or past). The webhook
 * is the source of truth; tenants.subscriptionStatus/paidUntil are a cached
 * read-fast mirror. tier/interval are nullable so an unmapped price is never
 * coerced to the cheapest tier.
 */
export const subscriptions = pgTable(
  "subscriptions",
  {
    tenantId: uuid("tenant_id")
      .primaryKey()
      .references(() => tenants.id, { onDelete: "cascade" }),
    stripeSubscriptionId: text("stripe_subscription_id").notNull(),
    stripeCustomerId: text("stripe_customer_id").notNull(),
    stripePriceId: text("stripe_price_id").notNull(),
    tier: text("tier").$type<PlanTier>(),
    interval: text("interval").$type<PlanInterval>(),
    status: text("status").$type<SubscriptionStatus>().notNull(),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    /** event.created of the last applied webhook; gates stale out-of-order writes. */
    lastEventAt: timestamp("last_event_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // One subscriptions row per Stripe subscription: a second tenant pointing
    // at the same sub is a webhook routing bug, not a silent duplicate. Both
    // columns are NOT NULL, so a plain unique index suffices (no null collisions).
    uniqueIndex("subscriptions_stripe_subscription_idx").on(
      t.stripeSubscriptionId,
    ),
    // One Stripe customer maps to at most one subscriptions row, mirroring the
    // tenants.stripeCustomerId guard.
    uniqueIndex("subscriptions_stripe_customer_idx").on(t.stripeCustomerId),
  ],
);

/**
 * A paid hosted plan. No row means Free. Provider-neutral: Microsoft
 * Marketplace, Polar and hand-set comps all write the same shape. loadEntitlement
 * reads it and entitlementOf decides, so feature checks never know who was paid.
 *
 * Owned by exactly one of a workspace (Pro) or an MSP account (MSP). Client
 * workspaces inherit an MSP row through tenants.mspAccountId, up to quantity.
 */
export const entitlements = pgTable(
  "entitlements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => tenants.id, {
      onDelete: "cascade",
    }),
    mspAccountId: uuid("msp_account_id").references(() => mspAccounts.id, {
      onDelete: "cascade",
    }),
    plan: text("plan").$type<PaidPlan>().notNull(),
    source: text("source").$type<EntitlementSource>().notNull(),
    status: text("status").$type<EntitlementStatus>().notNull(),
    /** Workspaces covered. Always 1 for Pro; included plus add-on tenants for MSP. */
    quantity: integer("quantity").notNull().default(1),
    trialEnd: timestamp("trial_end", { withTimezone: true }),
    /** Paid-access horizon. A canceled row stays entitled until this passes. */
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    providerSubscriptionId: text("provider_subscription_id"),
    providerCustomerId: text("provider_customer_id"),
    /** Timestamp of the last applied provider event; gates stale out-of-order writes. */
    lastEventAt: timestamp("last_event_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("entitlements_tenant_idx")
      .on(t.tenantId)
      .where(sql`${t.tenantId} is not null`),
    uniqueIndex("entitlements_msp_account_idx")
      .on(t.mspAccountId)
      .where(sql`${t.mspAccountId} is not null`),
    // One row per provider subscription: a second owner pointing at the same
    // subscription is a webhook routing bug, not a silent duplicate.
    uniqueIndex("entitlements_provider_subscription_idx")
      .on(t.source, t.providerSubscriptionId)
      .where(sql`${t.providerSubscriptionId} is not null`),
    check(
      "entitlements_single_owner",
      sql`(${t.tenantId} is null) <> (${t.mspAccountId} is null)`,
    ),
    check("entitlements_plan_valid", sql`${t.plan} in ('pro', 'msp')`),
    check(
      "entitlements_source_valid",
      sql`${t.source} in ('marketplace', 'polar', 'comped')`,
    ),
    check(
      "entitlements_status_valid",
      sql`${t.status} in ('trialing', 'active', 'past_due', 'canceled', 'suspended')`,
    ),
    check("entitlements_quantity_positive", sql`${t.quantity} > 0`),
    // A Pro plan belongs to one workspace and covers exactly it; an MSP plan
    // belongs to an MSP account. The database refuses the other combinations
    // so no writer can grant MSP features to a single workspace by mistake.
    check(
      "entitlements_plan_owner",
      sql`(${t.plan} = 'pro' and ${t.tenantId} is not null and ${t.quantity} = 1) or (${t.plan} = 'msp' and ${t.mspAccountId} is not null)`,
    ),
  ],
).enableRLS();

export type EntitlementRow = typeof entitlements.$inferSelect;

/**
 * Idempotency ledger for payment-provider webhooks. Insert-on-receipt inside
 * the same transaction as the handler: a duplicate event is a no-op, and a
 * handler failure rolls the row back so the provider retry re-processes exactly
 * once. No FK, so it survives workspace deletion.
 */
export const billingEvents = pgTable(
  "billing_events",
  {
    provider: text("provider").$type<BillingProvider>().notNull(),
    eventId: text("event_id").notNull(),
    type: text("type").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.provider, t.eventId] })],
).enableRLS();

/**
 * Online acceptance of the standard data processing agreement (AVV). Every
 * hosted workspace needs one per document version, Free included, because the
 * hosted service is a processor under GDPR Art. 28 for all of them.
 */
export const dpaAcceptances = pgTable(
  "dpa_acceptances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** Document version from src/lib/dpa.ts at the time of acceptance. */
    version: text("version").notNull(),
    language: text("language").$type<"en" | "de">().notNull(),
    /** WorkOS user id or Entra object id of the accepting owner or admin. */
    acceptedByKey: text("accepted_by_key").notNull(),
    acceptedByEmail: text("accepted_by_email").notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("dpa_acceptances_tenant_version_idx").on(t.tenantId, t.version),
    check("dpa_acceptances_language_valid", sql`${t.language} in ('en', 'de')`),
  ],
).enableRLS();

/**
 * A data processing agreement signed with a named customer company (Pro and
 * MSP). kind "subprocessor" is the MSP variant, where the MSP is the processor
 * for its clients and LicenseMeter is its sub-processor.
 */
export const dpaAgreements = pgTable(
  "dpa_agreements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"controller" | "subprocessor">().notNull(),
    version: text("version").notNull(),
    language: text("language").$type<"en" | "de">().notNull(),
    companyName: text("company_name").notNull(),
    companyAddress: text("company_address").notNull(),
    signerName: text("signer_name").notNull(),
    signerTitle: text("signer_title").notNull(),
    signerEmail: text("signer_email").notNull(),
    /** WorkOS user id or Entra object id of the owner who signed in the portal. */
    signedByKey: text("signed_by_key").notNull(),
    signedAt: timestamp("signed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("dpa_agreements_tenant_kind_version_idx").on(
      t.tenantId,
      t.kind,
      t.version,
    ),
    check(
      "dpa_agreements_kind_valid",
      sql`${t.kind} in ('controller', 'subprocessor')`,
    ),
    check("dpa_agreements_language_valid", sql`${t.language} in ('en', 'de')`),
  ],
).enableRLS();

/**
 * Bearer tokens for the read-only MCP server (Pro and MSP). Only the SHA-256
 * hash is stored; the plain token is shown once at creation.
 */
export const apiTokens = pgTable(
  "api_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull(),
    /** First characters of the token, so owners can tell tokens apart. */
    tokenPrefix: text("token_prefix").notNull(),
    createdByKey: text("created_by_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("api_tokens_hash_idx").on(t.tokenHash),
    index("api_tokens_tenant_idx").on(t.tenantId),
  ],
).enableRLS();

/**
 * Claim-by-email tokens: how a member from before sign-in moved to Entra proves
 * a membership is theirs when the id token carries no proven email. Only the
 * SHA-256 of the token is stored; the token itself travels in the mail sent to
 * the membership's address. Single use, short-lived, and bound to the Entra
 * identity that asked for it.
 */
export const membershipClaims = pgTable(
  "membership_claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Address of the memberships to link, lowercased. The mail goes here. */
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull(),
    requestedByOid: text("requested_by_oid").notNull(),
    requestedByTid: text("requested_by_tid").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("membership_claims_token_hash_idx").on(t.tokenHash),
    index("membership_claims_created_idx").on(t.createdAt),
  ],
).enableRLS();

/**
 * Idempotency ledger for Stripe webhook deliveries. Insert-on-receipt inside
 * the same transaction as the handler: a duplicate event id is a no-op, and a
 * handler failure rolls the row back so Stripe's retry re-processes exactly
 * once. No FK — survives tenant deletion.
 */
export const stripeEvents = pgTable("stripe_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Delivery ledger for the scheduled emails (weekly digest, monthly report) and
 * the immediate leak alerts. One row per (tenant, job, period, recipient): the
 * row is claimed before the send and marked sent afterwards, so a repeated
 * cron run, a scheduler restart or a run cut off by the function time limit
 * never sends the same email twice. Claim rules live in ~/server/emailLedger.
 */
export const emailDeliveries = pgTable(
  "email_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    job: text("job").$type<"digest" | "report" | "leak">().notNull(),
    /**
     * Digest: ISO week in UTC ("2026-W38"). Report: reported month ("2026-08").
     * Leak: ISO timestamp of the alert, so every alert is its own delivery.
     */
    periodKey: text("period_key").notNull(),
    /** Lowercased email address. */
    recipient: text("recipient").notNull(),
    /** Our own send attempt. What the provider reports later is deliveryStatus. */
    status: text("status").$type<"claimed" | "sent" | "failed">().notNull(),
    attempts: integer("attempts").notNull().default(0),
    /** Short failure reason, never a secret or a response body. */
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Start of the current claim; a claim older than 15 minutes is stale. */
    claimedAt: timestamp("claimed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    /** Message id the provider returned; delivery webhooks refer to it. */
    providerId: text("provider_id"),
    /** Latest state reported by a delivery webhook; null until one arrives. */
    deliveryStatus: text("delivery_status").$type<DeliveryStatus>(),
    /** Provider timestamp of the event behind deliveryStatus. */
    deliveryEventAt: timestamp("delivery_event_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("email_deliveries_key_idx").on(
      t.tenantId,
      t.job,
      t.periodKey,
      t.recipient,
    ),
    index("email_deliveries_created_idx").on(t.createdAt),
    // Postgres treats NULLs as distinct, so unsent rows never collide here.
    uniqueIndex("email_deliveries_provider_id_idx").on(t.providerId),
    check(
      "email_deliveries_job_check",
      sql`${t.job} in ('digest', 'report', 'leak')`,
    ),
    check(
      "email_deliveries_status_check",
      sql`${t.status} in ('claimed', 'sent', 'failed')`,
    ),
    check(
      "email_deliveries_delivery_status_check",
      sql`${t.deliveryStatus} in ('accepted', 'delivered', 'delayed', 'failed', 'bounced', 'suppressed', 'complained')`,
    ),
  ],
);

/**
 * Addresses a workspace no longer mails because the provider reported a
 * permanent failure (hard bounce, suppression, spam complaint). Written by the
 * delivery webhook, read before every ledger send. Scoped per workspace: a
 * block in one workspace says nothing about the same address in another.
 */
export const emailBlocks = pgTable(
  "email_blocks",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** Lowercased email address. */
    email: text("email").notNull(),
    reason: text("reason").$type<EmailBlockReason>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.email] }),
    check(
      "email_blocks_reason_check",
      sql`${t.reason} in ('bounced', 'suppressed', 'complained')`,
    ),
  ],
).enableRLS();

/**
 * The one shared address a workspace can add on top of its owners and admins,
 * for a team mailbox like it-licenses@example.com. Additive: the people who
 * already get the mail keep getting it. The address has no membership to hang
 * a personal opt-out on, so the three switches below are its own opt-out. The
 * pending columns hold one verification request at a time: only the sha256 of
 * the token is stored, and a pending change never interrupts the address that
 * is already verified.
 */
export const notificationAddresses = pgTable("notification_addresses", {
  tenantId: uuid("tenant_id")
    .primaryKey()
    .references(() => tenants.id, { onDelete: "cascade" }),
  /** The verified address. Null until the first confirmation. */
  email: text("email"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  /** Address waiting for its confirmation; replacing it voids the older link. */
  pendingEmail: text("pending_email"),
  tokenHash: text("token_hash"),
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
  digest: boolean("digest").notNull().default(true),
  report: boolean("report").notNull().default(true),
  leakAlerts: boolean("leak_alerts").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}).enableRLS();

export type NotificationAddressRow = typeof notificationAddresses.$inferSelect;

/**
 * Server-side session revocation. Sessions are stateless signed cookies, so a
 * stolen cookie would otherwise stay valid until it expires (or AUTH_SECRET is
 * rotated). Signing out records the token's jti here, and auth() refuses a
 * session whose jti is present. Rows carry the token expiry and are pruned
 * lazily. Tokens minted before this table existed have no jti and are treated
 * as not revocable, so deploying it does not sign anyone out.
 */
export const sessionRevocations = pgTable("session_revocations", {
  jti: text("jti").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type SessionRevocationRow = typeof sessionRevocations.$inferSelect;
