import { NextResponse } from "next/server";

import { siteUrl } from "~/env";
import { planName } from "~/lib/planLabel";
import { apiFeatureAccess } from "~/server/access";
import { audit } from "~/server/audit";
import { planCalendar } from "~/server/renewals/calendar";
import { icsFileName } from "~/server/renewals/ics";
import { loadRenewalPlan } from "~/server/renewals/loadPlan";

const KEY = /^(all|sku-[\w-]{1,100}|contract-[0-9a-f-]{36})$/i;

/** Calendar (.ics) export of one renewal in the plan, or of all with "all". */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const access = await apiFeatureAccess("renewalPlans");
  if (access.denied === "unauthorized")
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (access.denied === "featureRequired")
    return NextResponse.json(
      {
        error: `The renewal savings plan is included in ${planName(access.plan)}.`,
        feature: access.feature,
        plan: access.plan,
      },
      { status: 402 },
    );
  const { ctx } = access;
  const { key } = await params;
  if (!KEY.test(key))
    return NextResponse.json({ error: "not found" }, { status: 404 });
  const now = new Date();
  const plan = await loadRenewalPlan(ctx.tenant, now);
  const items =
    key === "all" ? plan.items : plan.items.filter((item) => item.key === key);
  if (items.length === 0)
    return NextResponse.json({ error: "not found" }, { status: 404 });
  await audit(ctx, "export_renewal_ics", { key, events: items.length });
  const body = planCalendar(items, {
    tenantId: ctx.tenant.id,
    currency: ctx.tenant.currency,
    url: `${siteUrl()}/app/renewals`,
    now,
  });
  const fileName =
    key === "all" ? "licensemeter-renewals.ics" : icsFileName(items[0]!.label);
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
