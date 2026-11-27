import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import { workspaceLabel } from "~/lib/format";
import { db } from "~/server/db";
import { findings, type TenantRow } from "~/server/db/schema";
import { hasFeature, type Entitlement } from "~/server/entitlement";
import { loadWasteHistory } from "~/server/historyStore";
import { loadRenewalPlan } from "~/server/renewals/loadPlan";
import { loadSavingsLedger } from "~/server/savings/ledger";
import { loadLicenseSpend } from "~/server/waste/spendStore";
import {
  buildExecutiveSummary,
  executiveTeaserOf,
  type ExecutiveSummary,
} from "./executiveSummary";

type ExecutiveTenant = Pick<
  TenantRow,
  | "id"
  | "name"
  | "tid"
  | "currency"
  | "renewalBufferPct"
  | "concealedNames"
  | "activitySignal"
  | "usageReportUnavailable"
>;

/**
 * Everything the executive report shows for one workspace: spend, open waste
 * by rule, the savings ledger, the renewal actions due in the next 90 days
 * (from the renewal savings plan) and a 6-month trend. Run inside withTenant.
 *
 * Findings are read as rule and impact only, so no user identifier is ever
 * loaded for this report. Without the execReport feature the result is the
 * teaser: headline totals only.
 */
export async function loadExecutiveSummary(
  tenant: ExecutiveTenant,
  entitlement: Entitlement,
  now = new Date(),
): Promise<ExecutiveSummary> {
  const full = hasFeature(entitlement, "execReport");
  const inventory = await loadLicenseSpend(tenant.id);
  const [open, plan, history, ledger] = await Promise.all([
    db
      .select({
        rule: findings.rule,
        monthlyImpactCents: findings.monthlyImpactCents,
      })
      .from(findings)
      .where(
        and(
          eq(findings.tenantId, tenant.id),
          inArray(findings.status, ["open", "acknowledged"]),
        ),
      ),
    loadRenewalPlan(tenant, now, inventory),
    loadWasteHistory(tenant.id, entitlement, { now }),
    full && hasFeature(entitlement, "savingsLedger")
      ? loadSavingsLedger(tenant.id, tenant.currency, now)
      : null,
  ]);
  const summary = buildExecutiveSummary({
    workspace: workspaceLabel(tenant),
    currency: tenant.currency,
    now,
    monthlySpendCents: inventory.spend.totalCents,
    findings: open,
    ledger,
    plan,
    snapshots: history.rows,
  });
  return full ? summary : executiveTeaserOf(summary);
}
