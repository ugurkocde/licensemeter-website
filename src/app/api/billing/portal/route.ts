import { NextResponse } from "next/server";
import { z } from "zod";

import { appBaseUrl, polarEnabled } from "~/env";
import { apiAccess } from "~/server/access";
import { audit } from "~/server/audit";
import { isSameOrigin } from "~/server/auth/origin";
import type { EntitlementOwner } from "~/server/billing/entitlementWrites";
import { getMspAccount } from "~/server/billing/mspAccount";
import {
  createPolarPortalSession,
  entitlementRowOf,
  PolarApiError,
} from "~/server/billing/polar";
import { rateLimitDurable } from "~/server/rateLimit";

/** Which plan to manage. Without it the workspace's own plan comes first. */
const bodySchema = z.object({ owner: z.enum(["workspace", "msp"]).optional() });

/**
 * Opens the Polar customer portal for a plan bought through Polar: the active
 * workspace's own plan, or the plan of the caller's MSP account. Both owners
 * come from the session, and a portal is only opened for a row Polar bills.
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
  if (!(await rateLimitDurable(`portal:${ctx.tenant.id}`, 10, 600_000))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  // An empty body is fine: the owner is optional.
  const body = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const wanted = body.data.owner;

  const candidates: EntitlementOwner[] = [];
  if (wanted !== "msp") candidates.push({ tenantId: ctx.tenant.id });
  if (wanted !== "workspace") {
    const account = await getMspAccount(ctx);
    if (account) candidates.push({ mspAccountId: account.id });
  }

  for (const owner of candidates) {
    const row = await entitlementRowOf(owner);
    if (row?.source !== "polar") continue;
    try {
      const { url } = await createPolarPortalSession({
        owner,
        customerId: row.providerCustomerId,
        returnUrl: `${appBaseUrl()}/app/billing`,
      });
      await audit(
        ctx,
        "mspAccountId" in owner
          ? "msp_billing_portal_opened"
          : "billing_portal_opened",
        { provider: "polar" },
      );
      return NextResponse.json({ url });
    } catch (err) {
      if (!(err instanceof PolarApiError)) throw err;
      console.error(`[billing] ${err.message}`);
      return NextResponse.json({ error: "providerError" }, { status: 502 });
    }
  }
  return NextResponse.json({ error: "noSubscription" }, { status: 404 });
};
