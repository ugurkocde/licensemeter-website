"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  apiAccess,
  apiFeatureAccess,
  type AccessContext,
} from "~/server/access";
import {
  createToken,
  MAX_ACTIVE_TOKENS,
  revokeToken,
  TOKEN_NAME_MAX,
} from "~/server/mcp/tokens";
import { audit } from "~/server/audit";
import { rateLimitDurable } from "~/server/rateLimit";

export type CreateMcpTokenResult =
  { ok: true; token: string; name: string } | { ok: false; error: string };

export type RevokeMcpTokenResult = { ok: boolean; error?: string };

const nameSchema = z.string().trim().min(1).max(TOKEN_NAME_MAX);
const tokenIdSchema = z.string().uuid();

type Gate = { ctx: AccessContext } | { error: string };

const DEMO_ERROR =
  "The demo workspace is read-only. Connect your own tenant to create tokens.";

/**
 * Gate for creating a token: owner or admin of the active workspace, and the
 * workspace's plan includes MCP. Both are decided here on the server; the page
 * only hides the controls. The shared demo workspace keeps its tokens fixed.
 */
const createGate = async (): Promise<Gate> => {
  const access = await apiFeatureAccess("mcp", "admin");
  if (access.denied === "featureRequired") {
    return { error: "The MCP server is not included in your plan." };
  }
  if (!access.ctx) return { error: "Not allowed" };
  if (access.ctx.tenant.isDemo || access.ctx.user.isDemo) {
    return { error: DEMO_ERROR };
  }
  return { ctx: access.ctx };
};

/**
 * Gate for revoking: the role only. Revoking takes access away, so it stays
 * possible after a downgrade, when the endpoint already refuses the token.
 */
const revokeGate = async (): Promise<Gate> => {
  const ctx = await apiAccess("admin");
  if (!ctx) return { error: "Not allowed" };
  if (ctx.tenant.isDemo || ctx.user.isDemo) return { error: DEMO_ERROR };
  return { ctx };
};

export async function createMcpTokenAction(
  formData: FormData,
): Promise<CreateMcpTokenResult> {
  const gated = await createGate();
  if ("error" in gated) return { ok: false, error: gated.error };
  const { ctx } = gated;

  const name = nameSchema.safeParse(formData.get("name"));
  if (!name.success) {
    return {
      ok: false,
      error: `Give the token a name of up to ${TOKEN_NAME_MAX} characters.`,
    };
  }
  if (
    !(await rateLimitDurable(`mcp-token:${ctx.tenant.id}`, 20, 60 * 60 * 1000))
  ) {
    return {
      ok: false,
      error: "Too many tokens created this hour, please try again later.",
    };
  }

  const created = await createToken({
    tenantId: ctx.tenant.id,
    name: name.data,
    createdByKey: ctx.user.oid,
  });
  if (!created.ok) {
    return {
      ok: false,
      error: `A workspace can have ${MAX_ACTIVE_TOKENS} active tokens. Revoke one first.`,
    };
  }

  await audit(ctx, "mcp_token_created", {
    tokenId: created.summary.id,
    name: created.summary.name,
    prefix: created.summary.tokenPrefix,
  });

  revalidatePath("/app/mcp");
  return { ok: true, token: created.token, name: created.summary.name };
}

export async function revokeMcpTokenAction(
  tokenId: string,
): Promise<RevokeMcpTokenResult> {
  const gated = await revokeGate();
  if ("error" in gated) return { ok: false, error: gated.error };
  const { ctx } = gated;

  const id = tokenIdSchema.safeParse(tokenId);
  // The workspace id is part of the match, so an id from another workspace
  // reads the same as one that does not exist.
  const revoked = id.success ? await revokeToken(ctx.tenant.id, id.data) : null;
  if (!revoked) return { ok: false, error: "Token not found" };

  await audit(ctx, "mcp_token_revoked", {
    tokenId: revoked.id,
    name: revoked.name,
    prefix: revoked.tokenPrefix,
  });

  revalidatePath("/app/mcp");
  return { ok: true };
}
