import { count, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";

import { appBaseUrl, mspEnabled, taxEnabled } from "~/env";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { tenants } from "~/server/db/schema";
import { currentMspAccount } from "~/server/msp";
import { notifyOps } from "~/server/ops";
import { getOrCreateMspCustomer, mspPriceIdFor, stripe } from "~/server/stripe";
import type { PlanInterval } from "~/server/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Start a Stripe Checkout session for an MSP account's single quantity-based
 * subscription (unit = one connected client tenant). Owner-gated: the account is
 * resolved from the signed-in identity (currentMspAccount, the same auth path
 * apiAccess uses — null for signed-out/demo), never the request body (which
 * carries only {interval}). The quantity is the count of client tenants attached
 * to the account (floored at 1, since Stripe rejects quantity 0).
 *
 * Mode-agnostic: the MSP price is just an env-sourced recurring Price id, so this
 * route never branches on tier — MSP packaging is flat.
 */
export const POST = async (req: NextRequest) => {
  if (!mspEnabled()) {
    return NextResponse.json({ error: "msp_disabled" }, { status: 503 });
  }

  // Owner-gated: resolve the MSP account this signed-in non-demo user owns.
  const account = await currentMspAccount();
  if (!account) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    interval?: unknown;
  } | null;
  const interval: PlanInterval | null =
    body?.interval === "month" || body?.interval === "year"
      ? body.interval
      : null;
  if (!interval) {
    return NextResponse.json({ error: "invalid_interval" }, { status: 400 });
  }

  const priceId = mspPriceIdFor(interval);
  if (!priceId) {
    return NextResponse.json({ error: "price_unconfigured" }, { status: 503 });
  }

  // Quantity = connected client tenants, floored at 1 (Stripe rejects qty 0 and
  // an MSP buying before attaching any tenant still needs a valid line item).
  const [attached] = await db
    .select({ value: count() })
    .from(tenants)
    .where(eq(tenants.mspAccountId, account.id));
  const quantity = Math.max(attached?.value ?? 0, 1);

  // Email for the lazily-created Stripe customer comes from the signed-in user.
  const email = (await auth())?.user.email ?? null;

  let customerId: string;
  try {
    customerId = await getOrCreateMspCustomer(account, email);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`stripe msp checkout: customer setup failed for account ${account.id}: ${msg}`);
    void notifyOps(
      `stripe msp checkout: customer setup failed for account ${account.id}: ${msg}`,
      { key: `stripe-msp-checkout:${account.id}`, cooldownMs: 3_600_000 },
    );
    return NextResponse.json({ error: "stripe_unavailable" }, { status: 502 });
  }
  const base = appBaseUrl();
  const tax = taxEnabled();

  const params: Stripe.Checkout.SessionCreateParams = {
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity }],
    client_reference_id: account.id,
    metadata: {
      mspAccountId: account.id,
      interval,
    },
    // Durable account link carried onto the subscription, where the webhook
    // reads it on every lifecycle event.
    subscription_data: {
      metadata: {
        mspAccountId: account.id,
        interval,
      },
    },
    automatic_tax: { enabled: tax },
    allow_promotion_codes: true,
    locale: "auto",
    success_url: `${base}/app/msp?checkout=success`,
    cancel_url: `${base}/app/msp?checkout=cancelled`,
  };
  // customer_update + address collection are required by Stripe Tax when a
  // pre-existing customer is passed; only set them when tax is on.
  if (tax) {
    params.tax_id_collection = { enabled: true };
    params.customer_update = { address: "auto", name: "auto" };
    params.billing_address_collection = "required";
  }

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe().checkout.sessions.create(params, {
      // Per-minute bucket: dedupes a double-click / network retry into one
      // session, but a genuine later retry gets a fresh checkout.
      idempotencyKey: `msp-checkout:${account.id}:${priceId}:${Math.floor(
        Date.now() / 60_000,
      )}`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`stripe msp checkout: session create failed for account ${account.id}: ${msg}`);
    void notifyOps(
      `stripe msp checkout: session create failed for account ${account.id}: ${msg}`,
      { key: `stripe-msp-checkout:${account.id}`, cooldownMs: 3_600_000 },
    );
    return NextResponse.json({ error: "stripe_unavailable" }, { status: 502 });
  }

  return NextResponse.json({ url: session.url });
};
