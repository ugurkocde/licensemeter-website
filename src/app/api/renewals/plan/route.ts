import { NextResponse } from "next/server";

import { upgradePath } from "~/lib/upgrade";
import { apiAccess } from "~/server/access";
import { db } from "~/server/db";
import { withTenant } from "~/server/db/tenant";
import { hasFeature } from "~/server/entitlement";
import { loadRenewalPlan } from "~/server/renewals/loadPlan";
import { teaserOf } from "~/server/renewals/plan";

/**
 * The renewal savings plan. Every plan gets real totals from its own data;
 * the per-renewal breakdown needs the renewalPlans feature.
 */
export async function GET() {
  const ctx = await apiAccess("viewer");
  if (!ctx)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // Database-level tenant isolation, like the other workspace exports.
  const plan = await withTenant(db, ctx.tenant.id, () =>
    loadRenewalPlan(ctx.tenant),
  );
  const headers = { "Cache-Control": "private, no-store" };
  if (!hasFeature(ctx.entitlement, "renewalPlans")) {
    return NextResponse.json(
      {
        access: "teaser",
        currency: ctx.tenant.currency,
        teaser: teaserOf(plan),
        upgrade: upgradePath("renewalPlans"),
      },
      { headers },
    );
  }
  return NextResponse.json(
    {
      access: "full",
      currency: ctx.tenant.currency,
      bufferPct: plan.bufferPct,
      summary: { ...plan.summary, next: plan.summary.next?.key ?? null },
      unsizedContracts: plan.unsizedContracts,
      items: plan.items,
    },
    { headers },
  );
}
