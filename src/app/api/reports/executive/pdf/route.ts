import { NextResponse } from "next/server";

import { planName } from "~/lib/planLabel";
import { apiFeatureAccess } from "~/server/access";
import { audit } from "~/server/audit";
import { getBranding } from "~/server/billing/branding";
import { db } from "~/server/db";
import { withTenant } from "~/server/db/tenant";
import { loadExecutiveSummary } from "~/server/report/executiveData";
import { reportFilename } from "~/server/report/filename";
import { renderExecutiveReportPdf } from "~/server/report/renderExecutive";

export const maxDuration = 60;

/**
 * The one-page executive savings report as a PDF. Free gets 402: its preview
 * shows headline totals only, never the full report.
 */
export async function GET() {
  const access = await apiFeatureAccess("execReport");
  if (access.denied === "unauthorized")
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (access.denied === "featureRequired")
    return NextResponse.json(
      {
        error: `The executive savings report is included in ${planName(access.plan)}.`,
        feature: access.feature,
        plan: access.plan,
      },
      { status: 402 },
    );
  const { ctx } = access;
  const now = new Date();
  // Database-level tenant isolation, like the other workspace exports.
  const buffer = await withTenant(db, ctx.tenant.id, async () => {
    const [summary, branding] = await Promise.all([
      loadExecutiveSummary(ctx.tenant, ctx.entitlement, now),
      getBranding(ctx.tenant, ctx.entitlement),
    ]);
    const pdf = await renderExecutiveReportPdf(summary, branding);
    await audit(ctx, "export_executive_report", {
      renewalActions: summary.renewals.count,
      whiteLabel: branding !== null,
    });
    return pdf;
  });
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${reportFilename(ctx.tenant, now, "executive-report")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
