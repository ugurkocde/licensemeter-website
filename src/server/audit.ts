import { db, type Db } from "~/server/db";
import { auditLog } from "~/server/db/schema";
import type { AccessContext } from "~/server/access";
import type { AuditAction } from "~/server/types";

type SystemAuditContext = {
  tenantId: string;
  actorOid: string;
  transaction: Db;
};

/** Application auditing is best effort. System repair audits are atomic. */
export function audit(
  ctx: AccessContext,
  action: AuditAction,
  detail?: Record<string, unknown>,
): Promise<void>;
export function audit(
  ctx: SystemAuditContext,
  action: AuditAction,
  detail?: Record<string, unknown>,
): Promise<string>;
export async function audit(
  ctx: AccessContext | SystemAuditContext,
  action: AuditAction,
  detail: Record<string, unknown> = {},
): Promise<string | void> {
  if ("transaction" in ctx) {
    const [row] = await ctx.transaction
      .insert(auditLog)
      .values({
        tenantId: ctx.tenantId,
        actorOid: ctx.actorOid,
        action,
        detail,
      })
      .returning({ id: auditLog.id });
    if (!row) throw new Error("System audit entry was not recorded");
    return row.id;
  }

  try {
    await db.insert(auditLog).values({
      tenantId: ctx.tenant.id,
      actorOid: ctx.user.oid,
      actorEmail: ctx.membership.email,
      action,
      detail,
    });
  } catch (err) {
    console.error("[audit] write failed", err);
  }
}
