import { and, eq, isNull } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";

import { billingEnabled, env } from "~/env";
import { planByTier } from "~/lib/plans";
import {
  sendPaymentFailed,
  sendSubscriptionConfirmed,
} from "~/server/billingEmail";
import { db } from "~/server/db";
import {
  auditLog,
  stripeEvents,
  subscriptions,
  tenants,
} from "~/server/db/schema";
import { notifyOps } from "~/server/ops";
import { planFromPriceId, stripe } from "~/server/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Tenant = typeof tenants.$inferSelect;

/** Side effect to run AFTER the DB transaction commits (never inside it). */
type EmailJob =
  | {
      kind: "confirmed";
      tenant: Tenant;
      planName: string;
      invoiceUrl?: string;
      trialEndsAt?: Date;
    }
  | { kind: "payment_failed"; tenant: Tenant; invoiceUrl?: string };

const customerIdOf = (c: string | { id: string } | null): string | null =>
  typeof c === "string" ? c : (c?.id ?? null);

/**
 * Write the authoritative subscription state for a tenant. Called with a live
 * (re-retrieved) Stripe.Subscription so it is correct regardless of event
 * order. Returns the tenant + whether this leaves the workspace entitled, or
 * null when the event is rejected (no tenant, demo, customer mismatch, stale).
 */
async function upsertSubscription(
  tx: Tx,
  sub: Stripe.Subscription,
  eventCreatedSec: number,
): Promise<{ tenant: Tenant; activated: boolean } | null> {
  const tenantId = sub.metadata?.tenantId;
  if (!tenantId) return null;

  const tenant = await tx.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
  });
  if (!tenant) return null; // post-delete events: nothing to write
  if (tenant.isDemo) return null; // demo tenants are never billed

  // Unconditional customer-match guard: never write entitlement on an
  // unverifiable (null) or mismatched customer. metadata.tenantId is untrusted;
  // the customer binding (set only at checkout.session.completed) is the gate.
  const customerId = customerIdOf(sub.customer);
  if (!tenant.stripeCustomerId || tenant.stripeCustomerId !== customerId) {
    void notifyOps(
      `stripe webhook: customer mismatch for tenant ${tenantId} (sub ${sub.id})`,
      { key: `stripe-cust:${tenantId}`, cooldownMs: 3_600_000 },
    );
    return null;
  }

  const eventCreatedAt = new Date(eventCreatedSec * 1000);
  // Stale-event guard: do not let an older event overwrite newer state.
  const existing = await tx.query.subscriptions.findFirst({
    where: eq(subscriptions.tenantId, tenantId),
    columns: { lastEventAt: true },
  });
  if (existing?.lastEventAt && existing.lastEventAt > eventCreatedAt) return null;

  const item = sub.items.data[0];
  const priceId = item?.price.id ?? "";
  const plan = priceId ? planFromPriceId(priceId) : null;
  if (priceId && !plan) {
    // Never coerce an unmapped price to a tier; alert so the env gap is caught.
    void notifyOps(
      `stripe webhook: unmapped price ${priceId} for tenant ${tenantId}`,
      { key: `stripe-price:${priceId}`, cooldownMs: 3_600_000 },
    );
  }
  const status = sub.status;
  const periodEnd = item?.current_period_end
    ? new Date(item.current_period_end * 1000)
    : null;
  const entitled = status === "active" || status === "trialing";
  // Paid horizon also backs the past_due grace window.
  const paidUntil = entitled || status === "past_due" ? periodEnd : null;

  const row = {
    stripeSubscriptionId: sub.id,
    stripeCustomerId: customerId,
    stripePriceId: priceId,
    tier: plan?.tier ?? null,
    interval: plan?.interval ?? null,
    status,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    lastEventAt: eventCreatedAt,
    updatedAt: new Date(),
  };
  await tx
    .insert(subscriptions)
    .values({ tenantId, ...row })
    .onConflictDoUpdate({ target: subscriptions.tenantId, set: row });

  await tx
    .update(tenants)
    .set({ subscriptionStatus: status, paidUntil })
    .where(eq(tenants.id, tenantId));

  await tx.insert(auditLog).values({
    tenantId,
    actorOid: "system:stripe",
    actorEmail: null,
    action: entitled
      ? "subscription_activated"
      : status === "canceled"
        ? "subscription_canceled"
        : "subscription_updated",
    detail: { status, priceId, tier: plan?.tier ?? null },
  });

  return { tenant, activated: entitled };
}

const planLabel = (sub: Stripe.Subscription): string => {
  const priceId = sub.items.data[0]?.price.id ?? "";
  const plan = priceId ? planFromPriceId(priceId) : null;
  return plan ? planByTier(plan.tier).name : "LicenseMeter";
};

