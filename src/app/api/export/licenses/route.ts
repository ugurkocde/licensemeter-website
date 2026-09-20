import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { apiAccess } from "~/server/access";
import { audit } from "~/server/audit";
import { centsToDecimal, csvResponse, toCsv } from "~/server/csv";
import { db } from "~/server/db";
import { priceBook, tenantSkus } from "~/server/db/schema";
import { withTenant } from "~/server/db/tenant";
import { isShelfwareExempt } from "~/server/waste/engine";

export const GET = async () => {
  const ctx = await apiAccess("viewer");
  if (!ctx)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  return withTenant(db, ctx.tenant.id, async () => {
    const [skus, prices] = await Promise.all([
      db.query.tenantSkus.findMany({
        where: eq(tenantSkus.tenantId, ctx.tenant.id),
      }),
      db.query.priceBook.findMany({
        where: eq(priceBook.tenantId, ctx.tenant.id),
      }),
    ]);
    const priceBySku = new Map(
      prices.map((p) => [p.skuId, p.monthlyPriceCents]),
    );

    // Match the dashboard inventory table exactly: drop Microsoft's free/viral/
    // capacity sentinels (WINDOWS_STORE, FLOW_FREE, etc.) so the export lists only
    // the real, purchased SKUs the user sees on screen.
    const visibleSkus = skus.filter(
      (s) => !isShelfwareExempt(s.skuPartNumber, s.prepaidEnabled),
    );

    const csv = toCsv([
      [
        "SKU",
        "Part number",
        "Purchased",
        "Assigned",
        "Available",
        `Monthly price (${ctx.tenant.currency})`,
        `Monthly spend (${ctx.tenant.currency})`,
        `Unassigned cost (${ctx.tenant.currency})`,
      ],
      ...visibleSkus.map((s) => {
        const price = priceBySku.get(s.skuId) ?? 0;
        // Clamp to match the table's Unassigned column (no negative counts).
        const available = Math.max(0, s.prepaidEnabled - s.consumedUnits);
        return [
          s.displayName ?? s.skuPartNumber,
          s.skuPartNumber,
          s.prepaidEnabled,
          s.consumedUnits,
          available,
          centsToDecimal(price),
          centsToDecimal(s.consumedUnits * price),
          centsToDecimal(available * price),
        ];
      }),
    ]);
    await audit(ctx, "export_licenses_csv", { rows: visibleSkus.length });
    return csvResponse("licensemeter-licenses.csv", csv);
  });
};
