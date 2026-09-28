"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { WORKSPACE_COOKIE, workspaceCookieOptions } from "~/server/access";
import {
  acknowledgeAccessDecision,
  ownAccessRequest,
} from "~/server/domainJoin";

/** Returns fresh state. Only an existing membership can open the target workspace. */
export const checkAccessRequest = async (requestId: string) => {
  const session = await auth();
  if (
    !session ||
    session.user.isDemo ||
    !z.string().uuid().safeParse(requestId).success
  )
    return {
      ok: false as const,
      error: "Sign in with the account that requested access and try again.",
    };
  const request = await ownAccessRequest(db, session.user.oid, requestId);
  if (!request)
    return {
      ok: false as const,
      error: "This request is no longer available.",
    };
  if (request.role) {
    if (request.status === "approved")
      await acknowledgeAccessDecision(db, session.user.oid, requestId);
    (await cookies()).set(
      WORKSPACE_COOKIE,
      request.tenantId,
      workspaceCookieOptions(),
    );
    revalidatePath("/app", "layout");
    return {
      ok: true as const,
      status: "approved" as const,
      href: `/app?accessRequest=${requestId}`,
    };
  }
  if (request.status === "approved")
    return {
      ok: false as const,
      error:
        "Your workspace access has been removed. Ask an owner for an invitation.",
    };
  return {
    ok: true as const,
    status: request.status,
    checkedAt: new Date().toISOString(),
  };
};

/** Acknowledge a decline without deleting the request or reopening access. */
export const acknowledgeDeclinedRequest = async (requestId: string) => {
  const session = await auth();
  if (
    !session ||
    session.user.isDemo ||
    !z.string().uuid().safeParse(requestId).success
  )
    return {
      ok: false as const,
      error: "Sign in again to acknowledge this request.",
    };
  const request = await ownAccessRequest(db, session.user.oid, requestId);
  if (request?.status !== "declined")
    return {
      ok: false as const,
      error: "This request is no longer declined. Check its status again.",
    };
  if (!(await acknowledgeAccessDecision(db, session.user.oid, requestId)))
    return {
      ok: false as const,
      error: "The request changed. Check its status again.",
    };
  revalidatePath("/app", "layout");
  return { ok: true as const };
};
