"use server";

import { appBaseUrl } from "~/env";
import { apiAccess } from "~/server/access";
import {
  approvalPath,
  createConsentHandoff,
  handoffConfigured,
} from "~/server/consentState";

export type ApprovalLinkResult = { link: string } | { error: string } | null;

export const requestApprovalLink = async (
  workspaceId: string,
): Promise<ApprovalLinkResult> => {
  const ctx = await apiAccess("admin");
  if (ctx?.tenant.id !== workspaceId || ctx.tenant.isDemo) {
    return { error: "Open the workspace as an admin and try again." };
  }
  const token =
    handoffConfigured() &&
    (await createConsentHandoff({
      tenantId: workspaceId,
      oid: ctx.user.oid,
      tid: ctx.user.tid,
      name: ctx.user.name || null,
      email: ctx.user.upn || ctx.membership.email,
    }));
  if (!token) {
    return {
      error:
        "An approval link is unavailable. You can retry Grant admin consent below.",
    };
  }
  return { link: new URL(approvalPath(token), appBaseUrl()).href };
};
