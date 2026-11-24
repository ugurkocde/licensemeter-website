import { db } from "~/server/db";
import { auditLog } from "~/server/db/schema";
import type { AccessContext } from "~/server/access";
import type { AuditAction } from "~/server/types";

/**
 * Workspace activity log. Fire-and-forget: auditing must never break the
 * action it records. Rows cascade-delete with the tenant.
 */
export const audit = async (
  ctx: {
    tenant: Pick<AccessContext["tenant"], "id">;
    user: Pick<AccessContext["user"], "oid">;
    membership?: Pick<AccessContext["membership"], "email">;
  },
  action: AuditAction,
  detail: Record<string, unknown> = {},
): Promise<void> => {
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
};
