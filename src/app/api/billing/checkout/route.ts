import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";

import { appBaseUrl, billingEnabled, taxEnabled } from "~/env";
import { MAX_SELF_SERVE_SEATS, parsePlanString } from "~/lib/plans";
import { apiAccess } from "~/server/access";
import { audit } from "~/server/audit";
import { entitlementOf } from "~/server/entitlement";
import { getOrCreateCustomer, knownSeats, priceIdFor, stripe } from "~/server/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Stripe requires a Checkout trial_end to be at least 48 hours out.
const MIN_TRIAL_PRESERVE_MS = 48 * 60 * 60 * 1000;

/**
 * Start a Stripe Checkout session for the active workspace. Owner-gated; the
 * tenant is taken from the resolved access context, never the request body
 * (which carries only {plan}).
 *
 * "Subscribe now" while the no-card app trial is still running preserves the
 * remaining free days: a card is collected up front but Stripe is told to bill
 * only at the original trial end (trial_end), then it auto-converts. Once the
 * app trial is over (or within 48h of ending), billing starts immediately.
 */
export const POST = async (req: NextRequest) => {
  if (!billingEnabled()) {
    return NextResponse.json({ error: "billing_disabled" }, { status: 503 });
  }
  const ctx = await apiAccess("owner");
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (ctx.tenant.isDemo) {
    return NextResponse.json({ error: "demo" }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as { plan?: unknown } | null;
  const parsed = parsePlanString(
    typeof body?.plan === "string" ? body.plan : null,
  );
  if (!parsed) {
    return NextResponse.json({ error: "invalid_plan" }, { status: 400 });
  }

  const priceId = priceIdFor(parsed.tier, parsed.interval);
  if (!priceId) {
    return NextResponse.json({ error: "price_unconfigured" }, { status: 503 });
  }

  // Self-serve stops at 2,500 seats; larger tenants go to MSP/contact sales.
  // Only enforce when we actually have a synced seat count.
  const seats = await knownSeats(ctx.tenant.id);
  if (seats.hasSync && seats.seats > MAX_SELF_SERVE_SEATS) {
    return NextResponse.json(
      { error: "seats_exceed_self_serve" },
      { status: 409 },
    );
  }

  const customerId = await getOrCreateCustomer(ctx.tenant, ctx.membership.email);
  const base = appBaseUrl();
  const tax = taxEnabled();

  // Preserve the remaining no-card trial days when subscribing mid-trial.
  const entitlement = entitlementOf(ctx.tenant, null, new Date(), false);
  const trialMsLeft = entitlement.trialEndsAt.getTime() - Date.now();
  const preserveTrial =
    entitlement.state === "trial" && trialMsLeft > MIN_TRIAL_PRESERVE_MS;

  const params: Stripe.Checkout.SessionCreateParams = {
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: ctx.tenant.id,
    metadata: {
      tenantId: ctx.tenant.id,
      actorOid: ctx.user.oid,
      actorUpn: ctx.user.upn,
      tier: parsed.tier,
      interval: parsed.interval,
    },
    // Durable tenant link carried onto the subscription, where the webhook
    // reads it on every lifecycle event.
    subscription_data: {
      metadata: {
        tenantId: ctx.tenant.id,
        tier: parsed.tier,
        interval: parsed.interval,
      },
      // Bill only at the original trial end; null/absent means bill now.
      ...(preserveTrial
        ? { trial_end: Math.floor(entitlement.trialEndsAt.getTime() / 1000) }
        : {}),
    },
    automatic_tax: { enabled: tax },
    allow_promotion_codes: true,
    locale: "auto",
    success_url: `${base}/app/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/app/billing?checkout=cancelled`,
  };
  // A trialing subscription needs the card on file up front so it can
  // auto-convert when the trial ends.
  if (preserveTrial) {
    params.payment_method_collection = "always";
  }
  // customer_update + address collection are required by Stripe Tax when a
  // pre-existing customer is passed; only set them when tax is on.
  if (tax) {
    params.tax_id_collection = { enabled: true };
    params.customer_update = { address: "auto", name: "auto" };
    params.billing_address_collection = "required";
  }

  const session = await stripe().checkout.sessions.create(params, {
    // Per-minute bucket: dedupes a double-click / network retry into one
    // session, but a genuine later retry gets a fresh checkout.
    idempotencyKey: `checkout:${ctx.tenant.id}:${priceId}:${Math.floor(
      Date.now() / 60_000,
    )}`,
  });

  await audit(ctx, "checkout_started", {
    tier: parsed.tier,
    interval: parsed.interval,
    trialPreserved: preserveTrial,
  });
  return NextResponse.json({ url: session.url });
};
