import { NextResponse } from "next/server";

import { apiAccess } from "~/server/access";
import { audit } from "~/server/audit";
import { renderWasteReportPdf } from "~/server/report/renderReport";

export const maxDuration = 60;

/** Branded PDF waste report: the artifact finance forwards upward. */
export const GET = async () => {
  const ctx = await apiAccess("viewer");
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!ctx.entitlement.active)
    return NextResponse.json({ error: "upgrade_required" }, { status: 402 });

  const pdf = await renderWasteReportPdf(ctx.tenant.id);

  await audit(ctx, "export_report", { findings: pdf.openFindings });
  return new Response(new Uint8Array(pdf.buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="licensemeter-waste-report.pdf"',
      "Cache-Control": "private, no-store",
    },
  });
};
