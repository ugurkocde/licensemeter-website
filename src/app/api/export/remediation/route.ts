import { desc, eq, and, inArray } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { apiAccess } from "~/server/access";
import { audit } from "~/server/audit";
import { db } from "~/server/db";
import { findings } from "~/server/db/schema";
import { generateRemediationScript } from "~/server/waste/remediation";
import type { WasteRuleId } from "~/server/types";

const RULES: WasteRuleId[] = [
  "disabled_account_with_license",
  "never_active",
  "inactive_90d",
  "shelfware",
  "copilot_unused",
  "licensed_guest",
];

/** Generated PowerShell remediation script for open findings (optionally one rule). */
export const GET = async (req: NextRequest) => {
  const ctx = await apiAccess("admin");
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!ctx.entitlement.active)
    return NextResponse.json({ error: "upgrade_required" }, { status: 402 });

  const ruleParam = req.nextUrl.searchParams.get("rule");
  const rule = RULES.find((r) => r === ruleParam);

  const rows = await db.query.findings.findMany({
    where: and(
      eq(findings.tenantId, ctx.tenant.id),
      inArray(findings.status, ["open", "acknowledged"]),
      ...(rule ? [eq(findings.rule, rule)] : []),
    ),
    orderBy: desc(findings.monthlyImpactCents),
  });

  await audit(ctx, "export_remediation", { rows: rows.length, rule: rule ?? "all" });
  const script = generateRemediationScript(rows);
  return new Response(script, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="licensemeter-remediation${rule ? `-${rule}` : ""}.ps1"`,
    },
  });
};
