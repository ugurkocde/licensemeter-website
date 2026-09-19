import { NextResponse } from "next/server";
import { z } from "zod";

import { appBaseUrl, polarEnabled } from "~/env";
import { apiAccess } from "~/server/access";
import { audit } from "~/server/audit";
import { isSameOrigin } from "~/server/auth/origin";
import type { EntitlementOwner } from "~/server/billing/entitlementWrites";
import { ensureMspAccount, MspAccountError } from "~/server/billing/mspAccount";
import {
  createPolarCheckout,
  entitlementRowOf,
  grantsNow,
  PolarApiError,
  polarProductId,
} from "~/server/billing/polar";
import { rateLimitDurable } from "~/server/rateLimit";

const bodySchema = z.object({
  plan: z.enum(["pro", "msp"]),
  interval: z.enum(["month", "year"]),
});

/**
 * Starts a Polar checkout. Pro is bought for the active workspace, MSP for the
 * caller's MSP account; the owner is always derived from the session, never
 * from the request.
 */
export const POST = async (req: Request) => {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!polarEnabled()) {
    return NextResponse.json({ error: "notConfigured" }, { status: 503 });
  }
  const ctx = await apiAccess("owner");
  if (!ctx)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // The demo sign-in is shared by every visitor and never buys anything.
  if (ctx.user.isDemo || ctx.tenant.isDemo) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!(await rateLimitDurable(`checkout:${ctx.tenant.id}`, 10, 600_000))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const body = bodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const product = body.data;
  if (!polarProductId(product)) {
    return NextResponse.json({ error: "notConfigured" }, { status: 503 });
  }

  let owner: EntitlementOwner;
  if (product.plan === "msp") {
    try {
      owner = { mspAccountId: (await ensureMspAccount(ctx)).id };
    } catch (err) {
      if (err instanceof MspAccountError) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }
      throw err;
    }
  } else {
    owner = { tenantId: ctx.tenant.id };
  }

  // A plan that is running already, whoever bills it, must not be billed a
  // second time: Marketplace and comped plans are managed where they were set
  // up, a running Polar plan through the customer portal.
  const existing = await entitlementRowOf(owner);
  if (existing && grantsNow(existing)) {
    return NextResponse.json(
      { error: "alreadyEntitled", source: existing.source },
      { status: 409 },
    );
  }

  const base = appBaseUrl();
  let url: string;
  try {
    ({ url } = await createPolarCheckout({
      product,
      owner,
      customerEmail: ctx.membership.email,
      successUrl: `${base}/app/billing?checkout=success`,
      returnUrl: `${base}/app/billing`,
      allowTrial: existing === null,
    }));
  } catch (err) {
    if (!(err instanceof PolarApiError)) throw err;
    console.error(`[billing] ${err.message}`);
    return NextResponse.json({ error: "providerError" }, { status: 502 });
  }

  await audit(
    ctx,
    product.plan === "msp" ? "msp_checkout_started" : "checkout_started",
    { provider: "polar", plan: product.plan, interval: product.interval },
  );
  return NextResponse.json({ url });
};
