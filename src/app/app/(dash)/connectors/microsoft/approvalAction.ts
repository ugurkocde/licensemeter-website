"use server";

import { and, eq } from "drizzle-orm";

import { apiAccess } from "~/server/access";
import { audit } from "~/server/audit";
import {
  approvalLink,
  createConsentHandoff,
  handoffConfigured,
  pendingApprovalLinks,
} from "~/server/consentState";
import { db } from "~/server/db";
import { consentStates } from "~/server/db/schema";

export type ApprovalLinkResult =
  { link: string; token: string } | { link: null } | { error: string } | null;

export const requestApprovalLink = async (
  workspaceId: string,
): Promise<ApprovalLinkResult> => {
  const ctx = await apiAccess("admin");
  if (ctx?.tenant.id !== workspaceId || ctx.tenant.isDemo) {
    return { error: "Open the workspace as an admin and try again." };
  }
  const result =
    handoffConfigured() &&
    (await createConsentHandoff({
      tenantId: workspaceId,
      oid: ctx.user.oid,
      tid: ctx.user.tid,
      name: ctx.user.name || null,
      email: ctx.user.upn || ctx.membership.email,
    }));
  if (!result) {
    return {
      error:
        "An approval link is unavailable. You can retry Grant admin consent below.",
    };
  }
  if (result.created) await audit(ctx, "microsoft_approval_link_created");
  return { link: approvalLink(result.state), token: result.state };
};

export const revokeApprovalLink = async (
  workspaceId: string,
  token: string,
): Promise<ApprovalLinkResult> => {
  const ctx = await apiAccess("admin");
  if (ctx?.tenant.id !== workspaceId || ctx.tenant.isDemo) {
    return { error: "Open the workspace as an admin and try again." };
  }
  const removed = await db
    .delete(consentStates)
    .where(
      and(pendingApprovalLinks(workspaceId), eq(consentStates.state, token)),
    )
    .returning({ state: consentStates.state });
  if (removed.length) await audit(ctx, "microsoft_approval_link_revoked");
  return { link: null };
};
