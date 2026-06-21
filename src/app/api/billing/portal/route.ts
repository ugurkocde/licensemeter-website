import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { appBaseUrl, billingEnabled, env } from "~/env";
import { apiAccess } from "~/server/access";
import { audit } from "~/server/audit";
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
  if (env.STRIPE_PORTAL_CONFIGURATION_ID) {
    params.configuration = env.STRIPE_PORTAL_CONFIGURATION_ID;
  }

  const session = await stripe().billingPortal.sessions.create(params);
  await audit(ctx, "billing_portal_opened", {});
  return NextResponse.json({ url: session.url });
};
