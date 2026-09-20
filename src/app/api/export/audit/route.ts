import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { apiAccess } from "~/server/access";
import { audit } from "~/server/audit";
import { csvResponse, toCsv } from "~/server/csv";
import { db } from "~/server/db";
import { auditLog } from "~/server/db/schema";
import { withTenant } from "~/server/db/tenant";

export const GET = async () => {
  const ctx = await apiAccess("admin");
  if (!ctx)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return withTenant(db, ctx.tenant.id, async () => {
    const entries = await db.query.auditLog.findMany({
      where: eq(auditLog.tenantId, ctx.tenant.id),
      orderBy: desc(auditLog.createdAt),
      limit: 10_000,
    });
    const csv = toCsv([
      ["Timestamp", "Action", "Actor email", "Actor ID", "Detail JSON"],
      ...entries.map((entry) => [
        entry.createdAt.toISOString(),
        entry.action,
        entry.actorEmail,
        entry.actorOid,
        JSON.stringify(entry.detail),
      ]),
    ]);
    await audit(ctx, "export_audit_log_csv", { rows: entries.length });
    return csvResponse("licensemeter-audit-log.csv", csv);
  });
};