/** Bind the customer to the tenant (the ONLY place this happens) + first upsert. */
async function handleCheckoutCompleted(
  tx: Tx,
  session: Stripe.Checkout.Session,
  eventCreatedSec: number,
): Promise<void> {
  const tenantId = session.metadata?.tenantId ?? session.client_reference_id;
  const customerId = customerIdOf(session.customer);
  if (!tenantId || !customerId) return;

  const tenant = await tx.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
  });
  if (!tenant || tenant.isDemo) return;

  if (!tenant.stripeCustomerId) {
    await tx
      .update(tenants)
      .set({ stripeCustomerId: customerId })
      .where(and(eq(tenants.id, tenantId), isNull(tenants.stripeCustomerId)));
    const after = await tx.query.tenants.findFirst({
      where: eq(tenants.id, tenantId),
      columns: { stripeCustomerId: true },
    });
    if (after?.stripeCustomerId !== customerId) {
      void notifyOps(
        `stripe webhook: customer bind conflict for tenant ${tenantId}`,
        { key: `stripe-bind:${tenantId}`, cooldownMs: 3_600_000 },
      );
      return;
    }
  } else if (tenant.stripeCustomerId !== customerId) {
    void notifyOps(
      `stripe webhook: checkout customer mismatch for tenant ${tenantId}`,
      { key: `stripe-bind:${tenantId}`, cooldownMs: 3_600_000 },
    );
    return;
  }

  // Process the subscription now so a lost subscription.created cannot strand a
  // paying tenant. Confirmation email is sent from invoice.paid (has the URL).
  if (session.subscription) {
    const subId =
      typeof session.subscription === "string"
        ? session.subscription
        : session.subscription.id;
    const live = await stripe().subscriptions.retrieve(subId);
    await upsertSubscription(tx, live, eventCreatedSec);
  }
}

/** Returns email jobs to run after commit. */
async function handleEvent(tx: Tx, event: Stripe.Event): Promise<EmailJob[]> {
  switch (event.type) {
    case "checkout.session.completed": {
      await handleCheckoutCompleted(tx, event.data.object, event.created);
      return [];
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const live = await stripe().subscriptions.retrieve(event.data.object.id);
      await upsertSubscription(tx, live, event.created);
      return [];
    }
    case "invoice.paid":
    case "invoice.payment_failed": {
      const invoice = event.data.object;
      const subId = invoice.parent?.subscription_details?.subscription;
      if (!subId) return [];
      const live = await stripe().subscriptions.retrieve(
        typeof subId === "string" ? subId : subId.id,
      );
      const res = await upsertSubscription(tx, live, event.created);
      if (!res) return [];
      const invoiceUrl = invoice.hosted_invoice_url ?? undefined;
      if (event.type === "invoice.payment_failed") {
        return [{ kind: "payment_failed", tenant: res.tenant, invoiceUrl }];
      }
      if (invoice.billing_reason === "subscription_create") {
        // A preserved-trial subscription confirms while still trialing: tell the
        // owner nothing is charged yet and when the first charge lands.
        const trialEndsAt =
          live.status === "trialing" && live.trial_end
            ? new Date(live.trial_end * 1000)
            : undefined;
        return [
          {
            kind: "confirmed",
            tenant: res.tenant,
            planName: planLabel(live),
            invoiceUrl,
            trialEndsAt,
          },
        ];
      }
      return [];
    }
    default:
      return [];
  }
}

/**
 * Stripe webhook. Raw-body signature verify, then dedup + handle in one DB
 * transaction (a handler failure rolls the dedup row back so Stripe's retry
 * re-processes exactly once). Emails are sent only after commit so a flaky send
 * never rolls back billing state. No-op (200) when billing is unconfigured.
 */
export const POST = async (req: NextRequest) => {
  if (!billingEnabled()) return NextResponse.json({ received: true });

  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "no_signature" }, { status: 400 });

  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe().webhooks.constructEventAsync(
      raw,
      sig,
      env.STRIPE_WEBHOOK_SECRET ?? "",
    );
  } catch {
    return NextResponse.json({ error: "bad_signature" }, { status: 400 });
  }

  let jobs: EmailJob[] = [];
  try {
    jobs = await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(stripeEvents)
        .values({ id: event.id, type: event.type })
        .onConflictDoNothing()
        .returning({ id: stripeEvents.id });
      if (inserted.length === 0) return []; // duplicate delivery, already done
      return handleEvent(tx, event);
    });
  } catch (err) {
    void notifyOps(
      `stripe webhook ${event.type} failed: ${err instanceof Error ? err.message : String(err)}`,
      { key: `stripe-webhook:${event.type}`, cooldownMs: 600_000 },
    );
    // 500 -> Stripe retries; the rolled-back dedup row lets it reprocess.
    return NextResponse.json({ error: "handler_failed" }, { status: 500 });
  }

  // Post-commit, best-effort emails. A failure here is logged, not retried
  // (the event is already committed), so it cannot double-charge or double-send.
  for (const job of jobs) {
    try {
      if (job.kind === "payment_failed") {
        await sendPaymentFailed(job.tenant, job.invoiceUrl);
      } else {
        await sendSubscriptionConfirmed(
          job.tenant,
          job.planName,
          job.invoiceUrl,
          job.trialEndsAt,
        );
      }
    } catch (err) {
      void notifyOps(
        `stripe webhook email (${job.kind}) failed for tenant ${job.tenant.id}: ${err instanceof Error ? err.message : String(err)}`,
        { key: `stripe-email:${job.tenant.id}`, cooldownMs: 600_000 },
      );
    }
  }

  return NextResponse.json({ received: true });
};
