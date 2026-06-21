import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { apiAccess } from "~/server/access";
import { audit } from "~/server/audit";
import { centsToDecimal, csvResponse, toCsv } from "~/server/csv";
import { db } from "~/server/db";
import { priceBook, tenantSkus } from "~/server/db/schema";

export const GET = async () => {
  const ctx = await apiAccess("viewer");
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!ctx.entitlement.active)
    return NextResponse.json({ error: "upgrade_required" }, { status: 402 });

  const [skus, prices] = await Promise.all([
    db.query.tenantSkus.findMany({ where: eq(tenantSkus.tenantId, ctx.tenant.id) }),
    db.query.priceBook.findMany({ where: eq(priceBook.tenantId, ctx.tenant.id) }),
  ]);
  const priceBySku = new Map(prices.map((p) => [p.skuId, p.monthlyPriceCents]));

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
    ...skus.map((s) => {
      const price = priceBySku.get(s.skuId) ?? 0;
      const available = s.prepaidEnabled - s.consumedUnits;
      return [
        s.displayName ?? s.skuPartNumber,
        s.skuPartNumber,
        s.prepaidEnabled,
        s.consumedUnits,
        available,
        centsToDecimal(price),
        centsToDecimal(s.consumedUnits * price),
        centsToDecimal(Math.max(available, 0) * price),
      ];
    }),
  ]);
  await audit(ctx, "export_licenses_csv", { rows: skus.length });
  return csvResponse("licensemeter-licenses.csv", csv);
};
