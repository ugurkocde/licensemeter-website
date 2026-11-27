import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";

import type { SkuTermSetting } from "~/lib/renewalTerm";
import { db } from "~/server/db";
import {
  findings,
  renewalSkuTerms,
  vendorRenewals,
  type TenantRow,
} from "~/server/db/schema";
import { vendorLabel } from "~/server/waste/spend";
import { loadLicenseSpend } from "~/server/waste/spendStore";
import { buildRenewalPlan, type RenewalPlan } from "./plan";

type PlanTenant = Pick<
  TenantRow,
  | "id"
  | "renewalBufferPct"
  | "concealedNames"
  | "activitySignal"
  | "usageReportUnavailable"
>;

/**
 * Per-user activity is hidden when report names are concealed, the last sync
 * had no per-user activity signal, or the usage report was unavailable. A
 * workspace that never synced (CSV import) reports no signal and is not
 * treated as concealed.
 */
export const usageConcealedOf = (tenant: PlanTenant): boolean =>
  tenant.concealedNames === true ||
  tenant.usageReportUnavailable === true ||
  tenant.activitySignal === "none" ||
  tenant.activitySignal === "unknown";

/** Everything the plan needs for one workspace, read in parallel. */
export async function loadRenewalPlan(
  tenant: PlanTenant,
  now = new Date(),
  /** Inventory a page already loaded, so it is not read twice. */
  preloaded?: Awaited<ReturnType<typeof loadLicenseSpend>>,
): Promise<RenewalPlan> {
  const [{ skus, prices, spend }, contracts, open, terms] = await Promise.all([
    preloaded ?? loadLicenseSpend(tenant.id),
    db.query.vendorRenewals.findMany({
      where: eq(vendorRenewals.tenantId, tenant.id),
      columns: {
        id: true,
        vendor: true,
        contractName: true,
        renewalDate: true,
        noticeDays: true,
        skuIds: true,
        targetSeats: true,
      },
    }),
    // Only the parts of each finding's detail the plan reads, so a large
    // tenant does not stream every stored license list to the page.
    db
      .select({
        rule: findings.rule,
        graphUserId: findings.graphUserId,
        skuId: findings.skuId,
        detail: sql<Record<string, unknown>>`jsonb_build_object(
          'licenses', jsonb_path_query_array(${findings.detail}, '$.licenses[*].skuId'),
          'redundantSkuIds', ${findings.detail}->'redundantSkuIds',
          'upn', ${findings.detail}->'upn',
          'products', ${findings.detail}->'products',
          'provider', ${findings.detail}->'provider'
        )`,
      })
      .from(findings)
      .where(
        and(
          eq(findings.tenantId, tenant.id),
          inArray(findings.status, ["open", "acknowledged"]),
        ),
      ),
    db.query.renewalSkuTerms.findMany({
      where: eq(renewalSkuTerms.tenantId, tenant.id),
      columns: { skuId: true, term: true, monthlyAlerts: true },
    }),
  ]);
  const priceBySku = new Map(prices.map((p) => [p.skuId, p.monthlyPriceCents]));
  return buildRenewalPlan({
    skus,
    contracts,
    findings: open,
    priceCents: (skuId) => priceBySku.get(skuId) ?? 0,
    vendorProducts: spend.rows
      .filter((row) => row.vendor !== "microsoft")
      .map((row) => ({
        key: row.skuId,
        vendor: vendorLabel(row.vendor),
        product: row.name,
        seats: row.seats,
        priceCents: row.priceCents,
      })),
    terms: new Map<string, SkuTermSetting>(
      terms.map((t) => [
        t.skuId,
        { term: t.term, monthlyAlerts: t.monthlyAlerts },
      ]),
    ),
    bufferPct: tenant.renewalBufferPct,
    usageConcealed: usageConcealedOf(tenant),
    now,
  });
}
