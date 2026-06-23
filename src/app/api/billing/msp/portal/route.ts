import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { appBaseUrl, env, mspEnabled } from "~/env";
import { currentMspAccount } from "~/server/msp";
import { notifyOps } from "~/server/ops";
import { stripe } from "~/server/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Open the Stripe Customer Portal for an MSP account: update card, view VAT
 * invoices, cancel at period end. Owner-gated; the customer comes from the
 * resolved MSP account (currentMspAccount — null for signed-out/demo), never the
 * request. Mirrors the self-serve portal route.
 */
export const POST = async () => {
  if (!mspEnabled()) {
    return NextResponse.json({ error: "msp_disabled" }, { status: 503 });
  }

  // Owner-gated: resolve the MSP account this signed-in non-demo user owns.
  const account = await currentMspAccount();
  if (!account) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!account.stripeCustomerId) {
    // No customer yet -> nothing to manage; the UI routes these to Checkout.
    return NextResponse.json({ error: "no_subscription" }, { status: 409 });
  }

  const params: Stripe.BillingPortal.SessionCreateParams = {
    customer: account.stripeCustomerId,
    return_url: `${appBaseUrl()}/app/msp`,
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
    console.error(`stripe msp portal: session create failed for account ${account.id}: ${msg}`);
    void notifyOps(
      `stripe msp portal: session create failed for account ${account.id}: ${msg}`,
      { key: `stripe-msp-portal:${account.id}`, cooldownMs: 3_600_000 },
    );
    return NextResponse.json({ error: "stripe_unavailable" }, { status: 502 });
  }
  return NextResponse.json({ url: session.url });
};
