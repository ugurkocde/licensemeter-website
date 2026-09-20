import { NextResponse } from "next/server";

import { apiAccess } from "~/server/access";
import { audit } from "~/server/audit";
import { getBranding } from "~/server/billing/branding";
import { db } from "~/server/db";
import { withTenant } from "~/server/db/tenant";
import { renderWasteReportPdf } from "~/server/report/renderReport";

export const maxDuration = 60;

/** Branded PDF waste report: the artifact finance forwards upward. */
export const GET = async () => {
  const ctx = await apiAccess("viewer");
  if (!ctx)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  return withTenant(db, ctx.tenant.id, async () => {
    // White-label marks only reach a workspace whose plan includes them; every
    // other workspace gets the LicenseMeter report.
    const branding = await getBranding(ctx.tenant, ctx.entitlement);
    const pdf = await renderWasteReportPdf(ctx.tenant.id, branding);

    await audit(ctx, "export_report", {
      findings: pdf.openFindings,
      whiteLabel: branding !== null,
    });
    return new Response(new Uint8Array(pdf.buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition":
          'attachment; filename="licensemeter-waste-report.pdf"',
        "Cache-Control": "private, no-store",
      },
    });
  });
};
