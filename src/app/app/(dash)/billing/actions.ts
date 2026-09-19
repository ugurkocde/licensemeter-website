"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { billingEnabled } from "~/env";
import { apiAccess, type AccessContext } from "~/server/access";
import {
  attachWorkspace,
  detachWorkspace,
  type AttachRefusal,
  type DetachRefusal,
} from "~/server/billing/mspAccount";

export type BillingActionResult = { ok: boolean; error?: string };

const fail = (error: string): BillingActionResult => ({ ok: false, error });

const tenantIdSchema = z.string().uuid();

const ATTACH_ERRORS: Record<AttachRefusal, string> = {
  demoUser: "The demo workspace is read-only.",
  noAccount: "Start an MSP plan first, then attach your client workspaces.",
  // The same words for both, so a workspace id cannot be probed.
  notFound: "You need the owner role on a workspace to attach it.",
  notOwner: "You need the owner role on a workspace to attach it.",
  demoWorkspace: "The demo workspace cannot be attached.",
  attachedElsewhere:
    "This workspace is attached to another MSP account. Its owner has to detach it first.",
};

const DETACH_ERRORS: Record<DetachRefusal, string> = {
  noAccount: "You do not have an MSP account.",
  notAttached: "This workspace is not attached to your MSP account.",
};

/**
 * Shared gate of both actions. The owner role on the active workspace opens the
 * controls; who may touch the target workspace is decided in mspAccount against
 * the database, never from the id the client sent.
 */
const gate = async (
  rawTenantId: unknown,
): Promise<{ error: string } | { ctx: AccessContext; tenantId: string }> => {
  if (!billingEnabled()) {
    return { error: "Plans are not used on this install." };
  }
  const ctx = await apiAccess("owner");
  if (!ctx) return { error: "Not allowed" };
  if (ctx.user.isDemo || ctx.tenant.isDemo) {
    return { error: ATTACH_ERRORS.demoUser };
  }
  const parsed = tenantIdSchema.safeParse(rawTenantId);
  if (!parsed.success) return { error: "Unknown workspace" };
  return { ctx, tenantId: parsed.data };
};

// The plan badge lives in the layout, so the whole dashboard is refreshed.
const revalidateApp = () => revalidatePath("/app", "layout");

export async function attachWorkspaceAction(
  tenantId: string,
): Promise<BillingActionResult> {
  const gated = await gate(tenantId);
  if ("error" in gated) return fail(gated.error);
  const result = await attachWorkspace(gated.ctx, gated.tenantId);
  if (!result.ok) return fail(ATTACH_ERRORS[result.reason]);
  revalidateApp();
  return { ok: true };
}

export async function detachWorkspaceAction(
  tenantId: string,
): Promise<BillingActionResult> {
  const gated = await gate(tenantId);
  if ("error" in gated) return fail(gated.error);
  const result = await detachWorkspace(gated.ctx, gated.tenantId);
  if (!result.ok) return fail(DETACH_ERRORS[result.reason]);
  revalidateApp();
  return { ok: true };
}
