import { desc, eq, and, inArray } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { apiAccess } from "~/server/access";
import { audit } from "~/server/audit";
import { db } from "~/server/db";
import { findings } from "~/server/db/schema";
import { withTenant } from "~/server/db/tenant";
import { isWasteRule } from "~/lib/rules";
import { generateRemediationScript } from "~/server/waste/remediation";

/** Generated PowerShell remediation script for open findings (optionally one rule). */
export const GET = async (req: NextRequest) => {
  const ctx = await apiAccess("admin");
  if (!ctx)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Validate the requested rule against the canonical allow-list (lib/rules);
  // an unknown ?rule= is ignored and the script covers every applicable rule.
  const ruleParam = req.nextUrl.searchParams.get("rule");
  const rule = ruleParam && isWasteRule(ruleParam) ? ruleParam : undefined;
  // ?sku= narrows the script to one Microsoft subscription (the renewal
  // plan's per-SKU export). Only GUID-shaped ids are accepted.
  const skuParam = req.nextUrl.searchParams.get("sku");
  const skuId =
    skuParam && /^[0-9a-f-]{36}$/i.test(skuParam) ? skuParam : undefined;

  return withTenant(db, ctx.tenant.id, async () => {
    const rows = await db.query.findings.findMany({
      where: and(
        eq(findings.tenantId, ctx.tenant.id),
        inArray(findings.status, ["open", "acknowledged"]),
        ...(rule ? [eq(findings.rule, rule)] : []),
      ),
      orderBy: desc(findings.monthlyImpactCents),
    });

    await audit(ctx, "export_remediation", {
      rows: rows.length,
      rule: rule ?? "all",
      ...(skuId ? { skuId } : {}),
    });
    const script = generateRemediationScript(rows, { skuId });
    return new Response(script, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="licensemeter-remediation${rule ? `-${rule}` : ""}${skuId ? `-${skuId.slice(0, 8)}` : ""}.ps1"`,
        "Cache-Control": "private, no-store",
      },
    });
  });
};
