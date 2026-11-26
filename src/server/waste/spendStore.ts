import { eq } from "drizzle-orm";
import { db } from "~/server/db";
import {
  adobeUsers,
  priceBook,
  saasSeats,
  tenantSkus,
} from "~/server/db/schema";
import { groupSaasSeats, licenseSpend } from "./spend";

export async function loadLicenseSpend(tenantId: string) {
  const [skus, prices, adobe, saas] = await Promise.all([
    db.query.tenantSkus.findMany({ where: eq(tenantSkus.tenantId, tenantId) }),
    db.query.priceBook.findMany({ where: eq(priceBook.tenantId, tenantId) }),
    db.query.adobeUsers.findMany({
      where: eq(adobeUsers.tenantId, tenantId),
      columns: { products: true, status: true },
    }),
    db.query.saasSeats.findMany({
      where: eq(saasSeats.tenantId, tenantId),
      columns: { provider: true, products: true, status: true },
    }),
  ]);
  return {
    skus,
    prices,
    spend: licenseSpend({ skus, adobe, saas: groupSaasSeats(saas) }, prices),
  };
}
