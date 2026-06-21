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
  FindingStatus,
  MembershipRole,
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

/** One row per connected Microsoft 365 tenant (the unit of isolation everywhere). */
export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Entra tenant id (tid claim). */
    tid: text("tid").notNull(),
    name: text("name"),
    currency: text("currency").notNull().default("EUR"),
    /** Capabilities discovered during sync; null until first sync. */
    concealedNames: boolean("concealed_names"),
    hasP1: boolean("has_p1"),
    /** Per-workspace inactivity threshold for the inactive-users rule. */
    inactiveDays: integer("inactive_days").notNull().default(90),
    /** Next Microsoft agreement renewal; powers the renewal-window card and digest line. */
    renewalDate: date("renewal_date"),
    /** Immediate email when a sync inserts new offboarding-leak findings. */
    leakAlerts: boolean("leak_alerts").notNull().default(true),
    /** Monthly PDF waste report to owners/admins (QBR deliverable). */
    monthlyReport: boolean("monthly_report").notNull().default(false),
    /** Signal quality from the last sync; lets price edits re-run analysis offline. */
    activitySignal: text("activity_signal").$type<"full" | "none">(),
    copilotSignal: text("copilot_signal").$type<"per-user" | "aggregate" | "none">(),
    usageAggregate: jsonb("usage_aggregate").$type<AggregateUsage>(),
    copilotAggregate: jsonb("copilot_aggregate").$type<AggregateUsage>(),
    isDemo: boolean("is_demo").notNull().default(false),
    consentedAt: timestamp("consented_at", { withTimezone: true }),
    /**
     * Immutable trial anchor, written once at tenant creation and NEVER
     * updated (unlike consentedAt, which is re-stamped on every reconnect and
     * would reset the trial clock). entitlementOf anchors on
     * trialStartedAt ?? createdAt.
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("tenants_tid_idx").on(t.tid),
    // One Stripe customer per tenant: a mismatched second customer is a DB
    // error, not a silent overwrite.
    uniqueIndex("tenants_stripe_customer_idx")
      .on(t.stripeCustomerId)
      .where(sql`${t.stripeCustomerId} is not null`),
  ],
);

/** A full tenant row, for code that passes tenants around by value. */
export type TenantRow = typeof tenants.$inferSelect;

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
    email: text("email").notNull(),
    name: text("name"),
    role: text("role").$type<MembershipRole>().notNull().default("viewer"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("memberships_tenant_email_idx").on(t.tenantId, t.email),
    index("memberships_oid_idx").on(t.oid),
    check("memberships_role_check", sql`${t.role} in ('viewer', 'admin', 'owner')`),
  ],
);

/** Short-lived nonces for the admin-consent redirect, bound to the initiating user. */
export const consentStates = pgTable("consent_states", {
  state: text("state").primaryKey(),
  oid: text("oid").notNull(),
  /** The initiator's sign-in tenant; the granted tenant must match it (v1: one workspace per tenant). */
  tid: text("tid").notNull(),
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
    source: text("source").$type<"default" | "custom">().notNull().default("default"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.skuId] })],
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
    detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default({}),
    monthlyImpactCents: integer("monthly_impact_cents").notNull().default(0),
    status: text("status").$type<FindingStatus>().notNull().default("open"),
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
  (t) => [primaryKey({ columns: [t.tenantId, t.provider, t.day, t.category] })],
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
    detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default({}),
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
  (t) => [uniqueIndex("email_signups_email_idx").on(t.email)],
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
    totalMonthlySpendCents: integer("total_monthly_spend_cents").notNull().default(0),
    totalMonthlyWasteCents: integer("total_monthly_waste_cents").notNull().default(0),
    purchasedSeats: integer("purchased_seats").notNull().default(0),
    assignedSeats: integer("assigned_seats").notNull().default(0),
    bySku: jsonb("by_sku")
      .$type<Record<string, { purchased: number; assigned: number }>>()
      .notNull()
      .default({}),
  },
  (t) => [uniqueIndex("snapshots_tenant_day_idx").on(t.tenantId, t.day)],
);

/**
 * One row per tenant with a Stripe subscription (current or past). The webhook
 * is the source of truth; tenants.subscriptionStatus/paidUntil are a cached
 * read-fast mirror. tier/interval are nullable so an unmapped price is never
 * coerced to the cheapest tier.
 */
export const subscriptions = pgTable("subscriptions", {
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
});

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
