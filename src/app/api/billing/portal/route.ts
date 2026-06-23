import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { appBaseUrl, billingEnabled, env } from "~/env";
import { apiAccess } from "~/server/access";
import { audit } from "~/server/audit";
import { notifyOps } from "~/server/ops";
import { stripe } from "~/server/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Open the Stripe Customer Portal for the active workspace: update card, view
 * VAT invoices, cancel at period end, switch plan/interval. Owner-gated; the
 * customer comes from the resolved tenant, never the request.
 */
export const POST = async () => {
  if (!billingEnabled()) {
    return NextResponse.json({ error: "billing_disabled" }, { status: 503 });
  }
  const ctx = await apiAccess("owner");
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (ctx.tenant.isDemo) {
    return NextResponse.json({ error: "demo" }, { status: 400 });
  }
  if (!ctx.tenant.stripeCustomerId) {
    // No customer yet -> nothing to manage; the UI routes these to Checkout.
    return NextResponse.json({ error: "no_subscription" }, { status: 409 });
  }

  const params: Stripe.BillingPortal.SessionCreateParams = {
    customer: ctx.tenant.stripeCustomerId,
    return_url: `${appBaseUrl()}/app/billing`,
  };
  // The portal configuration MUST allow subscription cancellation for the
  // self-serve cancel flow to work. When STRIPE_PORTAL_CONFIGURATION_ID is set
  // it must point at a config with that feature enabled; when it is unset we
  // fall back to Stripe's account-level default portal config (which may or may
  // not expose cancel), so warn ops once but still proceed.
  if (env.STRIPE_PORTAL_CONFIGURATION_ID) {
    params.configuration = env.STRIPE_PORTAL_CONFIGURATION_ID;
  } else {
    void notifyOps(
      "stripe portal: STRIPE_PORTAL_CONFIGURATION_ID is unset; falling back to the Stripe default portal config, which may not expose subscription cancellation",
      { key: "stripe-portal:unconfigured", cooldownMs: 86_400_000 },
    );
  }

  let session: Stripe.BillingPortal.Session;
  try {
    session = await stripe().billingPortal.sessions.create(params);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`stripe portal: session create failed for tenant ${ctx.tenant.id}: ${msg}`);
    void notifyOps(
      `stripe portal: session create failed for tenant ${ctx.tenant.id}: ${msg}`,
      { key: `stripe-portal:${ctx.tenant.id}`, cooldownMs: 3_600_000 },
    );
    return NextResponse.json({ error: "stripe_unavailable" }, { status: 502 });
  }
  await audit(ctx, "billing_portal_opened", {});
  return NextResponse.json({ url: session.url });
};
