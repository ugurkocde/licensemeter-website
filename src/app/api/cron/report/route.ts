import { timingSafeEqual } from "node:crypto";

import { and, eq, inArray, isNotNull, or } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { env, siteUrl } from "~/env";
import { fmtMoney, workspaceLabel } from "~/lib/format";
import { db } from "~/server/db";
import { findings, memberships, tenants, tenantSkus } from "~/server/db/schema";
import { emailEnabled, reportHtml, sendEmail } from "~/server/email";
import { notifyOps } from "~/server/ops";
import { renderWasteReportPdf } from "~/server/report/renderReport";

export const maxDuration = 300;

/** Constant-time bearer check; a length mismatch is false, never a throw. */
const authorized = (req: NextRequest, secret: string): boolean => {
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
};

/**
 * Monthly PDF waste report to workspace owners/admins, for workspaces that
 * opted in via Settings. Runs on the 1st right after the nightly sync, so
 * the numbers are hours old at most. Trial workspaces (consentedAt null)
 * are included: their imported data is valid and the report is the
 * retention hook. But tenants with no stored data at all are skipped.
 * No-op until Resend is configured.
 */
export const GET = async (req: NextRequest) => {
  if (!env.CRON_SECRET || !authorized(req, env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!emailEnabled()) {
    return NextResponse.json({ skipped: "email not configured" });
  }

  const optedIn = await db.query.tenants.findMany({
    where: and(eq(tenants.isDemo, false), eq(tenants.monthlyReport, true)),
  });
  let sent = 0;

  for (const tenant of optedIn) {
    try {
      const [admins, anySku, anyFinding] = await Promise.all([
        db.query.memberships.findMany({
          where: and(
            eq(memberships.tenantId, tenant.id),
            inArray(memberships.role, ["owner", "admin"]),
            // Claimed via either provider (entra oid / workos workosUserId);
            // pending invites have neither and are excluded.
            or(
              isNotNull(memberships.oid),
              isNotNull(memberships.workosUserId),
            ),
          ),
        }),
        // Cheap emptiness probes: never render a PDF of nothing but zeros.
        db.query.tenantSkus.findFirst({
          where: eq(tenantSkus.tenantId, tenant.id),
          columns: { skuId: true },
        }),
        db.query.findings.findFirst({
          where: eq(findings.tenantId, tenant.id),
          columns: { id: true },
        }),
      ]);

      const to = admins.map((m) => m.email).filter(Boolean);
      if (to.length === 0) continue;
      if (!anySku && !anyFinding) continue;

      const pdf = await renderWasteReportPdf(tenant.id);
      const tenantLabel = tenant.name ?? "your tenant";
      // With unpriced SKUs the waste is 0. Lead with the findings count
      // instead of an underwhelming zero (same fallback as the digest).
      const subject =
        pdf.monthlyWasteCents > 0
          ? `LicenseMeter monthly report: ${fmtMoney(pdf.monthlyWasteCents, tenant.currency)}/mo waste in ${tenantLabel}`
          : `LicenseMeter monthly report: ${pdf.openFindings} open findings in ${tenantLabel}`;

      await sendEmail({
        to,
        subject,
        html: reportHtml({
          tenantName: workspaceLabel(tenant),
          monthlySpend: fmtMoney(pdf.monthlySpendCents, tenant.currency),
          monthlyWaste: fmtMoney(pdf.monthlyWasteCents, tenant.currency),
          openFindings: pdf.openFindings,
          appUrl: siteUrl(),
        }),
        attachments: [
          { filename: pdf.filename, content: pdf.buffer.toString("base64") },
        ],
      });
      sent++;
    } catch (err) {
      void notifyOps(
        `monthly report failed for tenant ${workspaceLabel(tenant)}: ${err instanceof Error ? err.message : String(err)}`,
        { key: `report:${tenant.id}`, cooldownMs: 60 * 60 * 1000 },
      );
    }
  }

  return NextResponse.json({ tenants: optedIn.length, sent });
};
