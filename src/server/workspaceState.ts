import "server-only";

import { eq } from "drizzle-orm";

import { db } from "~/server/db";
import {
  adobeConnections,
  msConnections,
  saasConnections,
  saasSeats,
  tenantSkus,
} from "~/server/db/schema";

/**
 * Whether a workspace has connected any service yet — any connector row
 * (Microsoft / Adobe / SaaS) or any synced/imported data. Drives the
 * workspace-first onboarding: a workspace with nothing connected shows the
 * onboarding empty state instead of a dashboard of zeros.
 */
export const workspaceHasConnectorOrData = async (
  tenantId: string,
): Promise<boolean> => {
  const [sku, seat, ms, adobe, saas] = await Promise.all([
    db.query.tenantSkus.findFirst({
      where: eq(tenantSkus.tenantId, tenantId),
      columns: { skuId: true },
    }),
    db.query.saasSeats.findFirst({
      where: eq(saasSeats.tenantId, tenantId),
      columns: { tenantId: true },
    }),
    db.query.msConnections.findFirst({
      where: eq(msConnections.tenantId, tenantId),
      columns: { tenantId: true },
    }),
    db.query.adobeConnections.findFirst({
      where: eq(adobeConnections.tenantId, tenantId),
      columns: { tenantId: true },
    }),
    db.query.saasConnections.findFirst({
      where: eq(saasConnections.tenantId, tenantId),
      columns: { tenantId: true },
    }),
  ]);
  return Boolean(sku ?? seat ?? ms ?? adobe ?? saas);
};
