import "server-only";

import { desc, eq } from "drizzle-orm";
import Stripe from "stripe";

import { env, siteUrl } from "~/env";
import { db } from "~/server/db";
import { snapshots, subscriptions, tenants } from "~/server/db/schema";
import { notifyOps } from "~/server/ops";
import type { PlanInterval, PlanTier } from "~/server/types";

/**
 * Server-only Stripe surface. The client is a lazily-constructed singleton so
 * importing this module never throws when billing is unconfigured; every
 * caller is expected to gate on billingEnabled() first. The apiVersion is
 * pinned to the version this SDK ships with so upgrades are deliberate.
 */
let client: Stripe | null = null;

export const stripe = (): Stripe => {
  client ??= new Stripe(env.STRIPE_SECRET_KEY ?? "", {
    apiVersion: "2026-05-27.dahlia",
    appInfo: { name: "LicenseMeter", url: siteUrl() },
  });
  return client;
};

/** Price ids per tier+interval, sourced from env (null when unconfigured). */
const PRICE_ENV: Record<PlanTier, Record<PlanInterval, string | undefined>> = {
  starter: {
    month: env.STRIPE_PRICE_STARTER_MONTHLY,
    year: env.STRIPE_PRICE_STARTER_ANNUAL,
  },
  growth: {
    month: env.STRIPE_PRICE_GROWTH_MONTHLY,
    year: env.STRIPE_PRICE_GROWTH_ANNUAL,
  },
  scale: {
    month: env.STRIPE_PRICE_SCALE_MONTHLY,
    year: env.STRIPE_PRICE_SCALE_ANNUAL,
  },
};

export const priceIdFor = (
  tier: PlanTier,
  interval: PlanInterval,
): string | null => PRICE_ENV[tier][interval] ?? null;

/**
 * Reverse map a Stripe price id back to a plan. Returns null for an unmapped
 * price (e.g. a forgotten env var or a legacy/portal-switched price) so the
 * webhook never coerces an unknown price to the cheapest tier.
 */
export const planFromPriceId = (
  priceId: string,
): { tier: PlanTier; interval: PlanInterval } | null => {
  for (const tier of ["starter", "growth", "scale"] as const) {
    for (const interval of ["month", "year"] as const) {
      if (PRICE_ENV[tier][interval] === priceId) return { tier, interval };
    }
  }
  return null;
};

/**
 * One Stripe Customer per tenant, reused across checkouts. Created lazily with
 * an idempotency key so concurrent first-checkouts converge on one customer;
 * the partial unique index on tenants.stripe_customer_id makes a genuinely
 * different second customer a DB error rather than a silent overwrite. Never
 * called for demo tenants.
 */
export const getOrCreateCustomer = async (
  tenant: typeof tenants.$inferSelect,
  email: string | null,
): Promise<string> => {
  if (tenant.isDemo) throw new Error("demo tenants are never billed");
  if (tenant.stripeCustomerId) return tenant.stripeCustomerId;

  const customer = await stripe().customers.create(
    {
      email: email ?? undefined,
      name: tenant.name ?? undefined,
      metadata: { tenantId: tenant.id, tid: tenant.tid },
    },
    { idempotencyKey: `customer-create:${tenant.id}` },
  );

  await db
    .update(tenants)
    .set({ stripeCustomerId: customer.id })
    .where(eq(tenants.id, tenant.id));

  return customer.id;
};

/**
 * The tenant's purchased-seat count from the latest snapshot. hasSync is the
 * existence of a snapshot row, NOT seats > 0 (a real sync can legitimately
 * report 0 purchased seats), so the UI can distinguish "no data yet" from
 * "genuinely tiny tenant".
 */
export const knownSeats = async (
  tenantId: string,
): Promise<{ seats: number; hasSync: boolean }> => {
  const snap = await db.query.snapshots.findFirst({
    where: eq(snapshots.tenantId, tenantId),
    orderBy: desc(snapshots.day),
    columns: { purchasedSeats: true },
  });
  return snap
    ? { seats: snap.purchasedSeats, hasSync: true }
    : { seats: 0, hasSync: false };
};

/**
 * GDPR teardown for a disconnecting tenant: cancel any live subscription, then
 * delete the Stripe Customer (PII erasure). Best-effort and non-throwing so a
 * Stripe outage never blocks the local data deletion; each failure is logged in
 * ALL environments (console.error) plus an ops alert. Stripe still retains the
 * immutable invoices it is legally required to keep for tax purposes.
 */
export const teardownTenantBilling = async (
  tenant: typeof tenants.$inferSelect,
): Promise<void> => {
  if (tenant.isDemo || !tenant.stripeCustomerId) return;
  const customerId = tenant.stripeCustomerId;

  const sub = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.tenantId, tenant.id),
    columns: { stripeSubscriptionId: true, status: true },
  });
  if (
    sub?.stripeSubscriptionId &&
    sub.status !== "canceled" &&
    sub.status !== "incomplete_expired"
  ) {
    try {
      await stripe().subscriptions.cancel(sub.stripeSubscriptionId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`stripe teardown: cancel failed for tenant ${tenant.id}: ${msg}`);
      void notifyOps(`stripe teardown: cancel failed for tenant ${tenant.id}: ${msg}`, {
        key: `stripe-teardown:${tenant.id}`,
        cooldownMs: 3_600_000,
      });
    }
  }

  try {
    await stripe().customers.del(customerId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`stripe teardown: customer delete failed for tenant ${tenant.id}: ${msg}`);
    void notifyOps(
      `stripe teardown: customer delete failed for tenant ${tenant.id} (PII erasure incomplete): ${msg}`,
      { key: `stripe-teardown-del:${tenant.id}`, cooldownMs: 3_600_000 },
    );
  }
};

/**
 * Reconciliation backstop: re-read the tenant's latest Stripe subscription and
 * heal the cached entitlement columns + subscriptions row if a webhook was
 * missed. Uses live Stripe data so it is correct regardless of event delivery.
 */
export const reconcileTenantSubscription = async (
  tenant: typeof tenants.$inferSelect,
): Promise<void> => {
  if (tenant.isDemo || !tenant.stripeCustomerId) return;
  const list = await stripe().subscriptions.list({
    customer: tenant.stripeCustomerId,
    status: "all",
    limit: 1,
  });
  const sub = list.data[0];
  if (!sub) return;

  const item = sub.items.data[0];
  const priceId = item?.price.id ?? "";
  const plan = priceId ? planFromPriceId(priceId) : null;
  const status = sub.status;
  const periodEnd = item?.current_period_end
    ? new Date(item.current_period_end * 1000)
    : null;
  const entitled = status === "active" || status === "trialing";
  const paidUntil = entitled || status === "past_due" ? periodEnd : null;

  const cachedPaid = tenant.paidUntil?.getTime() ?? null;
  if (tenant.subscriptionStatus !== status || cachedPaid !== (paidUntil?.getTime() ?? null)) {
    await db
      .update(tenants)
      .set({ subscriptionStatus: status, paidUntil })
      .where(eq(tenants.id, tenant.id));
  }

  const row = {
    stripeSubscriptionId: sub.id,
    stripeCustomerId: tenant.stripeCustomerId,
    stripePriceId: priceId,
    tier: plan?.tier ?? null,
    interval: plan?.interval ?? null,
    status,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    updatedAt: new Date(),
  };
  await db
    .insert(subscriptions)
    .values({ tenantId: tenant.id, ...row })
    .onConflictDoUpdate({ target: subscriptions.tenantId, set: row });
};
