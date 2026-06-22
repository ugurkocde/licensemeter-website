import { renderToBuffer } from "@react-pdf/renderer";
import { and, desc, eq, inArray } from "drizzle-orm";

import { fmtDate, fmtMoney, workspaceLabel } from "~/lib/format";
import { RULE_META } from "~/lib/rules";
import { db } from "~/server/db";
import { findings, priceBook, tenants, tenantSkus } from "~/server/db/schema";
import { reportFilename } from "~/server/report/filename";
import { WasteReport } from "~/server/report/WasteReport";
import type { WasteRuleId } from "~/server/types";

export type WasteReportPdf = {
  buffer: Buffer;
  /** licensemeter-report-<workspace-slug-or-id>-<yyyy-mm>.pdf */
  filename: string;
  /** Standing totals as rendered into the PDF, reused for email subject/body. */
  monthlySpendCents: number;
  monthlyWasteCents: number;
  openFindings: number;
};

/**
 * Loads a tenant's license data and renders the branded waste-report PDF,
 * shared by the authenticated export route and the monthly report cron.
 */
export const renderWasteReportPdf = async (
  tenantId: string,
): Promise<WasteReportPdf> => {
  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
  });
  if (!tenant) throw new Error(`unknown tenant ${tenantId}`);
  const currency = tenant.currency;

  const [skus, prices, open] = await Promise.all([
    db.query.tenantSkus.findMany({ where: eq(tenantSkus.tenantId, tenantId) }),
    db.query.priceBook.findMany({ where: eq(priceBook.tenantId, tenantId) }),
    db.query.findings.findMany({
      where: and(
        eq(findings.tenantId, tenantId),
        inArray(findings.status, ["open", "acknowledged"]),
      ),
      orderBy: desc(findings.monthlyImpactCents),
    }),
  ]);

  const priceBySku = new Map(prices.map((p) => [p.skuId, p.monthlyPriceCents]));
  const monthlySpend = skus.reduce(
    (sum, s) => sum + s.consumedUnits * (priceBySku.get(s.skuId) ?? 0),
    0,
  );
  const monthlyWaste = open.reduce((sum, f) => sum + f.monthlyImpactCents, 0);

  const byRule = new Map<WasteRuleId, { count: number; impact: number }>();
  for (const f of open) {
    const agg = byRule.get(f.rule) ?? { count: 0, impact: 0 };
    agg.count += 1;
    agg.impact += f.monthlyImpactCents;
    byRule.set(f.rule, agg);
  }

  const buffer = await renderToBuffer(
    WasteReport({
      data: {
        tenantName: workspaceLabel(tenant),
        generatedOn: fmtDate(new Date()),
        monthlySpend: fmtMoney(monthlySpend, currency),
        monthlyWaste: `${fmtMoney(monthlyWaste, currency)}/mo`,
        annualWaste: fmtMoney(monthlyWaste * 12, currency),
        openFindings: open.length,
        byRule: [...byRule.entries()]
          .sort((a, b) => b[1].impact - a[1].impact)
          .map(([rule, agg]) => ({
            label: RULE_META[rule].label,
            count: agg.count,
            impact:
              agg.impact > 0 ? `${fmtMoney(agg.impact, currency)}/mo` : "-",
          })),
        topFindings: open.slice(0, 12).map((f) => ({
          title: f.title,
          impact:
            f.monthlyImpactCents > 0
              ? `${fmtMoney(f.monthlyImpactCents, currency)}/mo`
              : "-",
        })),
      },
    }),
  );

  return {
    buffer,
    filename: reportFilename(tenant, new Date()),
    monthlySpendCents: monthlySpend,
    monthlyWasteCents: monthlyWaste,
    openFindings: open.length,
  };
};
