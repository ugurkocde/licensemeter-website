import { db, type Db } from "~/server/db";
import { auditLog } from "~/server/db/schema";
import type { AccessContext } from "~/server/access";
import type { AuditAction } from "~/server/types";

/**
 * Who performed an application action. The approver of a consent handoff has
 * no membership in the workspace, so the email is optional.
 */
type ApplicationAuditContext = {
  tenant: Pick<AccessContext["tenant"], "id">;
  user: Pick<AccessContext["user"], "oid">;
  membership?: Pick<AccessContext["membership"], "email">;
};

type SystemAuditContext = {
  tenantId: string;
  actorOid: string;
  transaction: Db;
};

/**
 * Workspace activity log. Application auditing is fire-and-forget: it must
 * never break the action it records. System repair audits are atomic and
 * written inside the caller's transaction. Rows cascade-delete with the tenant.
 */
export function audit(
  ctx: ApplicationAuditContext,
  action: AuditAction,
  detail?: Record<string, unknown>,
): Promise<void>;
export function audit(
  ctx: SystemAuditContext,
  action: AuditAction,
  detail?: Record<string, unknown>,
): Promise<string>;
export async function audit(
  ctx: ApplicationAuditContext | SystemAuditContext,
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
      actorEmail: ctx.membership?.email,
      action,
      detail,
    });
  } catch (err) {
    console.error("[audit] write failed", err);
  }
}
