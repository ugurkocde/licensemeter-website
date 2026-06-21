import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { apiAccess } from "~/server/access";
import { audit } from "~/server/audit";
import { centsToDecimal, csvResponse, toCsv } from "~/server/csv";
import { db } from "~/server/db";
import { priceBook, tenantSkus } from "~/server/db/schema";

/**
 * Price book export, shaped to round-trip through the bulk import on the
 * licenses page: M365 rows use the skuPartNumber as key, connector rows the
 * provider-prefixed price book key; the price is a dot-decimal (e.g. 14.90)
 * in the workspace currency, as documented by the header row.
 */
export const GET = async () => {
  const ctx = await apiAccess("viewer");
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!ctx.entitlement.active)
    return NextResponse.json({ error: "upgrade_required" }, { status: 402 });

  const [prices, skus] = await Promise.all([
    db.query.priceBook.findMany({ where: eq(priceBook.tenantId, ctx.tenant.id) }),
    db.query.tenantSkus.findMany({ where: eq(tenantSkus.tenantId, ctx.tenant.id) }),
  ]);
  const skuById = new Map(skus.map((s) => [s.skuId, s]));

  const rows = prices
    .map((p) => {
      const sku = skuById.get(p.skuId);
      const colon = p.skuId.indexOf(":");
      return {
        key: sku?.skuPartNumber ?? p.skuId,
        name: sku
          ? (sku.displayName ?? sku.skuPartNumber)
          : colon > 0
            ? p.skuId.slice(colon + 1)
            : p.skuId,
        cents: p.monthlyPriceCents,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const csv = toCsv([
    ["key", "display_name", `monthly_price (${ctx.tenant.currency} decimal)`],
    ...rows.map((r) => [r.key, r.name, centsToDecimal(r.cents)]),
  ]);
  await audit(ctx, "export_pricebook_csv", { rows: rows.length });
  return csvResponse("licensemeter-pricebook.csv", csv);
};
